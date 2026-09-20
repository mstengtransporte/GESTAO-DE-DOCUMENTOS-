// ============================================================================
// APP.JS — Lógica do PWA do Motorista
// Scanner de QR Code / Foto do painel (auditoria) / KM digitado manualmente
// Modo Offline (IndexedDB) / Sincronização Supabase
// ============================================================================

// ---------------------------------------------------------------------------
// -1. PAINEL DE DEBUG NA TELA + CAPTURA GLOBAL DE ERROS
// -----------------------------------------------------------------------
// Isto tem que ser a PRIMEIRA coisa do arquivo. Motivo: em JS "vanilla" sem
// módulos, se qualquer instrução no nível raiz do script lançar um erro
// (ex: a lib do Supabase não carregou do CDN a tempo), o navegador aborta
// TODO o restante do arquivo silenciosamente — nenhum addEventListener()
// mais abaixo chega a ser executado, e por isso os botões "não fazem nada".
// Registrando o listener de erro ANTES de tudo, qualquer falha (mesmo as
// que acontecem 2 linhas abaixo) fica visível em vez de sumir no vácuo.
// Deixe DEBUG = true enquanto estiver investigando o problema em produção;
// pode voltar para false depois que tudo estiver funcionando.
// ---------------------------------------------------------------------------
// Deixe true temporariamente se precisar investigar algum problema em
// produção (mostra um botão 🐞 flutuante com logs em tempo real). Por
// padrão fica false para não expor nada de debug para o motorista.
const DEBUG = false;
const debugLines = [];

function debugLog(msg, level = 'info') {
  const ts = new Date().toLocaleTimeString('pt-BR');
  debugLines.push({ line: `[${ts}] ${msg}`, level });
  if (level === 'error') console.error('[DEBUG]', msg);
  else if (level === 'warn') console.warn('[DEBUG]', msg);
  else console.log('[DEBUG]', msg);
  renderDebugPanel();
}

function renderDebugPanel() {
  const body = document.getElementById('debugPanelBody');
  if (!body) return;
  const colors = { info: '#9AB3D9', warn: '#FFC93C', error: '#FF6B7A' };
  body.innerHTML = debugLines.slice(-80).map((l) =>
    `<div style="color:${colors[l.level]};border-bottom:1px solid #2A3B5C55;padding:3px 0;white-space:pre-wrap;word-break:break-word;">${l.line}</div>`
  ).join('');
  body.scrollTop = body.scrollHeight;
  const toggle = document.getElementById('debugToggle');
  if (toggle) {
    const hasErrors = debugLines.some((l) => l.level === 'error');
    toggle.style.background = hasErrors ? '#7A1620' : '#1B3F91';
  }
}

function criarPainelDebug() {
  if (!DEBUG || document.getElementById('debugPanel') || !document.body) return;

  const btn = document.createElement('button');
  btn.id = 'debugToggle';
  btn.textContent = '🐞';
  btn.title = 'Painel de debug (ESF)';
  btn.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:99999;width:42px;height:42px;border-radius:50%;background:#1B3F91;color:#fff;border:2px solid #2F9BFF;font-size:18px;box-shadow:0 4px 14px rgba(0,0,0,.5);cursor:pointer;';

  const panel = document.createElement('div');
  panel.id = 'debugPanel';
  panel.style.cssText = 'display:none;position:fixed;left:8px;right:8px;bottom:64px;max-height:50vh;background:#0A1220;border:1px solid #2F9BFF88;border-radius:12px;z-index:99999;flex-direction:column;font-family:monospace;font-size:11px;box-shadow:0 8px 30px rgba(0,0,0,.6);color:#EAF3FF;';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #2A3B5C;background:#101A2E;border-radius:12px 12px 0 0;">
      <strong style="color:#2F9BFF;">Debug — ESF</strong>
      <div>
        <button id="debugRetest" style="background:none;border:1px solid #2A3B5C;color:#EAF3FF;border-radius:6px;padding:2px 8px;margin-right:4px;">Testar conexão</button>
        <button id="debugClear" style="background:none;border:1px solid #2A3B5C;color:#EAF3FF;border-radius:6px;padding:2px 8px;">Limpar</button>
      </div>
    </div>
    <div id="debugPanelBody" style="overflow-y:auto;padding:8px 10px;flex:1;"></div>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  btn.onclick = () => { panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'; };
  document.getElementById('debugClear').onclick = () => { debugLines.length = 0; renderDebugPanel(); };
  document.getElementById('debugRetest').onclick = () => testarConexaoSupabase();

  renderDebugPanel();
}

// captura QUALQUER erro não tratado do restante da aplicação
window.addEventListener('error', (e) => {
  debugLog(`ERRO JS NÃO TRATADO: ${e.message} — ${(e.filename || '').split('/').pop()}:${e.lineno}`, 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason && e.reason.message ? e.reason.message : JSON.stringify(e.reason);
  debugLog(`PROMISE REJEITADA SEM TRATAMENTO: ${msg}`, 'error');
});

criarPainelDebug();

debugLog('app.js começou a executar.');

// ---------------------------------------------------------------------------
// 0. CONFIGURAÇÃO — troque pelos dados do SEU projeto Supabase
// (Project Settings > API no painel do Supabase)
// ---------------------------------------------------------------------------
const SUPABASE_URL = 'https://bddjdpyfypsiwnirbyhv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZGpkcHlmeXBzaXduaXJieWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NDk1MjgsImV4cCI6MjEwMDQyNTUyOH0.0HnH7caYH6sLp5n68izQXqbCJ-cLqTyxELl1EqoHHww';
const BUCKET = 'fotos';
const BUCKET_COMPROVANTES = 'comprovantes';
// compressão da foto do painel antes do upload: redimensiona para no
// máximo 800x600 e ajusta a qualidade até cair entre 30 KB e 50 KB
const FOTO_MAX_LARGURA = 800;
const FOTO_MAX_ALTURA = 600;
const FOTO_MIN_BYTES = 30 * 1024; // 30 KB
const FOTO_MAX_BYTES = 50 * 1024; // 50 KB

// IMPORTANTE — leia isto se o app "não faz nada" em produção:
// Este é um site estático (sem etapa de build). A Vercel NÃO injeta
// "Environment Variables" configuradas no dashboard dentro de arquivos
// .js servidos como estão — isso só aconteceria se houvesse um passo de
// build lendo process.env, o que este projeto não tem. Ou seja: só
// configurar SUPABASE_URL/SUPABASE_ANON_KEY como env vars na Vercel NÃO
// tem efeito nenhum aqui. Os valores têm que estar escritos literalmente
// nas duas linhas acima (e nas equivalentes em admin.js).
if (SUPABASE_URL.includes('SEU-PROJETO') || SUPABASE_ANON_KEY.includes('SUA-CHAVE')) {
  debugLog('SUPABASE_URL / SUPABASE_ANON_KEY ainda estão com o valor de exemplo (placeholder). Edite as constantes no topo do app.js com os dados reais do seu projeto Supabase.', 'error');
}

let supabaseClient = null;
try {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('A biblioteca @supabase/supabase-js não carregou (script do CDN falhou, foi bloqueado, ou a conexão caiu). Confira a aba Network do DevTools.');
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  debugLog('Cliente Supabase criado com sucesso.');
} catch (err) {
  debugLog('FALHA AO CRIAR O CLIENTE SUPABASE: ' + err.message, 'error');
}

// usado no início de toda função que precisa do Supabase, para falhar de
// forma visível e controlada em vez de quebrar o app inteiro
function supabaseReady() {
  if (!supabaseClient) {
    debugLog('Tentativa de usar o Supabase, mas o cliente não foi inicializado.', 'error');
    toast('Erro de configuração do Supabase — veja o painel de debug (🐞) no canto da tela.', 'error');
    return false;
  }
  return true;
}

// teste de conectividade real: roda no carregamento e pode ser repetido
// clicando em "Testar conexão" no painel de debug
async function testarConexaoSupabase() {
  if (!supabaseReady()) return;
  debugLog('Testando conexão com o Supabase (SELECT em "obras")...');
  try {
    const { data, error, status } = await supabaseClient.from('obras').select('id').limit(1);
    if (error) {
      debugLog(`Falha na consulta de teste — status ${status}: ${error.message} (code: ${error.code || '—'})`, 'error');
      if (error.message && error.message.toLowerCase().includes('fetch')) {
        debugLog('Isso geralmente é URL do projeto errada/offline, ou bloqueio de rede/CORS.', 'warn');
      }
      if (status === 401 || status === 403 || (error.message || '').toLowerCase().includes('rls') || (error.message || '').toLowerCase().includes('policy')) {
        debugLog('Parece bloqueio de RLS (Row Level Security) — confira as policies da tabela no Supabase.', 'warn');
      }
      return;
    }
    debugLog(`Conexão OK. Consulta de teste retornou ${data.length} registro(s).`);
  } catch (err) {
    debugLog('Erro de rede ao tentar falar com o Supabase: ' + err.message, 'error');
    debugLog('Confira: 1) SUPABASE_URL está correta e o projeto está ativo; 2) sem bloqueador de rede/CORS.', 'warn');
  }
}

// wrapper seguro para registrar listeners: se o elemento não existir no
// DOM, ou se o handler lançar um erro, isso fica visível no painel de
// debug em vez de travar o resto do script silenciosamente.
function on(id, evento, handler) {
  const el = document.getElementById(id);
  if (!el) {
    debugLog(`Elemento #${id} não encontrado no HTML — o listener de "${evento}" não foi registrado.`, 'error');
    return;
  }
  el.addEventListener(evento, async (e) => {
    try {
      await handler(e);
    } catch (err) {
      console.error(err);
      debugLog(`Erro ao executar a ação de #${id} (${evento}): ${err.message}`, 'error');
      toast('Ocorreu um erro inesperado. Toque no ícone 🐞 para ver os detalhes.', 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// 1. ESTADO GLOBAL
// ---------------------------------------------------------------------------
const state = {
  veiculo: null,          // { veiculo_id, placa, modelo, ultimo_km, escala_aberta_id, qr_code_id }
  escalaInfo: null,       // detalhes da escala aberta (quando check-out)
  tipoOperacao: null,     // 'check-in' | 'check-out'
  obras: [],
  motoristas: [],
  fotoBlob: null,
  fotoExtensao: null,
  html5QrCode: null,
  cameraStream: null,
  // --- fluxo de abastecimento (independente do check-in/check-out) ---
  modoScanner: 'checkin',      // 'checkin' | 'abastecimento' — para onde o QR lido deve rotear
  todosVeiculos: [],            // cache local para o dropdown de seleção manual
  veiculoAbastecimento: null,   // { veiculo_id, placa, modelo, ultimo_km }
  comprovanteBlob: null,
  comprovanteExtensao: null
};

// ---------------------------------------------------------------------------
// 2. INDEXEDDB — fila offline + cache local
// ---------------------------------------------------------------------------
const DB_NAME = 'frota-offline-db';
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('fila')) {
        db.createObjectStore('fila', { keyPath: 'localId' });
      }
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbPut(store, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(store, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(store, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// cache simples de chave/valor (obras, motoristas, veículo atual, escalas abertas locais)
async function cacheSet(key, value) {
  await idbPut('cache', { key, value });
}
async function cacheGet(key) {
  const row = await idbGet('cache', key);
  return row ? row.value : null;
}

// ---------------------------------------------------------------------------
// 3. STATUS DE CONEXÃO
// ---------------------------------------------------------------------------
function updateConnStatus() {
  const dot = document.getElementById('connDot');
  const text = document.getElementById('connText');
  const bar = document.getElementById('connStatus');
  if (navigator.onLine) {
    // cor fixa em azul (não depende de nenhuma variável de tema
    // compartilhada, pra nunca correr risco de puxar um tom esverdeado)
    bar.className = 'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors text-ink';
    bar.style.background = '#0B3A66';
    dot.className = 'w-2 h-2 rounded-full';
    dot.style.background = '#3FC7FF';
    text.textContent = 'Conectado ao servidor';
  } else {
    bar.className = 'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors bg-yellow-dim text-ink';
    bar.style.background = '';
    dot.className = 'w-2 h-2 rounded-full bg-yellow';
    dot.style.background = '';
    text.textContent = 'Modo Offline';
  }
  refreshPendingBadge();
}

async function refreshPendingBadge() {
  const fila = await idbGetAll('fila');
  const badge = document.getElementById('pendingBadge');
  if (fila.length > 0) {
    badge.classList.remove('hidden');
    badge.textContent = navigator.onLine
      ? `Sincronizando ${fila.length}...`
      : `${fila.length} registro(s) salvos no aparelho aguardando sincronização`;
  } else {
    badge.classList.add('hidden');
  }
}

window.addEventListener('online', () => { updateConnStatus(); sincronizarFila(); });
window.addEventListener('offline', updateConnStatus);

// ---------------------------------------------------------------------------
// 4. TOAST / FEEDBACK
// ---------------------------------------------------------------------------
function toast(msg, kind = 'info') {
  const el = document.getElementById('toast');
  const colors = {
    info: 'bg-surface2 border border-line text-ink',
    success: 'bg-green-dim border border-green/50 text-ink',
    error: 'bg-red-dim border border-red/50 text-ink',
    warn: 'bg-yellow-dim border border-yellow/50 text-ink'
  };
  el.className = `${colors[kind]} fixed left-1/2 -translate-x-1/2 bottom-6 max-w-[90%] px-5 py-3 rounded-xl font-medium text-sm shadow-xl z-50`;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

function vibrarEBipe() {
  if (navigator.vibrate) navigator.vibrate(120);
  const audio = document.getElementById('beepSound');
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

// ---------------------------------------------------------------------------
// 5. NAVEGAÇÃO ENTRE TELAS
// ---------------------------------------------------------------------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ---------------------------------------------------------------------------
// 6. CARREGAR OBRAS E MOTORISTAS (com cache offline)
// ---------------------------------------------------------------------------
async function carregarListasBase() {
  if (navigator.onLine && supabaseReady()) {
    try {
      const [{ data: obras, error: e1 }, { data: motoristas, error: e2 }] = await Promise.all([
        supabaseClient.from('obras').select('*').eq('status', 'ativa').order('nome'),
        supabaseClient.from('funcionarios').select('*').eq('ativo', true).order('nome')
      ]);
      if (e1 || e2) throw (e1 || e2);
      state.obras = obras;
      state.motoristas = motoristas;
      await cacheSet('obras', obras);
      await cacheSet('motoristas', motoristas);
      debugLog(`Listas base carregadas: ${obras.length} obra(s), ${motoristas.length} motorista(s).`);
    } catch (err) {
      debugLog('Falha ao buscar obras/motoristas online, usando cache local: ' + err.message, 'warn');
      state.obras = (await cacheGet('obras')) || [];
      state.motoristas = (await cacheGet('motoristas')) || [];
    }
  } else {
    state.obras = (await cacheGet('obras')) || [];
    state.motoristas = (await cacheGet('motoristas')) || [];
  }

  const selObra = document.getElementById('selectObra');
  const selMot = document.getElementById('selectMotorista');
  selObra.innerHTML = state.obras.map((o) => `<option value="${o.id}" data-limite="${o.km_limite_diario}">${o.nome} (limite ${o.km_limite_diario} km/dia)</option>`).join('');
  selMot.innerHTML = state.motoristas.map((m) => `<option value="${m.id}">${m.nome}</option>`).join('');
}

// ---------------------------------------------------------------------------
// 7. BUSCAR VEÍCULO (por QR ou placa) — online ou no cache local
// ---------------------------------------------------------------------------
async function buscarVeiculoPorQr(qrCodeId) {
  if (navigator.onLine) {
    const { data, error } = await supabaseClient
      .from('v_ultimos_kms')
      .select('*')
      .eq('qr_code_id', qrCodeId)
      .maybeSingle();
    if (error) throw error;
    if (data) await cacheVeiculo(data);
    return data;
  }
  const cache = (await cacheGet('veiculos')) || {};
  return Object.values(cache).find((v) => v.qr_code_id === qrCodeId) || null;
}

// Busca o veículo pela placa. Consulta primeiro a tabela "veiculos" (fonte
// de verdade, simples e direta) e, se encontrar, complementa com o último
// KM e a escala em aberto vindos da view v_ultimos_kms.
async function buscarVeiculoPorPlaca(placaDigitada) {
  const placaNorm = placaDigitada.trim().toUpperCase();

  if (navigator.onLine) {
    if (!supabaseReady()) throw new Error('Cliente Supabase não inicializado — confira SUPABASE_URL/SUPABASE_ANON_KEY em app.js.');

    debugLog(`Consultando: veiculos.select('*').eq('placa','${placaNorm}')`);
    const { data, error, status } = await supabaseClient
      .from('veiculos')
      .select('*')
      .eq('placa', placaNorm);

    debugLog(`Resposta Supabase — status ${status}, ${data ? data.length : 0} registro(s) encontrados${error ? ', erro: ' + error.message : ''}`, error ? 'error' : 'info');

    if (error) throw error;
    if (!data || data.length === 0) return null;

    const veiculoBase = data[0];

    // complementa com último KM / escala em aberto (não é fatal se falhar)
    const { data: viewData, error: viewError } = await supabaseClient
      .from('v_ultimos_kms')
      .select('*')
      .eq('veiculo_id', veiculoBase.id)
      .maybeSingle();

    if (viewError) {
      debugLog('Aviso: falha ao ler v_ultimos_kms, usando dados básicos da tabela veiculos: ' + viewError.message, 'warn');
    }

    const veiculo = viewData || {
      veiculo_id: veiculoBase.id,
      placa: veiculoBase.placa,
      modelo: veiculoBase.modelo,
      qr_code_id: veiculoBase.qr_code_id,
      status: veiculoBase.status,
      ultimo_km: veiculoBase.km_inicial,
      escala_aberta_id: null
    };

    await cacheVeiculo(veiculo);
    return veiculo;
  }

  // offline: procura no cache local (último resultado sincronizado)
  const cache = (await cacheGet('veiculos')) || {};
  return Object.values(cache).find((v) => v.placa.toUpperCase() === placaNorm) || null;
}

async function cacheVeiculo(v) {
  const cache = (await cacheGet('veiculos')) || {};
  cache[v.veiculo_id] = v;
  await cacheSet('veiculos', cache);
}

// atualiza o cache local de "escala aberta" de um veículo (usado offline)
async function setEscalaAbertaLocal(veiculoId, escalaId) {
  const cache = (await cacheGet('veiculos')) || {};
  if (cache[veiculoId]) {
    cache[veiculoId].escala_aberta_id = escalaId;
    await cacheSet('veiculos', cache);
  }
}

// ---------------------------------------------------------------------------
// 8. QR CODE SCANNER
// ---------------------------------------------------------------------------
on('btnScan', 'click', () => iniciarScanner('checkin'));
on('btnCancelScan', 'click', pararScanner);

async function iniciarScanner(modo = 'checkin') {
  state.modoScanner = modo;
  showScreen('screen-scanner');
  const qrRegion = document.getElementById('qr-reader');
  qrRegion.innerHTML = '';
  state.html5QrCode = new Html5Qrcode('qr-reader');
  try {
    await state.html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      onQrSuccess,
      () => {} // erro por frame (sem QR visível) — ignorar silenciosamente
    );
  } catch (err) {
    toast('Não foi possível acessar a câmera. Verifique as permissões.', 'error');
    showScreen(state.modoScanner === 'abastecimento' ? 'screen-abastecimento' : 'screen-home');
  }
}

async function pararScanner() {
  await pararScannerSeAtivo();
  showScreen(state.modoScanner === 'abastecimento' ? 'screen-abastecimento' : 'screen-home');
}

async function onQrSuccess(decodedText) {
  await pararScannerSeAtivo();
  vibrarEBipe();
  if (state.modoScanner === 'abastecimento') {
    await resolverVeiculoAbastecimentoPorQr(decodedText.trim());
  } else {
    await resolverVeiculoPorQrEAbrirForm(decodedText.trim());
  }
}

// para o scanner de câmera se ele estiver ativo, SEM navegar de tela
// (usado antes da busca manual e antes de processar a leitura do QR, para
// nunca deixar a câmera presa em segundo plano)
async function pararScannerSeAtivo() {
  if (!state.html5QrCode) return;
  try {
    await state.html5QrCode.stop();
    state.html5QrCode.clear();
    debugLog('Scanner de câmera parado.');
  } catch (e) {
    debugLog('Scanner já estava parado (ok).', 'info');
  } finally {
    state.html5QrCode = null;
  }
}

async function resolverVeiculoPorQrEAbrirForm(qrCodeId) {
  try {
    const veiculo = await buscarVeiculoPorQr(qrCodeId);
    if (!veiculo) {
      toast('Veículo não encontrado para este QR Code.', 'error');
      debugLog(`QR lido (${qrCodeId}) não corresponde a nenhum veículo cadastrado.`, 'warn');
      showScreen('screen-home');
      return;
    }

    state.veiculo = veiculo;
    document.getElementById('modalQrPlaca').textContent = veiculo.placa;
    document.getElementById('modalQrOk').classList.remove('hidden');
    setTimeout(() => document.getElementById('modalQrOk').classList.add('hidden'), 1400);

    await carregarListasBase();
    await abrirFormulario(veiculo);
  } catch (err) {
    console.error(err);
    debugLog('Erro ao resolver veículo via QR: ' + err.message, 'error');
    toast('Erro ao buscar o veículo pelo QR Code.', 'error');
    showScreen('screen-home');
  }
}

// ---------------------------------------------------------------------------
// 9. PLACA MANUAL (contingência para QR Code danificado, sujo ou ilegível)
// ---------------------------------------------------------------------------
on('btnManualPlate', 'click', () => showScreen('screen-manual-plate'));
on('btnCancelManual', 'click', () => showScreen('screen-home'));
on('btnBuscarPlaca', 'click', buscarPlacaManualClick);

async function buscarPlacaManualClick() {
  const input = document.getElementById('inputManualPlate');
  const placaDigitada = (input.value || '').trim().toUpperCase();
  debugLog(`Botão "Buscar veículo" clicado. Placa digitada: "${placaDigitada}"`);

  if (!placaDigitada) {
    toast('Digite a placa do veículo.', 'warn');
    return;
  }

  // 1) garante que o scanner de câmera está parado ANTES de buscar
  //    (não navega de tela — o usuário continua na tela de placa manual)
  await pararScannerSeAtivo();

  const btn = document.getElementById('btnBuscarPlaca');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Buscando...';

  try {
    // 2) consulta o Supabase (veiculos.select('*').eq('placa', placaDigitada))
    const veiculo = await buscarVeiculoPorPlaca(placaDigitada);

    // 3) trata "não encontrado" com mensagem visual clara
    if (!veiculo) {
      toast(`Nenhum veículo encontrado com a placa "${placaDigitada}".`, 'error');
      debugLog(`Nenhum veículo encontrado para a placa "${placaDigitada}".`, 'warn');
      return;
    }

    state.veiculo = veiculo;
    toast(`Veículo ${veiculo.placa} encontrado!`, 'success');
    debugLog('Veículo resolvido: ' + JSON.stringify(veiculo));

    // 4) esconde a tela de busca e mostra o formulário de check-in/check-out
    await carregarListasBase();
    await abrirFormulario(veiculo); // showScreen('screen-form') dentro desta função já esconde as demais telas
  } catch (err) {
    console.error(err);
    debugLog('Erro na busca manual por placa: ' + err.message, 'error');
    toast('Erro ao buscar o veículo. Verifique sua conexão ou tente novamente.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

// ---------------------------------------------------------------------------
// 11. ABRIR FORMULÁRIO (decide check-in x check-out)
// ---------------------------------------------------------------------------
async function abrirFormulario(veiculo) {
  resetFormState();
  document.getElementById('veiculoPlaca').textContent = veiculo.placa;
  document.getElementById('veiculoModelo').textContent = veiculo.modelo;

  const badge = document.getElementById('formTipoBadge');
  const alertaAberta = document.getElementById('alertaEscalaAberta');
  const wrapObra = document.getElementById('wrapSelectObra');
  const wrapResumo = document.getElementById('wrapResumoKm');

  if (veiculo.escala_aberta_id) {
    // ---- CHECK-OUT: encerra a escala já aberta ----
    state.tipoOperacao = 'check-out';
    badge.textContent = 'Check-out';
    badge.className = 'ml-auto text-xs font-display uppercase tracking-wider px-3 py-1 rounded-full bg-red-dim text-ink';
    alertaAberta.classList.remove('hidden');
    wrapObra.classList.add('hidden');
    wrapResumo.classList.remove('hidden');

    // tenta buscar detalhes da escala (obra/motorista/km_inicial)
    let escala = null;
    if (navigator.onLine) {
      const { data } = await supabaseClient
        .from('viagens_veiculo')
        .select('*, obras(nome, km_limite_diario), motoristas(nome)')
        .eq('id', veiculo.escala_aberta_id)
        .maybeSingle();
      escala = data;
      if (escala) await cacheSet(`escala_${veiculo.escala_aberta_id}`, escala);
    } else {
      escala = await cacheGet(`escala_${veiculo.escala_aberta_id}`);
    }
    state.escalaInfo = escala;

    document.getElementById('resumoKmInicial').textContent = (escala ? escala.km_inicial : veiculo.ultimo_km) + ' km';
    document.getElementById('resumoKmLimite').textContent = escala && escala.obras ? escala.obras.km_limite_diario + ' km/dia' : '—';

    // pré-seleciona (mas oculta) o motorista que está fazendo o check-out atual;
    // qualquer motorista logado pode assumir o encerramento (flag de alerta já mostrada acima)
  } else {
    // ---- CHECK-IN: abre nova escala ----
    state.tipoOperacao = 'check-in';
    badge.textContent = 'Check-in';
    badge.className = 'ml-auto text-xs font-display uppercase tracking-wider px-3 py-1 rounded-full bg-green-dim text-ink';
    alertaAberta.classList.add('hidden');
    wrapObra.classList.remove('hidden');
    wrapResumo.classList.add('hidden');
  }

  showScreen('screen-form');
  await iniciarCamera();
}

function resetFormState() {
  state.fotoBlob = null;
  state.fotoExtensao = null;
  document.getElementById('inputKm').value = '';
  document.getElementById('wrapJustificativa').classList.add('hidden');
  document.getElementById('inputJustificativa').value = '';
  document.getElementById('btnRefazer').classList.add('hidden');
  document.getElementById('btnCapturar').classList.remove('hidden');
  document.getElementById('fotoStatus').textContent = '';
}

on('btnCancelForm', 'click', () => {
  pararCamera();
  showScreen('screen-home');
});

// ---------------------------------------------------------------------------
// 12. CÂMERA + FOTO DE AUDITORIA + COMPACTAÇÃO PARA UPLOAD
// O KM é sempre digitado pelo motorista — a foto serve só como prova
// visual do painel para a auditoria no admin, sem leitura automática.
// ---------------------------------------------------------------------------
async function iniciarCamera() {
  const video = document.getElementById('video');
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    video.srcObject = state.cameraStream;
  } catch (err) {
    toast('Não foi possível acessar a câmera para a foto do painel.', 'error');
  }
}

function pararCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((t) => t.stop());
    state.cameraStream = null;
  }
}

on('btnCapturar', 'click', capturarFotoPainel);
on('btnRefazer', 'click', () => {
  document.getElementById('video').classList.remove('hidden');
  document.getElementById('btnRefazer').classList.add('hidden');
  document.getElementById('btnCapturar').classList.remove('hidden');
  document.getElementById('fotoStatus').textContent = '';
  state.fotoBlob = null;
  state.fotoExtensao = null;
});

function setFotoStatus(texto) {
  document.getElementById('fotoStatus').textContent = texto;
}

async function capturarFotoPainel() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  // recorta apenas a área da máscara retangular (centro, 75% largura x 33% altura)
  const sw = video.videoWidth;
  const sh = video.videoHeight;
  const cropW = sw * 0.75;
  const cropH = sh * 0.33;
  const sx = (sw - cropW) / 2;
  const sy = (sh - cropH) / 2;

  canvas.width = cropW;
  canvas.height = cropH;
  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

  document.getElementById('btnCapturar').classList.add('hidden');
  document.getElementById('btnRefazer').classList.remove('hidden');

  // compacta a foto (redimensiona p/ no máx 800x600 e converte pra
  // WebP/JPEG entre 30-50 KB) — é só a prova de auditoria, não passa por
  // nenhuma leitura automática; o motorista digita o KM manualmente.
  setFotoStatus('Compactando imagem...');
  const { blob, extensao } = await compactarImagemParaStorage(canvas);
  state.fotoBlob = blob;
  state.fotoExtensao = extensao;

  setFotoStatus(`Foto capturada ✓ (${(blob.size / 1024).toFixed(0)} KB) — digite o KM abaixo.`);
  debugLog(`Foto do painel: ${(blob.size / 1024).toFixed(1)} KB (.${extensao}), ${canvas.width}x${canvas.height} -> compactada`);

  document.getElementById('inputKm').focus();
}

// redimensiona mantendo a proporção, sem nunca ultrapassar maxW x maxH
// (e sem "esticar" fotos que já são menores que isso)
function redimensionarCanvas(origem, maxW, maxH) {
  const escala = Math.min(maxW / origem.width, maxH / origem.height, 1);
  const w = Math.round(origem.width * escala);
  const h = Math.round(origem.height * escala);
  if (w === origem.width && h === origem.height) return origem;

  const destino = document.createElement('canvas');
  destino.width = w;
  destino.height = h;
  destino.getContext('2d').drawImage(origem, 0, 0, w, h);
  return destino;
}

function canvasParaBlob(canvas, tipo, qualidade) {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}

// detecta se o navegador realmente sabe codificar WebP via canvas.toBlob
// (alguns navegadores mais antigos ignoram o tipo pedido e devolvem PNG)
let _suporteWebpCache = null;
async function navegadorSuportaWebp() {
  if (_suporteWebpCache !== null) return _suporteWebpCache;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const blob = await canvasParaBlob(c, 'image/webp', 0.8);
  _suporteWebpCache = !!(blob && blob.type === 'image/webp');
  return _suporteWebpCache;
}

// compressão da foto antes do upload: redimensiona para no máximo
// 800x600 e ajusta a qualidade iterativamente (partindo de 0.6 / 60%,
// como pedido) até o arquivo cair entre FOTO_MIN_BYTES (30 KB) e
// FOTO_MAX_BYTES (50 KB). Prefere WebP; cai para JPEG automaticamente se
// o navegador não suportar codificação WebP via Canvas.
async function compactarImagemParaStorage(canvasOrigem) {
  const canvasRedimensionado = redimensionarCanvas(canvasOrigem, FOTO_MAX_LARGURA, FOTO_MAX_ALTURA);

  const usaWebp = await navegadorSuportaWebp();
  const tipo = usaWebp ? 'image/webp' : 'image/jpeg';
  const extensao = usaWebp ? 'webp' : 'jpg';

  let qualidade = 0.6; // ponto de partida pedido: 60%
  let blob = await canvasParaBlob(canvasRedimensionado, tipo, qualidade);

  // ajusta pra cima ou pra baixo até cair na faixa de 30-50 KB
  // (no máximo 8 tentativas, pra nunca travar o app numa foto difícil)
  for (let tentativa = 0; blob && tentativa < 8; tentativa++) {
    if (blob.size > FOTO_MAX_BYTES && qualidade > 0.25) {
      qualidade = Math.max(0.25, qualidade - 0.1);
    } else if (blob.size < FOTO_MIN_BYTES && qualidade < 0.92) {
      qualidade = Math.min(0.92, qualidade + 0.1);
    } else {
      break; // já está na faixa, ou não dá mais pra ajustar a qualidade
    }
    blob = await canvasParaBlob(canvasRedimensionado, tipo, qualidade);
  }

  return { blob, extensao };
}

// ---------------------------------------------------------------------------
// 13. CAMPO DE KM — sempre digitado manualmente, calcula excesso em tempo real
// ---------------------------------------------------------------------------
on('inputKm', 'input', () => {
  atualizarResumoKm();
});

function obraSelecionadaLimite() {
  if (state.tipoOperacao === 'check-out' && state.escalaInfo && state.escalaInfo.obras) {
    return Number(state.escalaInfo.obras.km_limite_diario);
  }
  const sel = document.getElementById('selectObra');
  const opt = sel.options[sel.selectedIndex];
  return opt ? Number(opt.dataset.limite) : null;
}

function kmInicialAtual() {
  if (state.tipoOperacao === 'check-out') {
    return state.escalaInfo ? Number(state.escalaInfo.km_inicial) : Number(state.veiculo.ultimo_km);
  }
  return Number(state.veiculo.ultimo_km);
}

function atualizarResumoKm() {
  if (state.tipoOperacao !== 'check-out') return;
  const kmFinal = Number(document.getElementById('inputKm').value || 0);
  const kmInicial = kmInicialAtual();
  const limite = obraSelecionadaLimite();
  const rodado = kmFinal > 0 ? kmFinal - kmInicial : 0;

  document.getElementById('resumoKmInicial').textContent = kmInicial + ' km';
  document.getElementById('resumoKmRodado').textContent = rodado + ' km';
  document.getElementById('resumoKmLimite').textContent = (limite || '—') + ' km/dia';

  const wrapJust = document.getElementById('wrapJustificativa');
  if (limite && rodado > limite) {
    if (wrapJust.classList.contains('hidden')) {
      document.getElementById('modalExcesso').classList.remove('hidden');
    }
    wrapJust.classList.remove('hidden');
  } else {
    wrapJust.classList.add('hidden');
  }
}

on('btnFecharModalExcesso', 'click', () => {
  document.getElementById('modalExcesso').classList.add('hidden');
});

on('selectObra', 'change', atualizarResumoKm);

// ---------------------------------------------------------------------------
// 14. CONFIRMAR E REGISTRAR (online direto OU fila offline)
// ---------------------------------------------------------------------------
on('btnConfirmar', 'click', confirmarRegistro);

async function confirmarRegistro() {
  const km = Number(document.getElementById('inputKm').value || 0);
  if (!km || km <= 0) {
    toast('Informe o KM do odômetro.', 'warn');
    return;
  }

  const motoristaId = document.getElementById('selectMotorista').value;
  if (!motoristaId) {
    toast('Selecione o motorista.', 'warn');
    return;
  }

  let obraId = null;
  let limite = null;
  if (state.tipoOperacao === 'check-in') {
    obraId = document.getElementById('selectObra').value;
    if (!obraId) { toast('Selecione a obra.', 'warn'); return; }
    limite = obraSelecionadaLimite();
  } else {
    obraId = state.escalaInfo ? state.escalaInfo.obra_id : null;
    limite = obraSelecionadaLimite();
  }

  const kmInicial = kmInicialAtual();

  // PROÍBE KM MENOR QUE O ANTERIOR: vale tanto pro check-in (comparado ao
  // último KM conhecido do veículo) quanto pro check-out (comparado ao KM
  // inicial desta escala) — o hodômetro nunca pode regredir.
  if (kmInicial && km < kmInicial) {
    toast(`O KM informado (${km}) não pode ser menor que o último registrado (${kmInicial}).`, 'error');
    return;
  }

  const rodado = state.tipoOperacao === 'check-out' ? km - kmInicial : null;
  const excedeu = state.tipoOperacao === 'check-out' && limite && rodado > limite;
  const justificativa = document.getElementById('inputJustificativa').value.trim();

  if (excedeu && !justificativa) {
    toast('Preencha a justificativa do excesso de KM antes de confirmar.', 'error');
    return;
  }

  const btn = document.getElementById('btnConfirmar');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const operacao = {
    localId: crypto.randomUUID(),
    tipo: state.tipoOperacao,
    veiculoId: state.veiculo.veiculo_id,
    escalaId: state.tipoOperacao === 'check-out' ? state.veiculo.escala_aberta_id : crypto.randomUUID(),
    obraId,
    motoristaId,
    kmInicial,
    kmValor: km,
    fotoBlob: state.fotoBlob,
    fotoExtensao: state.fotoExtensao,
    // todo KM aqui é sempre digitado manualmente (não há mais OCR pra
    // comparar/sobrescrever), então essa flag de auditoria fica fixa em
    // false — o campo continua existindo na tabela por compatibilidade
    alteradoManualmente: false,
    justificativaExcesso: excedeu ? justificativa : null,
    createdAt: new Date().toISOString()
  };

  try {
    if (navigator.onLine) {
      await executarOperacao(operacao);
      toast(state.tipoOperacao === 'check-in' ? 'Check-in registrado com sucesso!' : 'Check-out registrado com sucesso!', 'success');
    } else {
      throw new Error('offline');
    }
  } catch (err) {
    // qualquer falha (offline real ou erro de rede) -> guarda na fila local
    await idbPut('fila', operacao);
    // mantém o cache local da escala aberta coerente para permitir o check-out
    // deste mesmo veículo mesmo sem internet
    if (operacao.tipo === 'check-in') {
      await setEscalaAbertaLocal(operacao.veiculoId, operacao.escalaId);
    } else {
      await setEscalaAbertaLocal(operacao.veiculoId, null);
    }
    toast('Sem internet — registro salvo no aparelho e será sincronizado automaticamente.', 'warn');
    await refreshPendingBadge();
  }

  btn.disabled = false;
  btn.textContent = 'Confirmar e Registrar';
  pararCamera();
  showScreen('screen-home');
}

// executa de fato contra o Supabase (usado tanto no fluxo online direto
// quanto na sincronização posterior da fila)
async function executarOperacao(op) {
  if (!supabaseReady()) throw new Error('Cliente Supabase não inicializado.');

  if (op.tipo === 'abastecimento') {
    return executarOperacaoAbastecimento(op);
  }

  let fotoUrl = null;
  if (op.fotoBlob) {
    fotoUrl = await enviarFoto(op.fotoBlob, op.veiculoId, op.fotoExtensao);
  }

  if (op.tipo === 'check-in') {
    const { error: errEscala } = await supabaseClient.from('viagens_veiculo').insert({
      id: op.escalaId,
      obra_id: op.obraId,
      veiculo_id: op.veiculoId,
      motorista_id: op.motoristaId,
      km_inicial: op.kmValor,
      status: 'em_andamento'
    });
    if (errEscala) throw errEscala;

    const { error: errReg } = await supabaseClient.from('registros_km').insert({
      escala_id: op.escalaId,
      tipo: 'check-in',
      km_registrado: op.kmValor,
      foto_url: fotoUrl,
      alterado_manualmente: op.alteradoManualmente,
      justificativa_excesso: op.justificativaExcesso
    });
    if (errReg) throw errReg;
  } else {
    const { error: errEscala } = await supabaseClient
      .from('viagens_veiculo')
      .update({ km_final: op.kmValor, data_fim: new Date().toISOString(), status: 'encerrado' })
      .eq('id', op.escalaId);
    if (errEscala) throw errEscala;

    const { error: errReg } = await supabaseClient.from('registros_km').insert({
      escala_id: op.escalaId,
      tipo: 'check-out',
      km_registrado: op.kmValor,
      foto_url: fotoUrl,
      alterado_manualmente: op.alteradoManualmente,
      justificativa_excesso: op.justificativaExcesso
    });
    if (errReg) throw errReg;
  }
}

// envia a foto já compactada (Blob) para o bucket 'fotos' do Supabase
// Storage, com o nome padronizado veiculo_[ID]_[TIMESTAMP].<extensao>
async function enviarFoto(blob, veiculoId, extensao) {
  const ext = extensao || 'webp';
  const nomeArquivo = `veiculo_${veiculoId}_${Date.now()}.${ext}`;
  const contentType = ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const { error } = await supabaseClient.storage.from(BUCKET).upload(nomeArquivo, blob, {
    contentType,
    upsert: false
  });
  if (error) throw error;

  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(nomeArquivo);
  debugLog(`Foto enviada: ${nomeArquivo} (${(blob.size / 1024).toFixed(1)} KB)`);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// 14.5 ABASTECIMENTO / REEMBOLSO — ação secundária, disponível a qualquer
// momento na tela inicial, independente do fluxo de check-in/check-out.
// ---------------------------------------------------------------------------
on('btnAbastecimento', 'click', abrirTelaAbastecimento);
on('btnEscanearAbastecimento', 'click', () => iniciarScanner('abastecimento'));
on('btnCancelAbastecimento', 'click', () => showScreen('screen-home'));
on('selectVeiculoAbastecimento', 'change', (e) => {
  const id = e.target.value;
  if (!id) { state.veiculoAbastecimento = null; atualizarVeiculoAbastecimentoUI(); return; }
  const v = state.todosVeiculos.find((x) => x.veiculo_id === id);
  if (v) selecionarVeiculoAbastecimento(v);
});
on('inputComprovante', 'change', processarComprovanteSelecionado);
on('btnConfirmarAbastecimento', 'click', confirmarAbastecimento);

async function abrirTelaAbastecimento() {
  resetFormAbastecimento();
  showScreen('screen-abastecimento');
  await Promise.all([carregarListaVeiculosParaAbastecimento(), carregarListasBase()]);
  document.getElementById('selectMotoristaAbastecimento').innerHTML =
    state.motoristas.map((m) => `<option value="${m.id}">${m.nome}</option>`).join('');
}

function resetFormAbastecimento() {
  state.veiculoAbastecimento = null;
  state.comprovanteBlob = null;
  state.comprovanteExtensao = null;
  const selVeiculo = document.getElementById('selectVeiculoAbastecimento');
  if (selVeiculo) selVeiculo.value = '';
  atualizarVeiculoAbastecimentoUI();
  document.getElementById('inputKmAbastecimento').value = '';
  document.getElementById('selectTipoCombustivel').value = 'gasolina';
  document.getElementById('inputLitros').value = '';
  document.getElementById('inputValorTotal').value = '';
  document.getElementById('inputComprovante').value = '';
  document.getElementById('comprovantePreview').classList.add('hidden');
  document.getElementById('checkReembolso').checked = false;
}

// carrega a lista de veículos pro dropdown, reaproveitando a view
// v_ultimos_kms (já traz placa/modelo/ultimo_km prontos, sem round-trips
// extras). Cacheia localmente pra funcionar offline também.
async function carregarListaVeiculosParaAbastecimento() {
  let lista = [];
  if (navigator.onLine && supabaseReady()) {
    const { data, error } = await supabaseClient.from('v_ultimos_kms').select('*').order('placa');
    if (!error && data) {
      lista = data;
      await cacheSet('todosVeiculos', data);
    } else {
      debugLog('Falha ao carregar veículos p/ abastecimento, usando cache: ' + (error ? error.message : ''), 'warn');
      lista = (await cacheGet('todosVeiculos')) || [];
    }
  } else {
    lista = (await cacheGet('todosVeiculos')) || [];
  }
  state.todosVeiculos = lista;

  document.getElementById('selectVeiculoAbastecimento').innerHTML =
    '<option value="">Selecione um veículo...</option>' +
    lista.map((v) => `<option value="${v.veiculo_id}">${v.placa} — ${v.modelo}</option>`).join('');
}

async function resolverVeiculoAbastecimentoPorQr(qrCodeId) {
  try {
    const veiculo = await buscarVeiculoPorQr(qrCodeId);
    if (!veiculo) {
      toast('Veículo não encontrado para este QR Code.', 'error');
      showScreen('screen-abastecimento');
      return;
    }
    if (!state.todosVeiculos.find((v) => v.veiculo_id === veiculo.veiculo_id)) {
      state.todosVeiculos.push(veiculo);
      document.getElementById('selectVeiculoAbastecimento')
        .insertAdjacentHTML('beforeend', `<option value="${veiculo.veiculo_id}">${veiculo.placa} — ${veiculo.modelo}</option>`);
    }
    selecionarVeiculoAbastecimento(veiculo);
    showScreen('screen-abastecimento');
  } catch (err) {
    console.error(err);
    debugLog('Erro ao resolver veículo (abastecimento) via QR: ' + err.message, 'error');
    toast('Erro ao buscar o veículo pelo QR Code.', 'error');
    showScreen('screen-abastecimento');
  }
}

function selecionarVeiculoAbastecimento(v) {
  state.veiculoAbastecimento = v;
  document.getElementById('selectVeiculoAbastecimento').value = v.veiculo_id;
  atualizarVeiculoAbastecimentoUI();
}

function atualizarVeiculoAbastecimentoUI() {
  const wrap = document.getElementById('veiculoAbastecimentoSelecionado');
  if (state.veiculoAbastecimento) {
    document.getElementById('veiculoAbastPlaca').textContent = state.veiculoAbastecimento.placa;
    document.getElementById('veiculoAbastModelo').textContent = state.veiculoAbastecimento.modelo;
    wrap.classList.remove('hidden');
    wrap.classList.add('flex');
  } else {
    wrap.classList.add('hidden');
    wrap.classList.remove('flex');
  }
}

// comprime a foto do comprovante — cupons costumam ser compridos/retrato,
// então só limitamos o maior lado (não força 800x600 como a foto do painel,
// que é sempre um recorte na horizontal)
const COMPROVANTE_MAX_LADO = 1000;

async function processarComprovanteSelecionado(e) {
  const arquivo = e.target.files[0];
  if (!arquivo) return;

  const preview = document.getElementById('comprovantePreview');
  const leitor = new FileReader();
  leitor.onload = () => { preview.src = leitor.result; preview.classList.remove('hidden'); };
  leitor.readAsDataURL(arquivo);

  const imagem = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível processar a imagem do comprovante.'));
    img.src = URL.createObjectURL(arquivo);
  });

  const escala = Math.min(COMPROVANTE_MAX_LADO / imagem.width, COMPROVANTE_MAX_LADO / imagem.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(imagem.src);

  const usaWebp = await navegadorSuportaWebp();
  const tipo = usaWebp ? 'image/webp' : 'image/jpeg';
  state.comprovanteExtensao = usaWebp ? 'webp' : 'jpg';
  state.comprovanteBlob = await canvasParaBlob(canvas, tipo, 0.75);
  debugLog(`Comprovante compactado: ${(state.comprovanteBlob.size / 1024).toFixed(1)} KB (.${state.comprovanteExtensao})`);
}

async function confirmarAbastecimento() {
  if (!state.veiculoAbastecimento) {
    toast('Selecione o veículo (escaneie o QR ou escolha da lista).', 'warn');
    return;
  }
  const motoristaId = document.getElementById('selectMotoristaAbastecimento').value;
  if (!motoristaId) { toast('Selecione o motorista.', 'warn'); return; }

  const km = Number(document.getElementById('inputKmAbastecimento').value || 0);
  if (!km || km <= 0) { toast('Informe o KM atual do painel.', 'warn'); return; }

  // hodômetro nunca regride — mesma regra do check-in/check-out
  const kmReferencia = Number(state.veiculoAbastecimento.ultimo_km || 0);
  if (kmReferencia && km < kmReferencia) {
    toast(`O KM informado (${km}) não pode ser menor que o último registrado (${kmReferencia}).`, 'error');
    return;
  }

  const litros = Number(document.getElementById('inputLitros').value || 0);
  if (!litros || litros <= 0) { toast('Informe os litros abastecidos.', 'warn'); return; }

  const valorTotal = Number(document.getElementById('inputValorTotal').value || 0);
  if (!valorTotal || valorTotal <= 0) { toast('Informe o valor total pago.', 'warn'); return; }

  if (!state.comprovanteBlob) {
    toast('Anexe a foto do comprovante/cupom fiscal.', 'error');
    return;
  }

  const operacao = {
    localId: crypto.randomUUID(),
    tipo: 'abastecimento',
    veiculoId: state.veiculoAbastecimento.veiculo_id,
    motoristaId,
    kmValor: km,
    tipoCombustivel: document.getElementById('selectTipoCombustivel').value,
    litros,
    valorTotal,
    comprovanteBlob: state.comprovanteBlob,
    comprovanteExtensao: state.comprovanteExtensao,
    solicitarReembolso: document.getElementById('checkReembolso').checked,
    createdAt: new Date().toISOString()
  };

  const btn = document.getElementById('btnConfirmarAbastecimento');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    if (navigator.onLine) {
      await executarOperacao(operacao);
      toast('Abastecimento registrado com sucesso!', 'success');
    } else {
      throw new Error('offline');
    }
  } catch (err) {
    await idbPut('fila', operacao);
    toast('Sem internet — abastecimento salvo no aparelho e será sincronizado automaticamente.', 'warn');
    await refreshPendingBadge();
  }

  btn.disabled = false;
  btn.textContent = 'Registrar Abastecimento';
  showScreen('screen-home');
}

async function enviarComprovante(blob, veiculoId, extensao) {
  const ext = extensao || 'webp';
  const nomeArquivo = `veiculo_${veiculoId}_${Date.now()}.${ext}`;
  const contentType = ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const { error } = await supabaseClient.storage.from(BUCKET_COMPROVANTES).upload(nomeArquivo, blob, {
    contentType,
    upsert: false
  });
  if (error) throw error;

  const { data } = supabaseClient.storage.from(BUCKET_COMPROVANTES).getPublicUrl(nomeArquivo);
  debugLog(`Comprovante enviado: ${nomeArquivo} (${(blob.size / 1024).toFixed(1)} KB)`);
  return data.publicUrl;
}

async function executarOperacaoAbastecimento(op) {
  const comprovanteUrl = await enviarComprovante(op.comprovanteBlob, op.veiculoId, op.comprovanteExtensao);

  const { error } = await supabaseClient.from('fuel_supplies').insert({
    id: op.localId, // reaproveita o id gerado no aparelho: idempotente se a sincronização repetir
    veiculo_id: op.veiculoId,
    motorista_id: op.motoristaId,
    km_atual: op.kmValor,
    tipo_combustivel: op.tipoCombustivel,
    litros: op.litros,
    valor_total: op.valorTotal,
    comprovante_url: comprovanteUrl,
    solicitar_reembolso: op.solicitarReembolso
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// 15. SINCRONIZAÇÃO DA FILA OFFLINE
// ---------------------------------------------------------------------------
let sincronizando = false;
async function sincronizarFila() {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  try {
    const fila = await idbGetAll('fila');
    for (const op of fila) {
      try {
        await executarOperacao(op);
        await idbDelete('fila', op.localId);
      } catch (err) {
        console.warn('Falha ao sincronizar operação, tentará depois:', err);
        break; // mantém ordem: para no primeiro erro e tenta de novo mais tarde
      }
    }
    await refreshPendingBadge();
    const restante = await idbGetAll('fila');
    if (restante.length === 0) {
      const fila0 = await idbGetAll('fila');
      if (fila0.length === 0) toast('Registros sincronizados com o servidor!', 'success');
    }
  } finally {
    sincronizando = false;
  }
}

// tenta sincronizar periodicamente e ao voltar para o app
setInterval(() => { if (navigator.onLine) sincronizarFila(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && navigator.onLine) sincronizarFila();
});

// ---------------------------------------------------------------------------
// 16. SERVICE WORKER + INICIALIZAÇÃO
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((reg) => debugLog('Service Worker registrado: ' + reg.scope))
      .catch((err) => debugLog('Falha ao registrar Service Worker: ' + err.message, 'error'));
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SYNC_NOW') sincronizarFila();
  });
}

(async function init() {
  // garante que a tela inicial correta esteja visível, independente de
  // qualquer estado anterior (defensivo contra telas "presas")
  showScreen('screen-home');
  updateConnStatus();
  await refreshPendingBadge();
  await testarConexaoSupabase();
  if (navigator.onLine) sincronizarFila();
  debugLog('Inicialização concluída.');
})();
