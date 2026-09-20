// ============================================================================
// ADMIN.JS — Painel Administrativo (Cadastros / QR Codes / Monitoramento)
// ============================================================================

// ---------------------------------------------------------------------------
// 0. TRATAMENTO DE ERRO GLOBAL — mostra na tela qualquer falha de
// inicialização (se o Supabase não inicializar, sem isso a página fica
// "morta" sem explicação nenhuma).
// ---------------------------------------------------------------------------
window.addEventListener('error', (e) => {
  console.error('[admin.js] ERRO NÃO TRATADO:', e.message, e.filename + ':' + e.lineno);
  mostrarErroFatalAdmin(e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason && e.reason.message ? e.reason.message : JSON.stringify(e.reason);
  console.error('[admin.js] PROMISE REJEITADA:', msg);
  mostrarErroFatalAdmin(msg);
});

function mostrarErroFatalAdmin(msg) {
  if (document.getElementById('erroFatalAdmin')) return;
  const div = document.createElement('div');
  div.id = 'erroFatalAdmin';
  div.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7A1620;color:#fff;padding:10px 16px;font-family:monospace;font-size:12px;';
  div.textContent = '⚠ Erro no painel admin: ' + msg + ' (veja o console do navegador para detalhes)';
  document.body.prepend(div);
}

// ---------------------------------------------------------------------------
// 0.1 CONFIGURAÇÃO — use os MESMOS valores configurados em app.js
// ---------------------------------------------------------------------------
// FASE DE TESTES: login desligado por enquanto (Edson pediu pra tirar até o
// sistema estar pronto). Pra reativar depois, troque pra "true" aqui E rode
// o SQL "supabase_reativar_login.sql" no Supabase.
const EXIGIR_LOGIN = false;
const SUPABASE_URL = 'https://bddjdpyfypsiwnirbyhv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZGpkcHlmeXBzaXduaXJieWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NDk1MjgsImV4cCI6MjEwMDQyNTUyOH0.0HnH7caYH6sLp5n68izQXqbCJ-cLqTyxELl1EqoHHww';

if (SUPABASE_URL.includes('SEU-PROJETO') || SUPABASE_ANON_KEY.includes('SUA-CHAVE')) {
  console.error('[admin.js] SUPABASE_URL / SUPABASE_ANON_KEY ainda estão com valor de exemplo. Edite as constantes no topo do admin.js.');
  mostrarErroFatalAdmin('SUPABASE_URL/SUPABASE_ANON_KEY não configurados (ainda são o valor de exemplo).');
}

let supabaseClient = null;
try {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('Biblioteca @supabase/supabase-js não carregou do CDN.');
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
  mostrarErroFatalAdmin('Falha ao criar cliente Supabase: ' + err.message);
}

// ---------------------------------------------------------------------------
// 0.2 AUTENTICAÇÃO (Supabase Auth) — o painel só é liberado depois do login.
// Não existe cadastro público aqui de propósito: contas de gestor são
// criadas manualmente no painel do Supabase (Authentication > Users), para
// que só quem a empresa autorizar tenha acesso.
// ---------------------------------------------------------------------------
document.getElementById('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;
  const erroEl = document.getElementById('loginErro');
  const btn = document.getElementById('btnEntrar');

  erroEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });

  btn.disabled = false;
  btn.textContent = 'Entrar';

  if (error) {
    erroEl.textContent = error.message === 'Invalid login credentials'
      ? 'E-mail ou senha incorretos.'
      : 'Erro ao entrar: ' + error.message;
    erroEl.classList.remove('hidden');
    return;
  }
  // o resto (mostrar o dashboard, carregar dados) é feito pelo
  // onAuthStateChange abaixo, que dispara sozinho após o login
});

document.getElementById('btnLogout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

function mostrarDashboard(session) {
  document.getElementById('loginGate').classList.add('hidden');
  document.getElementById('dashboardContent').classList.remove('hidden');
  document.getElementById('userBox').classList.remove('hidden');
  document.getElementById('userBox').classList.add('flex');
  document.getElementById('userEmail').textContent = session.user.email;
}

function mostrarLogin() {
  document.getElementById('dashboardContent').classList.add('hidden');
  document.getElementById('userBox').classList.add('hidden');
  document.getElementById('userBox').classList.remove('flex');
  document.getElementById('loginGate').classList.remove('hidden');
  document.getElementById('formLogin').reset();
  document.getElementById('loginErro').classList.add('hidden');
}

let dadosJaCarregados = false;

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session) {
    mostrarDashboard(session);
    if (!dadosJaCarregados) {
      dadosJaCarregados = true;
      carregarVeiculos();
      carregarObras();
      carregarMotoristas();
      carregarDashboard(); // aba padrão ao entrar
    }
  } else {
    mostrarLogin();
    dadosJaCarregados = false;
  }
});

if (!EXIGIR_LOGIN && !dadosJaCarregados) {
  // Sem login por enquanto — entra direto, pra dar pra ver e testar tudo.
  mostrarDashboard({ user: { email: 'Acesso sem login (fase de testes)' } });
  dadosJaCarregados = true;
  carregarVeiculos();
  carregarObras();
  carregarMotoristas();
  carregarDashboard();
}

// ---------------------------------------------------------------------------
// 1. RELÓGIO + NAVEGAÇÃO POR ABAS
// ---------------------------------------------------------------------------
function tickClock() {
  document.getElementById('clockNow').textContent = new Date().toLocaleString('pt-BR');
}
setInterval(tickClock, 1000);
tickClock();

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'dashboard') carregarDashboard();
    if (btn.dataset.tab === 'qrcodes') carregarQrCodes();
    if (btn.dataset.tab === 'monitoramento') carregarMonitoramento();
    if (btn.dataset.tab === 'abastecimentos') carregarAbastecimentos();
    if (btn.dataset.tab === 'alertas') carregarAlertas();
  });
});

// ---------------------------------------------------------------------------
// 2. ABA "CADASTROS" — Veículos, Obras, Motoristas (CRUD)
// ---------------------------------------------------------------------------

// preview da foto assim que o gestor escolhe o arquivo
document.getElementById('vFoto').addEventListener('change', (e) => {
  const arquivo = e.target.files[0];
  const preview = document.getElementById('vFotoPreview');
  if (!arquivo) {
    preview.classList.add('hidden');
    preview.src = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    preview.src = reader.result;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(arquivo);
});

document.getElementById('formVeiculo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const placa = document.getElementById('vPlaca').value.trim().toUpperCase();
  const modelo = document.getElementById('vModelo').value.trim();
  const kmInicial = Number(document.getElementById('vKmInicial').value || 0);
  const arquivoFoto = document.getElementById('vFoto').files[0];

  const btn = e.target.querySelector('button[type="submit"], button:not([type])');
  const textoOriginal = btn.textContent;
  btn.disabled = true;

  try {
    let fotoUrl = null;
    if (arquivoFoto) {
      btn.textContent = 'Enviando foto...';
      fotoUrl = await enviarFotoVeiculo(arquivoFoto, placa);
    }

    btn.textContent = 'Salvando...';
    const { data: novoVeiculo, error } = await supabaseClient.from('veiculos').insert({
      placa, modelo, km_inicial: kmInicial, foto_url: fotoUrl
    }).select().single();
    if (error) throw error;

    e.target.reset();
    document.getElementById('vFotoPreview').classList.add('hidden');
    await carregarVeiculos();

    // abre o Prontuário completo na hora — é lá que ficam Renavam, chassi,
    // documentos com prazo, manutenção preventiva e histórico de incidentes
    toastAdmin('Veículo cadastrado! Preencha o restante no Prontuário que abriu.');
    await abrirProntuarioPorId(novoVeiculo.id);
  } catch (err) {
    alert('Erro ao salvar veículo: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

// comprime (redimensiona para no máx 800x800 + JPEG qualidade 0.75) e envia
// pro bucket indicado — usado tanto pra foto de cadastro do veículo quanto
// pras fotos de ocorrências do histórico (só gestores logados escrevem aqui)
async function comprimirEEnviar(arquivo, bucket, prefixoNome) {
  const imagem = await carregarImagemDeArquivo(arquivo);

  const maxW = 800;
  const maxH = 800;
  const escala = Math.min(maxW / imagem.width, maxH / imagem.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(imagem.src);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75));
  const nomeArquivo = `${prefixoNome.replace(/[^A-Za-z0-9_-]/g, '')}_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;

  const { error } = await supabaseClient.storage.from(bucket).upload(nomeArquivo, blob, {
    contentType: 'image/jpeg',
    upsert: false
  });
  if (error) throw error;

  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

async function enviarFotoVeiculo(arquivo, placa) {
  return comprimirEEnviar(arquivo, 'veiculos', placa);
}

function carregarImagemDeArquivo(arquivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível processar a imagem selecionada.'));
    img.src = URL.createObjectURL(arquivo);
  });
}

// miniatura da foto do veículo (ou um ícone de placeholder se não tiver foto)
function miniaturaVeiculo(v) {
  const estilo = 'display:block;width:100%;height:100%;object-fit:cover;';
  if (v.foto_url) {
    return `<div class="w-11 h-11 rounded-lg border border-line overflow-hidden"><img src="${v.foto_url}" alt="Foto de ${v.placa}" style="${estilo}" loading="lazy"></div>`;
  }
  return `<div class="w-11 h-11 rounded-lg border border-line overflow-hidden"><img src="/vehicle-placeholder.webp" alt="Sem foto cadastrada" style="${estilo}opacity:.6;" loading="lazy"></div>`;
}

// ---------------------------------------------------------------------------
// 2.1 EDITAR / EXCLUIR — infraestrutura genérica usada pelas 3 tabelas de
// cadastro (veículos, obras, motoristas). Cada tabela só precisa: guardar
// os registros carregados num array (pra achar pelo id sem refazer a
// consulta) e montar os botões de ação com botoesAcao(tabela, id).
// ---------------------------------------------------------------------------
function botoesAcao(tabela, id) {
  return `
    <div class="flex gap-1">
      <button onclick="abrirEdicaoPorId('${tabela}','${id}')" title="Editar"
        class="w-8 h-8 rounded-lg bg-surface2 border border-line flex items-center justify-center hover:border-brand hover:text-brand transition">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
      </button>
      <button onclick="pedirExclusaoPorId('${tabela}','${id}')" title="Excluir"
        class="w-8 h-8 rounded-lg bg-surface2 border border-line flex items-center justify-center hover:border-red hover:text-red transition">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
      </button>
    </div>`;
}

// veículos têm duas ações extras: configurar manutenção preventiva e
// "zerar histórico" (limpeza de dados de teste sem apagar o cadastro)
function botoesAcaoVeiculo(id) {
  return `
    <div class="flex gap-1">
      <button onclick="abrirEdicaoPorId('veiculos','${id}')" title="Editar"
        class="w-8 h-8 rounded-lg bg-surface2 border border-line flex items-center justify-center hover:border-brand hover:text-brand transition">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
      </button>
      <button onclick="abrirProntuarioPorId('${id}')" title="Prontuário do veículo"
        class="w-8 h-8 rounded-lg bg-surface2 border border-line flex items-center justify-center hover:border-brand hover:text-brand transition">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6a2 2 0 012 2v14a2 2 0 01-2 2H9a2 2 0 01-2-2V6a2 2 0 012-2z"/><path d="M9 2h6v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V2z"/><path d="M9 12h6M9 16h4"/></svg>
      </button>
      <button onclick="pedirZerarHistoricoPorId('${id}')" title="Zerar histórico (dados de teste)"
        class="w-8 h-8 rounded-lg bg-surface2 border border-line flex items-center justify-center hover:border-yellow hover:text-yellow transition">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </button>
      <button onclick="pedirExclusaoPorId('veiculos','${id}')" title="Excluir"
        class="w-8 h-8 rounded-lg bg-surface2 border border-line flex items-center justify-center hover:border-red hover:text-red transition">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
      </button>
    </div>`;
}

let obrasCache = [];
let motoristasCache = [];

function abrirEdicaoPorId(tabela, id) {
  if (tabela === 'veiculos') {
    const v = ultimosVeiculos.find((x) => x.id === id);
    if (v) abrirModalEditarVeiculo(v);
  } else if (tabela === 'obras') {
    const o = obrasCache.find((x) => x.id === id);
    if (o) abrirModalEditarObra(o);
  } else if (tabela === 'motoristas') {
    const m = motoristasCache.find((x) => x.id === id);
    if (m) abrirModalEditarMotorista(m);
  }
}

function pedirExclusaoPorId(tabela, id) {
  let label = 'este registro';
  let recarregar = () => {};
  if (tabela === 'veiculos') {
    const v = ultimosVeiculos.find((x) => x.id === id);
    label = v ? `o veículo ${v.placa}` : label;
    recarregar = carregarVeiculos;
  } else if (tabela === 'obras') {
    const o = obrasCache.find((x) => x.id === id);
    label = o ? `a obra "${o.nome}"` : label;
    recarregar = carregarObras;
  } else if (tabela === 'motoristas') {
    const m = motoristasCache.find((x) => x.id === id);
    label = m ? `o motorista ${m.nome}` : label;
    recarregar = carregarMotoristas;
  }
  pedirExclusao(tabela, id, label, recarregar);
}

// "Zerar histórico" — apaga TODAS as escalas, registros de KM e
// abastecimentos de um veículo (útil pra limpar dados de teste), mas
// mantém o cadastro do veículo em si. Ordem importa por causa das chaves
// estrangeiras: registros_km depende de cartao_obra_escala.
function pedirZerarHistoricoPorId(id) {
  const v = ultimosVeiculos.find((x) => x.id === id);
  const placa = v ? v.placa : 'este veículo';
  pedirExclusaoCustom(
    `Isso vai apagar TODAS as escalas, registros de KM e abastecimentos do veículo ${placa} — usado pra limpar dados de teste. O cadastro do veículo NÃO é apagado. Essa ação não pode ser desfeita.`,
    () => zerarHistoricoVeiculo(id),
    carregarVeiculos,
    'Zerar histórico'
  );
}

async function zerarHistoricoVeiculo(veiculoId) {
  // 1) pega as escalas desse veículo, pra poder apagar os registros_km delas primeiro
  const { data: escalas, error: errEsc } = await supabaseClient
    .from('viagens_veiculo').select('id').eq('veiculo_id', veiculoId);
  if (errEsc) throw errEsc;
  const escalaIds = (escalas || []).map((e) => e.id);

  if (escalaIds.length > 0) {
    const { error: errReg } = await supabaseClient.from('registros_km').delete().in('escala_id', escalaIds);
    if (errReg) throw errReg;
  }

  const { error: errDelEsc } = await supabaseClient.from('viagens_veiculo').delete().eq('veiculo_id', veiculoId);
  if (errDelEsc) throw errDelEsc;

  const { error: errFuel } = await supabaseClient.from('fuel_supplies').delete().eq('veiculo_id', veiculoId);
  if (errFuel) throw errFuel;

  // o veículo pode ter ficado marcado "em_uso" por causa de uma escala de
  // teste que acabou de ser apagada — devolve pro estado "livre"
  const { error: errStatus } = await supabaseClient.from('veiculos').update({ status: 'livre' }).eq('id', veiculoId);
  if (errStatus) throw errStatus;
}

// ---- MODAL EDITAR (formulário montado dinamicamente por tipo) ----
let edicaoAtual = null;

function abrirModalEditarVeiculo(v) {
  edicaoAtual = { tabela: 'veiculos', id: v.id, recarregar: carregarVeiculos };
  document.getElementById('modalEditarTitulo').textContent = `Editar veículo — ${v.placa}`;
  document.getElementById('formEditar').innerHTML = `
    <label class="block text-sm"><span class="text-muted">Placa</span>
      <input required id="edPlaca" value="${v.placa}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2 uppercase font-mono"></label>
    <label class="block text-sm"><span class="text-muted">Modelo</span>
      <input required id="edModelo" value="${v.modelo}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2"></label>
    <label class="block text-sm"><span class="text-muted">KM inicial (cadastro)</span>
      <input required id="edKmInicial" type="number" value="${v.km_inicial}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2 font-mono"></label>
    <label class="block text-sm"><span class="text-muted">Status</span>
      <select id="edStatus" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2">
        <option value="livre" ${v.status === 'livre' ? 'selected' : ''}>Livre</option>
        <option value="em_uso" ${v.status === 'em_uso' ? 'selected' : ''}>Em uso</option>
        <option value="manutencao" ${v.status === 'manutencao' ? 'selected' : ''}>Manutenção</option>
      </select></label>
    <label class="block text-sm"><span class="text-muted">Vencimento do documento (CRLV/licenciamento)</span>
      <input id="edDocValidade" type="date" value="${v.documento_validade || ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2"></label>
    <label class="block text-sm"><span class="text-muted">Próxima manutenção/troca de óleo (KM)</span>
      <input id="edProximaManutencao" type="number" value="${v.proxima_troca_oleo_km ?? ''}" placeholder="ex: 50000" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2 font-mono"></label>
    ${botoesSalvarCancelarEditar()}
  `;
  ligarBotaoCancelarEditar();
  document.getElementById('modalEditar').classList.remove('hidden');
}

function abrirModalEditarObra(o) {
  edicaoAtual = { tabela: 'obras', id: o.id, recarregar: carregarObras };
  document.getElementById('modalEditarTitulo').textContent = `Editar obra`;
  document.getElementById('formEditar').innerHTML = `
    <label class="block text-sm"><span class="text-muted">Nome da obra</span>
      <input required id="edNome" value="${o.nome}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2"></label>
    <label class="block text-sm"><span class="text-muted">Limite de KM diário</span>
      <input required id="edLimite" type="number" value="${o.km_limite_diario}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2 font-mono"></label>
    <label class="block text-sm"><span class="text-muted">Status</span>
      <select id="edStatus" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2">
        <option value="ativa" ${o.status === 'ativa' ? 'selected' : ''}>Ativa</option>
        <option value="inativa" ${o.status === 'inativa' ? 'selected' : ''}>Inativa</option>
      </select></label>
    ${botoesSalvarCancelarEditar()}
  `;
  ligarBotaoCancelarEditar();
  document.getElementById('modalEditar').classList.remove('hidden');
}

function abrirModalEditarMotorista(m) {
  edicaoAtual = { tabela: 'motoristas', id: m.id, recarregar: carregarMotoristas };
  document.getElementById('modalEditarTitulo').textContent = `Editar motorista`;
  document.getElementById('formEditar').innerHTML = `
    <label class="block text-sm"><span class="text-muted">Nome completo</span>
      <input required id="edNome" value="${m.nome}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2"></label>
    <label class="block text-sm"><span class="text-muted">CPF</span>
      <input required id="edCpf" value="${m.cpf}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2 font-mono"></label>
    <label class="block text-sm"><span class="text-muted">Status</span>
      <select id="edStatus" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2">
        <option value="ativo" ${m.status === 'ativo' ? 'selected' : ''}>Ativo</option>
        <option value="inativo" ${m.status === 'inativo' ? 'selected' : ''}>Inativo</option>
      </select></label>
    <label class="block text-sm"><span class="text-muted">Vencimento da CNH</span>
      <input id="edCnhValidade" type="date" value="${m.cnh_validade || ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2"></label>
    ${botoesSalvarCancelarEditar()}
  `;
  ligarBotaoCancelarEditar();
  document.getElementById('modalEditar').classList.remove('hidden');
}

function botoesSalvarCancelarEditar() {
  return `
    <div class="flex gap-2 mt-2">
      <button type="submit" class="flex-1 bg-brand font-display font-700 uppercase tracking-wide py-2 rounded-lg">Salvar</button>
      <button type="button" id="btnCancelarEditar" class="flex-1 bg-surface2 border border-line font-display uppercase tracking-wide py-2 rounded-lg">Cancelar</button>
    </div>`;
}

function ligarBotaoCancelarEditar() {
  document.getElementById('btnCancelarEditar').addEventListener('click', fecharModalEditar);
}

function fecharModalEditar() {
  document.getElementById('modalEditar').classList.add('hidden');
  edicaoAtual = null;
}

document.getElementById('formEditar').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!edicaoAtual) return;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  let payload = {};
  if (edicaoAtual.tabela === 'veiculos') {
    payload = {
      placa: document.getElementById('edPlaca').value.trim().toUpperCase(),
      modelo: document.getElementById('edModelo').value.trim(),
      km_inicial: Number(document.getElementById('edKmInicial').value || 0),
      status: document.getElementById('edStatus').value,
      documento_validade: document.getElementById('edDocValidade').value || null,
      proxima_troca_oleo_km: document.getElementById('edProximaManutencao').value
        ? Number(document.getElementById('edProximaManutencao').value) : null
    };
  } else if (edicaoAtual.tabela === 'obras') {
    payload = {
      nome: document.getElementById('edNome').value.trim(),
      km_limite_diario: Number(document.getElementById('edLimite').value || 0),
      status: document.getElementById('edStatus').value
    };
  } else if (edicaoAtual.tabela === 'motoristas') {
    payload = {
      nome: document.getElementById('edNome').value.trim(),
      cpf: document.getElementById('edCpf').value.trim(),
      status: document.getElementById('edStatus').value,
      cnh_validade: document.getElementById('edCnhValidade').value || null
    };
  }

  try {
    const { error } = await supabaseClient.from(edicaoAtual.tabela).update(payload).eq('id', edicaoAtual.id);
    if (error) throw error;
    const recarregar = edicaoAtual.recarregar;
    fecharModalEditar();
    recarregar();
  } catch (err) {
    alert('Erro ao salvar: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Salvar';
  }
});

// ---- MODAL CONFIRMAR EXCLUSÃO ----
let exclusaoAtual = null;

function pedirExclusao(tabela, id, descricaoLegivel, recarregar) {
  exclusaoAtual = { tabela, id, recarregar, acaoCustom: null };
  document.getElementById('msgConfirmarExclusao').textContent =
    `Tem certeza que deseja excluir ${descricaoLegivel}? Essa ação não pode ser desfeita.`;
  document.getElementById('btnConfirmarExclusao').textContent = 'Excluir';
  document.getElementById('modalConfirmarExclusao').classList.remove('hidden');
}

// variante para ações que não são um simples "apagar 1 linha" — ex: apagar
// uma escala + seus registros_km, ou zerar todo o histórico de um veículo.
// `acao` é uma função async que faz o trabalho (pode ter vários passos).
function pedirExclusaoCustom(mensagem, acao, recarregar, textoBotao) {
  exclusaoAtual = { tabela: null, id: null, recarregar, acaoCustom: acao };
  document.getElementById('msgConfirmarExclusao').textContent = mensagem;
  document.getElementById('btnConfirmarExclusao').textContent = textoBotao || 'Excluir';
  document.getElementById('modalConfirmarExclusao').classList.remove('hidden');
}

document.getElementById('btnCancelarExclusao').addEventListener('click', () => {
  document.getElementById('modalConfirmarExclusao').classList.add('hidden');
  exclusaoAtual = null;
});

document.getElementById('btnConfirmarExclusao').addEventListener('click', async () => {
  if (!exclusaoAtual) return;
  const btn = document.getElementById('btnConfirmarExclusao');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Processando...';

  try {
    if (exclusaoAtual.acaoCustom) {
      await exclusaoAtual.acaoCustom();
    } else {
      const { error } = await supabaseClient.from(exclusaoAtual.tabela).delete().eq('id', exclusaoAtual.id);
      if (error) throw error;
    }
    document.getElementById('modalConfirmarExclusao').classList.add('hidden');
    exclusaoAtual.recarregar();
  } catch (err) {
    // erro 23503 = violação de chave estrangeira: o registro já tem
    // escalas/histórico associado, então o banco protege e recusa excluir
    if (err.code === '23503' || (err.message || '').toLowerCase().includes('foreign key')) {
      alert('Não é possível excluir: este registro já tem outros dados associados no histórico.\n\nEm vez de excluir, edite o cadastro e mude o status (ex: "Inativo" ou "Manutenção"), ou use "Zerar histórico" primeiro se quiser apagar tudo.');
    } else {
      alert('Erro: ' + err.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

async function carregarVeiculos() {
  const { data, error } = await supabaseClient.from('veiculos').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }

  document.getElementById('tbodyVeiculos').innerHTML = data.map((v) => `
    <tr>
      <td class="py-2">${miniaturaVeiculo(v)}</td>
      <td class="font-mono">${v.placa}</td>
      <td>${v.modelo}</td>
      <td>${badgeStatusVeiculo(v.status)}</td>
      <td>${botoesAcaoVeiculo(v.id)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="py-6 text-center text-muted">Nenhum veículo cadastrado</td></tr>';

  // mantém a lista de QR Codes sincronizada com os cadastros
  ultimosVeiculos = data;
  if (document.getElementById('tab-qrcodes').classList.contains('active')) renderTabelaQrCodes(data);
}

function badgeStatusVeiculo(status) {
  const map = {
    em_uso: '<span class="text-xs px-2 py-1 rounded-full bg-brand-dim">Em uso</span>',
    livre: '<span class="text-xs px-2 py-1 rounded-full bg-green-dim">Livre</span>',
    manutencao: '<span class="text-xs px-2 py-1 rounded-full bg-yellow-dim">Manutenção</span>'
  };
  return map[status] || status;
}

// Obras
document.getElementById('formObra').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('oNome').value.trim();
  const km_limite_diario = Number(document.getElementById('oLimite').value || 0);
  const { error } = await supabaseClient.from('obras').insert({ nome, km_limite_diario });
  if (error) { alert('Erro ao salvar obra: ' + error.message); return; }
  e.target.reset();
  carregarObras();
});

async function carregarObras() {
  const { data, error } = await supabaseClient.from('obras').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  obrasCache = data;
  document.getElementById('tbodyObras').innerHTML = data.map((o) => `
    <tr>
      <td class="py-2">${o.nome}</td>
      <td class="font-mono">${o.km_limite_diario} km/dia</td>
      <td>${o.status === 'ativa' ? '<span class="text-xs px-2 py-1 rounded-full bg-green-dim">Ativa</span>' : '<span class="text-xs px-2 py-1 rounded-full bg-surface2">Inativa</span>'}</td>
      <td>${botoesAcao('obras', o.id)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="py-6 text-center text-muted">Nenhuma obra cadastrada</td></tr>';
}

// Motoristas
document.getElementById('formMotorista').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('mNome').value.trim();
  const cpf = document.getElementById('mCpf').value.trim();
  const { error } = await supabaseClient.from('funcionarios').insert({ nome, cpf, status: 'pendente', ativo: true });
  if (error) { alert('Erro ao salvar motorista: ' + error.message); return; }
  e.target.reset();
  carregarMotoristas();
});

async function carregarMotoristas() {
  const { data, error } = await supabaseClient.from('funcionarios').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  motoristasCache = data;
  document.getElementById('tbodyMotoristas').innerHTML = data.map((m) => `
    <tr>
      <td class="py-2">${m.nome}</td>
      <td class="font-mono">${m.cpf}</td>
      <td>${m.status === 'ativo' ? '<span class="text-xs px-2 py-1 rounded-full bg-green-dim">Ativo</span>' : '<span class="text-xs px-2 py-1 rounded-full bg-surface2">Inativo</span>'}</td>
      <td>${botoesAcao('motoristas', m.id)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="py-6 text-center text-muted">Nenhum motorista cadastrado</td></tr>';
}

// ---------------------------------------------------------------------------
// 3. ABA "IMPRESSÃO DE QR CODES"
// ---------------------------------------------------------------------------
let ultimosVeiculos = [];

async function carregarQrCodes() {
  if (ultimosVeiculos.length === 0) {
    const { data, error } = await supabaseClient.from('veiculos').select('*').order('placa');
    if (error) { console.error(error); return; }
    ultimosVeiculos = data;
  }
  renderTabelaQrCodes(ultimosVeiculos);
}

function renderTabelaQrCodes(veiculos) {
  document.getElementById('tbodyQrCodes').innerHTML = veiculos.map((v) => `
    <tr>
      <td class="py-2">${miniaturaVeiculo(v)}</td>
      <td class="font-mono">${v.placa}</td>
      <td>${v.modelo}</td>
      <td>${badgeStatusVeiculo(v.status)}</td>
      <td><button class="text-brand underline text-xs" onclick="abrirModalQr('${v.id}','${v.qr_code_id || ''}','${v.placa.replace(/'/g, '')}')">Ver/Imprimir QR Code</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="py-6 text-center text-muted">Nenhum veículo cadastrado</td></tr>';
}

// valor atualmente exibido no modal (o texto realmente codificado no QR) +
// a placa, usada no cabeçalho da etiqueta impressa
let qrAtual = { valor: null, placa: null };

function abrirModalQr(veiculoId, qrCodeId, placa) {
  // usa o qr_code_id normalmente; se vier vazio/nulo, cai para a placa —
  // assim o QR Code sempre é gerado, mesmo em cadastros antigos sem o ID
  const valor = (qrCodeId && qrCodeId !== 'null' && qrCodeId !== 'undefined') ? qrCodeId : placa;
  qrAtual = { valor, placa };

  document.getElementById('modalQrTitulo').textContent = placa;

  const wrap = document.getElementById('qrCanvasWrap');
  wrap.innerHTML = ''; // limpa o QR anterior antes de desenhar o novo

  // eslint-disable-next-line no-undef
  new QRCode(wrap, {
    text: valor,
    width: 200,
    height: 200,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  document.getElementById('modalQr').classList.remove('hidden');
}

document.getElementById('btnFecharModalQr').addEventListener('click', () => {
  document.getElementById('modalQr').classList.add('hidden');
});

// a lib qrcodejs desenha um <canvas> (ou <img> em navegadores muito antigos)
// dentro do container — para imprimir, extraímos a imagem de lá
function obterDataUrlQrAtual() {
  const wrap = document.getElementById('qrCanvasWrap');
  const canvas = wrap.querySelector('canvas');
  if (canvas) return canvas.toDataURL('image/png');
  const img = wrap.querySelector('img');
  if (img) return img.src;
  return null;
}

// imprime uma folha A4 com 8 cópias da etiqueta (2 colunas x 4 linhas)
document.getElementById('btnImprimirEtiqueta').addEventListener('click', () => {
  const dataUrl = obterDataUrlQrAtual();
  if (!dataUrl) {
    alert('O QR Code ainda não terminou de ser gerado — aguarde um instante e tente de novo.');
    return;
  }

  const etiqueta = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
      border:1px dashed #999;padding:10px;height:23%;box-sizing:border-box;">
      <img src="/logo-m.webp" style="height:22px;width:auto;margin-bottom:2px;">
      <img src="${dataUrl}" style="width:90px;height:90px;">
      <p style="font-family:sans-serif;font-weight:bold;font-size:14px;margin-top:4px;">${qrAtual.placa}</p>
      <p style="font-family:sans-serif;font-size:10px;color:#555;">Escaneie para check-in/check-out</p>
    </div>`;

  document.getElementById('printArea').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px;">
      ${Array(8).fill(etiqueta).join('')}
    </div>`;

  window.print();
});

// ---------------------------------------------------------------------------
// 4. ABA "MONITORAMENTO / AUDITORIA"
// Resumo de status da frota (tempo real) + tabela geral com todas as
// escalas e seus registros de KM, destacando em vermelho quem teve KM
// alterado manualmente ou justificativa de excesso.
// ---------------------------------------------------------------------------
async function carregarMonitoramento() {
  await Promise.all([carregarResumoFrota(), carregarTabelaEscalas()]);
}

async function carregarResumoFrota() {
  const { data: veiculos, error } = await supabaseClient.from('veiculos').select('status');
  if (error) { console.error(error); return; }

  let emUso = 0, livre = 0, manutencao = 0;
  veiculos.forEach((v) => {
    if (v.status === 'em_uso') emUso++;
    else if (v.status === 'manutencao') manutencao++;
    else livre++;
  });

  document.getElementById('statEmUso').textContent = emUso;
  document.getElementById('statLivre').textContent = livre;
  document.getElementById('statManutencao').textContent = manutencao;
}

async function carregarTabelaEscalas() {
  const { data, error } = await supabaseClient
    .from('viagens_veiculo')
    .select(`
      id, data_inicio, data_fim, km_inicial, km_final, km_total, status,
      veiculos ( placa, modelo ),
      motoristas ( nome ),
      obras ( nome, km_limite_diario ),
      registros_km ( tipo, km_registrado, alterado_manualmente, justificativa_excesso, foto_url )
    `)
    .order('data_inicio', { ascending: false })
    .limit(300);

  if (error) { console.error(error); return; }

  document.getElementById('tbodyMonitoramento').innerHTML = data.map((esc) => {
    const registros = esc.registros_km || [];
    const registroAlerta = registros.find((r) => r.alterado_manualmente || r.justificativa_excesso);
    const temAlerta = !!registroAlerta;

    const alertas = [];
    if (registros.some((r) => r.alterado_manualmente)) alertas.push('<span class="text-xs px-2 py-1 rounded-full bg-yellow-dim whitespace-nowrap">KM editado</span>');
    if (registros.some((r) => r.justificativa_excesso)) alertas.push('<span class="text-xs px-2 py-1 rounded-full bg-red-dim whitespace-nowrap">Excesso de KM</span>');

    const statusBadge = esc.status === 'em_andamento'
      ? '<span class="text-xs px-2 py-1 rounded-full bg-brand-dim whitespace-nowrap">Em andamento</span>'
      : '<span class="text-xs px-2 py-1 rounded-full bg-surface2 whitespace-nowrap">Encerrado</span>';

    const fotos = registros.filter((r) => r.foto_url);
    const fotosHtml = fotos.length > 0
      ? `<div class="flex gap-1.5">${fotos.map((r) => `
          <button onclick="verFoto('${r.foto_url}')" title="Foto do ${r.tipo === 'check-in' ? 'check-in' : 'check-out'}"
            class="block w-11 h-11 rounded-lg overflow-hidden border border-line hover:border-brand transition shrink-0">
            <img src="${r.foto_url}" alt="Foto do painel (${r.tipo})" style="display:block;width:100%;height:100%;object-fit:cover;" loading="lazy">
          </button>
        `).join('')}</div>`
      : '<span class="text-xs text-muted">—</span>';

    return `
      <tr class="${temAlerta ? 'row-alerta' : ''}">
        <td class="py-2 whitespace-nowrap">${new Date(esc.data_inicio).toLocaleString('pt-BR')}</td>
        <td class="font-mono">${esc.veiculos ? esc.veiculos.placa : '—'}</td>
        <td>${esc.obras ? esc.obras.nome : '—'}</td>
        <td>${esc.motoristas ? esc.motoristas.nome : '—'}</td>
        <td class="font-mono">${esc.km_inicial ?? '—'}</td>
        <td class="font-mono">${esc.km_final ?? '—'}</td>
        <td class="font-mono">${esc.km_total ?? '—'}</td>
        <td>${statusBadge}</td>
        <td class="space-x-1">${alertas.join(' ') || '<span class="text-xs text-muted">—</span>'}</td>
        <td>${fotosHtml}</td>
        <td>
          <button onclick="pedirExclusaoEscala('${esc.id}','${esc.veiculos ? esc.veiculos.placa.replace(/'/g, '') : ''}')" title="Excluir escala"
            class="w-8 h-8 rounded-lg bg-surface2 border border-line flex items-center justify-center hover:border-red hover:text-red transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
          </button>
        </td>
      </tr>`;
  }).join('') || '<tr><td colspan="11" class="py-6 text-center text-muted">Nenhuma escala registrada ainda</td></tr>';
}

// exclui uma escala junto com seus registros_km (a FK impede apagar a
// escala diretamente enquanto os registros dela ainda existirem)
function pedirExclusaoEscala(escalaId, placa) {
  pedirExclusaoCustom(
    `Tem certeza que deseja excluir esta escala do veículo ${placa || ''} e os registros de KM (check-in/check-out) associados a ela? Essa ação não pode ser desfeita.`,
    () => excluirEscalaComRegistros(escalaId),
    carregarMonitoramento,
    'Excluir'
  );
}

async function excluirEscalaComRegistros(escalaId) {
  const { error: errReg } = await supabaseClient.from('registros_km').delete().eq('escala_id', escalaId);
  if (errReg) throw errReg;
  const { error: errEsc } = await supabaseClient.from('viagens_veiculo').delete().eq('id', escalaId);
  if (errEsc) throw errEsc;
}

function verFoto(url) {
  document.getElementById('modalFotoImg').src = url;
  document.getElementById('modalFoto').classList.remove('hidden');
}

// tempo real: assina mudanças nas tabelas relevantes para manter o
// monitoramento e os cadastros sempre atualizados sem precisar recarregar
supabaseClient
  .channel('painel-admin')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'cartao_obra_escala' }, () => {
    if (document.getElementById('tab-monitoramento').classList.contains('active')) carregarMonitoramento();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'registros_km' }, () => {
    if (document.getElementById('tab-monitoramento').classList.contains('active')) carregarMonitoramento();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'veiculos' }, () => {
    carregarVeiculos();
    if (document.getElementById('tab-monitoramento').classList.contains('active')) carregarResumoFrota();
  })
  .subscribe();

// ---------------------------------------------------------------------------
// 6. ABA "ABASTECIMENTOS" — histórico, cálculo de consumo (km/l e custo/km)
// e aprovação de reembolsos
// ---------------------------------------------------------------------------
let abastecimentosCache = [];

async function carregarAbastecimentos() {
  const { data, error } = await supabaseClient
    .from('fuel_supplies')
    .select(`
      id, km_atual, tipo_combustivel, litros, valor_total, comprovante_url,
      solicitar_reembolso, status_reembolso, motivo_recusa, created_at,
      veiculos ( id, placa, modelo ),
      motoristas ( nome )
    `)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) { console.error(error); return; }
  abastecimentosCache = data;

  calcularConsumoPorLinha(data);
  renderResumoAbastecimentos(data);
  renderReembolsosPendentes(data);
  renderTabelaAbastecimentos(data);
}

// Km/L e custo/km de cada abastecimento, comparando com o abastecimento
// IMEDIATAMENTE ANTERIOR do mesmo veículo: KM rodado entre os dois dividido
// pelos litros agora colocados. O primeiro abastecimento de cada veículo
// fica sem esse cálculo (não há "anterior" pra comparar).
function calcularConsumoPorLinha(lista) {
  const ultimoPorVeiculo = {};
  const ordenadoCrescente = [...lista].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  ordenadoCrescente.forEach((item) => {
    const vId = item.veiculos ? item.veiculos.id : null;
    const anterior = vId ? ultimoPorVeiculo[vId] : null;

    if (anterior && item.km_atual > anterior.km_atual && item.litros > 0) {
      const kmRodado = item.km_atual - anterior.km_atual;
      item.km_l = kmRodado / item.litros;
      item.custo_km = item.valor_total / kmRodado;
    } else {
      item.km_l = null;
      item.custo_km = null;
    }

    if (vId) ultimoPorVeiculo[vId] = item;
  });
}

function renderResumoAbastecimentos(data) {
  const pendentes = data.filter((d) => d.status_reembolso === 'pendente').length;
  document.getElementById('statReembolsosPendentes').textContent = pendentes;

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const gastoMes = data
    .filter((d) => new Date(d.created_at) >= inicioMes)
    .reduce((soma, d) => soma + Number(d.valor_total), 0);
  document.getElementById('statGastoMes').textContent =
    'R$ ' + gastoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  const comKmL = data.filter((d) => d.km_l && isFinite(d.km_l) && d.km_l > 0);
  const consumoMedio = comKmL.length > 0 ? comKmL.reduce((s, d) => s + d.km_l, 0) / comKmL.length : null;
  document.getElementById('statConsumoMedio').textContent = consumoMedio ? consumoMedio.toFixed(1) + ' km/l' : '— km/l';
}

function renderReembolsosPendentes(data) {
  const pendentes = data.filter((d) => d.status_reembolso === 'pendente');
  document.getElementById('listaReembolsosPendentes').innerHTML = pendentes.map((r) => `
    <div class="rounded-xl bg-surface border border-yellow/40 p-4">
      <div class="flex gap-3">
        <button onclick="verFoto('${r.comprovante_url}')" class="shrink-0 w-20 h-20 rounded-lg border border-line overflow-hidden">
          <img src="${r.comprovante_url}" alt="Comprovante" style="display:block;width:100%;height:100%;object-fit:cover;">
        </button>
        <div class="flex-1 text-sm min-w-0">
          <p class="font-display font-700 uppercase truncate">${r.veiculos ? r.veiculos.placa : '—'} <span class="text-muted font-body normal-case">— ${r.motoristas ? r.motoristas.nome : '—'}</span></p>
          <p class="text-muted">${capitalizarTexto(r.tipo_combustivel)} · ${Number(r.litros).toFixed(2)} L · <span class="text-brand font-700">R$ ${Number(r.valor_total).toFixed(2)}</span></p>
          <p class="text-muted text-xs">${new Date(r.created_at).toLocaleString('pt-BR')}</p>
        </div>
      </div>
      <div class="flex gap-2 mt-3">
        <button onclick="aprovarReembolso('${r.id}')" class="flex-1 bg-green font-display font-700 uppercase tracking-wide text-xs py-2 rounded-lg">Aprovar</button>
        <button onclick="recusarReembolso('${r.id}')" class="flex-1 bg-red font-display font-700 uppercase tracking-wide text-xs py-2 rounded-lg">Recusar</button>
        <button onclick="pedirExclusao('fuel_supplies','${r.id}','este registro de abastecimento', carregarAbastecimentos)" title="Excluir"
          class="w-9 h-9 shrink-0 rounded-lg bg-surface2 border border-line flex items-center justify-center hover:border-red hover:text-red transition">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
        </button>
      </div>
    </div>
  `).join('') || '<p class="text-muted text-sm md:col-span-2">Nenhum reembolso pendente no momento.</p>';
}

function capitalizarTexto(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

async function aprovarReembolso(id) {
  const { data: sessao } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient.from('fuel_supplies').update({
    status_reembolso: 'aprovado',
    aprovado_por: sessao && sessao.user ? sessao.user.id : null,
    aprovado_em: new Date().toISOString()
  }).eq('id', id);
  if (error) { alert('Erro ao aprovar reembolso: ' + error.message); return; }
  carregarAbastecimentos();
}

async function recusarReembolso(id) {
  const motivo = prompt('Motivo da recusa (opcional):') || null;
  const { data: sessao } = await supabaseClient.auth.getUser();
  const { error } = await supabaseClient.from('fuel_supplies').update({
    status_reembolso: 'recusado',
    motivo_recusa: motivo,
    aprovado_por: sessao && sessao.user ? sessao.user.id : null,
    aprovado_em: new Date().toISOString()
  }).eq('id', id);
  if (error) { alert('Erro ao recusar reembolso: ' + error.message); return; }
  carregarAbastecimentos();
}

function badgeReembolso(status) {
  const map = {
    nao_solicitado: '<span class="text-xs px-2 py-1 rounded-full bg-surface2 text-muted">—</span>',
    pendente: '<span class="text-xs px-2 py-1 rounded-full bg-yellow-dim">Pendente</span>',
    aprovado: '<span class="text-xs px-2 py-1 rounded-full bg-green-dim">Aprovado</span>',
    recusado: '<span class="text-xs px-2 py-1 rounded-full bg-red-dim">Recusado</span>'
  };
  return map[status] || status;
}

function renderTabelaAbastecimentos(data) {
  document.getElementById('tbodyAbastecimentos').innerHTML = data.map((d) => `
    <tr>
      <td class="py-2 whitespace-nowrap">${new Date(d.created_at).toLocaleString('pt-BR')}</td>
      <td class="font-mono">${d.veiculos ? d.veiculos.placa : '—'}</td>
      <td>${d.motoristas ? d.motoristas.nome : '—'}</td>
      <td class="capitalize">${d.tipo_combustivel}</td>
      <td class="font-mono">${Number(d.litros).toFixed(2)}</td>
      <td class="font-mono">R$ ${Number(d.valor_total).toFixed(2)}</td>
      <td class="font-mono">R$ ${(Number(d.valor_total) / Number(d.litros)).toFixed(2)}</td>
      <td class="font-mono">${d.km_l ? d.km_l.toFixed(1) : '—'}</td>
      <td>${d.solicitar_reembolso ? badgeReembolso(d.status_reembolso) : '<span class="text-xs text-muted">Não</span>'}</td>
      <td class="space-x-2 whitespace-nowrap">
        <button class="text-brand underline text-xs" onclick="verFoto('${d.comprovante_url}')">Ver</button>
        <button class="text-red underline text-xs" onclick="pedirExclusao('fuel_supplies','${d.id}','este registro de abastecimento', carregarAbastecimentos)">Excluir</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="10" class="py-6 text-center text-muted">Nenhum abastecimento registrado ainda</td></tr>';
}

// ---- Exportação: Excel (.xlsx) via SheetJS ----
document.getElementById('btnExportarExcel').addEventListener('click', () => {
  if (abastecimentosCache.length === 0) { alert('Nada para exportar ainda.'); return; }

  const linhas = abastecimentosCache.map((d) => ({
    'Data': new Date(d.created_at).toLocaleString('pt-BR'),
    'Veículo': d.veiculos ? d.veiculos.placa : '—',
    'Motorista': d.motoristas ? d.motoristas.nome : '—',
    'Combustível': d.tipo_combustivel,
    'Litros': Number(d.litros),
    'Valor Total (R$)': Number(d.valor_total),
    'R$/Litro': Number((d.valor_total / d.litros).toFixed(3)),
    'Km/L': d.km_l ? Number(d.km_l.toFixed(2)) : '',
    'Reembolso Solicitado': d.solicitar_reembolso ? 'Sim' : 'Não',
    'Status Reembolso': d.status_reembolso
  }));

  const planilha = XLSX.utils.json_to_sheet(linhas);
  planilha['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 9 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 16 }];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Abastecimentos');
  XLSX.writeFile(livro, `abastecimentos_master_energy_${new Date().toISOString().slice(0, 10)}.xlsx`);
});

// ---- Exportação: PDF (via impressão do navegador — mesmo mecanismo já
// usado para as etiquetas de QR Code) ----
document.getElementById('btnExportarPdf').addEventListener('click', () => {
  if (abastecimentosCache.length === 0) { alert('Nada para exportar ainda.'); return; }

  const linhas = abastecimentosCache.map((d) => `
    <tr>
      <td style="padding:5px;border:1px solid #ccc;">${new Date(d.created_at).toLocaleDateString('pt-BR')}</td>
      <td style="padding:5px;border:1px solid #ccc;">${d.veiculos ? d.veiculos.placa : '—'}</td>
      <td style="padding:5px;border:1px solid #ccc;">${d.motoristas ? d.motoristas.nome : '—'}</td>
      <td style="padding:5px;border:1px solid #ccc;">${d.tipo_combustivel}</td>
      <td style="padding:5px;border:1px solid #ccc;">${Number(d.litros).toFixed(2)}</td>
      <td style="padding:5px;border:1px solid #ccc;">R$ ${Number(d.valor_total).toFixed(2)}</td>
      <td style="padding:5px;border:1px solid #ccc;">${d.km_l ? d.km_l.toFixed(1) : '—'}</td>
      <td style="padding:5px;border:1px solid #ccc;">${d.solicitar_reembolso ? d.status_reembolso : '—'}</td>
    </tr>`).join('');

  document.getElementById('printArea').innerHTML = `
    <div style="padding:24px;font-family:sans-serif;">
      <h2 style="color:#1B3F91;margin-bottom:2px;">Master Energy — Relatório de Abastecimentos</h2>
      <p style="color:#555;font-size:12px;margin-top:0;">Gerado em ${new Date().toLocaleString('pt-BR')} · ${abastecimentosCache.length} registro(s)</p>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:14px;">
        <thead>
          <tr style="background:#eee;text-align:left;">
            <th style="padding:6px;border:1px solid #ccc;">Data</th>
            <th style="padding:6px;border:1px solid #ccc;">Veículo</th>
            <th style="padding:6px;border:1px solid #ccc;">Motorista</th>
            <th style="padding:6px;border:1px solid #ccc;">Combustível</th>
            <th style="padding:6px;border:1px solid #ccc;">Litros</th>
            <th style="padding:6px;border:1px solid #ccc;">Valor</th>
            <th style="padding:6px;border:1px solid #ccc;">Km/L</th>
            <th style="padding:6px;border:1px solid #ccc;">Reembolso</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;

  window.print();
});

// ---------------------------------------------------------------------------
// 7. ABA "CENTRAL DE ALERTAS" — CNH, documento do veículo e manutenção por KM
// ---------------------------------------------------------------------------
const ALERTA_DIAS_ANTECEDENCIA = 30;

async function carregarAlertas() {
  await Promise.all([carregarGaugesManutencao(), carregarAlertasCnhDocumento(), carregarFeedAlertasProntuario()]);
}

// CNH e documento do veículo continuam como lista de texto simples
async function carregarAlertasCnhDocumento() {
  const { data, error } = await supabaseClient.from('v_alertas').select('*');
  if (error) { console.error(error); return; }

  const hoje = new Date();
  const limiteData = new Date();
  limiteData.setDate(hoje.getDate() + ALERTA_DIAS_ANTECEDENCIA);

  const relevantes = data
    .filter((a) => a.tipo === 'cnh' || a.tipo === 'documento_veiculo')
    .filter((a) => a.data_vencimento && new Date(a.data_vencimento) <= limiteData)
    .sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));

  document.getElementById('listaAlertas').innerHTML = relevantes.map((a) => renderCardAlerta(a)).join('')
    || '<p class="text-muted text-sm">Nenhum alerta de CNH/documento no momento — tudo em dia 👍</p>';
}

function renderCardAlerta(a) {
  const vencido = new Date(a.data_vencimento) < new Date();
  const titulo = a.tipo === 'cnh' ? `CNH — ${a.descricao}` : `Documento do veículo — ${a.descricao}`;
  const detalhe = `${vencido ? 'Venceu' : 'Vence'} em ${new Date(a.data_vencimento).toLocaleDateString('pt-BR')}`;

  return `
    <div class="rounded-xl bg-surface border ${vencido ? 'border-red/50' : 'border-yellow/50'} p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-full ${vencido ? 'bg-red-dim' : 'bg-yellow-dim'} flex items-center justify-center shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${vencido ? '#FF4757' : '#FFC93C'}" stroke-width="2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
      </div>
      <div>
        <p class="font-display font-700 uppercase text-sm">${titulo}</p>
        <p class="text-muted text-sm">${detalhe}</p>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// 7.1 MANUTENÇÃO PREVENTIVA — cartões com medidor (óleo/filtros/pneus/
// correia dentada/freios) + botão 📋 na tabela de veículos abre o
// PRONTUÁRIO DO VEÍCULO completo (dados gerais, documentos, manutenção e
// histórico de incidentes), tudo num só modal com sub-abas.
// ---------------------------------------------------------------------------
const TIPOS_MANUTENCAO = [
  { tipo: 'oleo', label: 'Troca de Óleo', intervaloPadrao: 10000 },
  { tipo: 'filtros', label: 'Filtros (Ar / Combustível / Óleo)', intervaloPadrao: 10000 },
  { tipo: 'pneus', label: 'Rodízio / Troca de Pneus', intervaloPadrao: 40000 },
  { tipo: 'correia_dentada', label: 'Correia Dentada / Kit de Transmissão', intervaloPadrao: 60000 },
  { tipo: 'freios', label: 'Pastilhas e Sistema de Freios', intervaloPadrao: 20000 }
];

// abaixo de 15% do intervalo restante = "atenção" (amarelo); 0 ou negativo = vencido (vermelho)
const MANUTENCAO_LIMIAR_ATENCAO = 0.15;

async function carregarGaugesManutencao() {
  const { data, error } = await supabaseClient.from('v_manutencoes_status').select('*').order('placa');
  if (error) { console.error(error); return; }

  document.getElementById('listaManutencaoGauges').innerHTML = data.map((m) => renderGaugeManutencao(m)).join('')
    || '<p class="text-muted text-sm sm:col-span-2 lg:col-span-3">Nenhum veículo com manutenção configurada ainda — use o botão 📋 na aba Cadastros.</p>';
}

function statusManutencao(m) {
  const faltam = Number(m.km_faltante);
  if (faltam <= 0) return 'vencido';
  if (faltam <= Number(m.intervalo_km) * MANUTENCAO_LIMIAR_ATENCAO) return 'atencao';
  return 'ok';
}

function renderGaugeManutencao(m) {
  const status = statusManutencao(m);
  const cores = {
    ok: { borda: 'border-green/40', barra: 'bg-green', badge: 'bg-green-dim', texto: 'text-green' },
    atencao: { borda: 'border-yellow/40', barra: 'bg-yellow', badge: 'bg-yellow-dim', texto: 'text-yellow' },
    vencido: { borda: 'border-red/50', barra: 'bg-red', badge: 'bg-red-dim', texto: 'text-red' }
  }[status];

  const percentualPercorrido = Math.min(100, Math.max(0,
    ((Number(m.km_atual) - Number(m.km_ultima_troca)) / Number(m.intervalo_km)) * 100
  ));

  const label = (TIPOS_MANUTENCAO.find((t) => t.tipo === m.tipo) || {}).label || m.tipo;
  const faltam = Number(m.km_faltante);
  const detalhe = status === 'vencido'
    ? `Vencido — ${Math.abs(faltam).toLocaleString('pt-BR')} km acima do limite`
    : `Faltam ${faltam.toLocaleString('pt-BR')} km para a próxima troca`;

  return `
    <div class="rounded-xl bg-surface border ${cores.borda} p-4">
      <div class="flex justify-between items-start gap-2 mb-2">
        <p class="font-display font-700 uppercase text-sm leading-tight">${label}</p>
        <span class="text-xs px-2 py-1 rounded-full ${cores.badge} ${cores.texto} whitespace-nowrap shrink-0">${m.placa}</span>
      </div>
      <div class="w-full h-2.5 bg-surface2 rounded-full overflow-hidden">
        <div class="h-full ${cores.barra}" style="width:${percentualPercorrido}%"></div>
      </div>
      <p class="${cores.texto} text-xs mt-2">${detalhe}</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// 7.2 RÓTULOS E FORMATAÇÃO COMPARTILHADOS (documentos + manutenção + alertas)
// ---------------------------------------------------------------------------
const LABELS_DOCUMENTO = {
  licenciamento: 'Licenciamento',
  ipva: 'IPVA',
  seguro: 'Seguro',
  licenca_especial: 'Licença Especial',
  extintor: 'Extintor de Incêndio',
  tacografo: 'Tacógrafo',
  inspecao_cautelar: 'Inspeção / Laudo Cautelar'
};

function labelDocumento(tipo, descricao) {
  const base = LABELS_DOCUMENTO[tipo] || tipo;
  if (tipo === 'licenca_especial' && descricao) return `Licença Especial — ${descricao}`;
  return base;
}

function labelManutencao(tipo) {
  return (TIPOS_MANUTENCAO.find((t) => t.tipo === tipo) || {}).label || tipo;
}

function labelIncidente(tipo) {
  const map = {
    acidente: 'Acidente', colisao: 'Colisão', quebra: 'Quebra severa',
    funilaria: 'Reparo de funilaria', manutencao_corretiva: 'Manutenção corretiva', outro: 'Outro'
  };
  return map[tipo] || tipo;
}

// texto do alerta ("IPVA vencido há X dias", "Troca de Óleo ultrapassada em Y KM"...)
function formatarTextoAlerta(item) {
  if (item.origem === 'documento') {
    const nome = labelDocumento(item.tipo, item.descricao);
    const dias = item.dias_restantes;
    return dias < 0 ? `${nome} vencido há ${Math.abs(dias)} dia(s)` : `${nome} vence em ${dias} dia(s)`;
  }
  const nome = labelManutencao(item.tipo);
  const km = Number(item.km_faltante);
  return km <= 0 ? `${nome} ultrapassada em ${Math.abs(km).toLocaleString('pt-BR')} km` : `Faltam ${km.toLocaleString('pt-BR')} km para ${nome}`;
}

// caixa de alerta com pisca-pisca no crítico (animate-pulse), usada tanto
// no feed geral da Central de Alertas quanto no topo do prontuário
function renderCaixaAlerta(item, comPlaca) {
  const critico = item.severidade === 'critico';
  const estilo = critico
    ? 'border-2 border-red bg-red-dim animate-pulse'
    : 'border border-yellow/60 bg-yellow-dim';
  const emoji = critico ? '🚨' : '⚠️';
  return `
    <div class="rounded-xl ${estilo} px-4 py-3 flex items-center gap-3">
      <span class="text-xl shrink-0">${emoji}</span>
      <div class="min-w-0">
        <p class="font-display font-700 uppercase text-sm">${comPlaca ? `${item.placa} — ` : ''}${formatarTextoAlerta(item)}</p>
      </div>
    </div>`;
}

// feed de TODA a frota, pra Central de Alertas — só mostra crítico/preventivo
// (regular não polui o feed; o resumo verde já mostra a contagem)
async function carregarFeedAlertasProntuario() {
  const { data, error } = await supabaseClient.from('v_prontuario_alertas').select('*');
  if (error) { console.error(error); return; }

  const criticos = data.filter((a) => a.severidade === 'critico');
  const preventivos = data.filter((a) => a.severidade === 'preventivo');
  const regulares = data.filter((a) => a.severidade === 'regular');

  document.getElementById('statAlertasCriticos').textContent = criticos.length;
  document.getElementById('statAlertasPreventivos').textContent = preventivos.length;
  document.getElementById('statAlertasRegulares').textContent = regulares.length;

  const ordenados = [...criticos, ...preventivos].sort((a, b) => {
    const chaveA = a.origem === 'documento' ? a.dias_restantes : a.km_faltante;
    const chaveB = b.origem === 'documento' ? b.dias_restantes : b.km_faltante;
    return chaveA - chaveB;
  });

  document.getElementById('feedAlertasProntuario').innerHTML = ordenados.map((a) => renderCaixaAlerta(a, true)).join('')
    || '<p class="text-muted text-sm">Nenhum alerta crítico ou preventivo no momento — frota em dia 👍</p>';
}

// ---------------------------------------------------------------------------
// 7.3 PRONTUÁRIO DO VEÍCULO — modal com 4 sub-abas
// ---------------------------------------------------------------------------
let prontuarioVeiculoAtual = null; // { veiculoId, placa, kmAtual }

// navegação entre sub-abas do prontuário
document.querySelectorAll('.subtab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.subtab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('subtab-' + btn.dataset.subtab).classList.add('active');
  });
});

async function abrirProntuarioPorId(veiculoId, subtabAlvo) {
  const { data: v, error: errV } = await supabaseClient.from('veiculos').select('*').eq('id', veiculoId).maybeSingle();
  if (errV || !v) { alert('Erro ao carregar veículo: ' + (errV ? errV.message : 'não encontrado')); return; }

  const { data: kmData } = await supabaseClient
    .from('v_ultimos_kms').select('ultimo_km').eq('veiculo_id', veiculoId).maybeSingle();
  const kmAtual = Number((kmData && kmData.ultimo_km) || 0);

  prontuarioVeiculoAtual = { veiculoId, placa: v.placa, kmAtual };

  document.getElementById('prontuarioTitulo').textContent = `${v.placa} — ${v.modelo}`;
  document.getElementById('prontuarioKmAtual').textContent = kmAtual.toLocaleString('pt-BR') + ' km';

  // abre direto na sub-aba pedida (ex: atalho de um card lateral), ou em
  // "dados" por padrão
  const alvo = subtabAlvo || 'dados';
  document.querySelectorAll('.subtab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.subtab-panel').forEach((p) => p.classList.remove('active'));
  document.querySelector(`.subtab-btn[data-subtab="${alvo}"]`).classList.add('active');
  document.getElementById('subtab-' + alvo).classList.add('active');

  document.getElementById('modalProntuario').classList.remove('hidden');

  renderDadosGeraisForm(v);
  await Promise.all([
    carregarAlertasDoVeiculo(veiculoId),
    carregarManutencaoDoVeiculo(veiculoId, kmAtual),
    carregarDocumentosDoVeiculo(veiculoId),
    carregarIncidentesDoVeiculo(veiculoId)
  ]);
}

document.getElementById('btnFecharProntuario').addEventListener('click', () => {
  document.getElementById('modalProntuario').classList.add('hidden');
  prontuarioVeiculoAtual = null;
});

async function recarregarProntuarioAtual() {
  if (prontuarioVeiculoAtual) await abrirProntuarioPorId(prontuarioVeiculoAtual.veiculoId);
}

async function carregarAlertasDoVeiculo(veiculoId) {
  const { data, error } = await supabaseClient.from('v_prontuario_alertas').select('*').eq('veiculo_id', veiculoId);
  if (error) { console.error(error); return; }
  const relevantes = data.filter((a) => a.severidade !== 'regular');
  document.getElementById('prontuarioAlertas').innerHTML = relevantes.map((a) => renderCaixaAlerta(a, false)).join('')
    || '<div class="rounded-xl border border-green/40 bg-green-dim px-4 py-3 text-sm font-display uppercase">✅ Documentos e manutenção em dia</div>';
}

// ---- A) DADOS GERAIS ----
function renderDadosGeraisForm(v) {
  document.getElementById('subtab-dados').innerHTML = `
    <!-- Foto do veículo: trocar/adicionar -->
    <div class="flex items-center gap-4 mb-5 pb-5 border-b border-line">
      <div class="w-24 h-24 rounded-xl border border-line overflow-hidden shrink-0">
        <img id="dgFotoPreview" src="${v.foto_url || '/vehicle-placeholder.webp'}" alt="Foto do veículo"
          style="display:block;width:100%;height:100%;object-fit:cover;${v.foto_url ? '' : 'opacity:.6;'}">
      </div>
      <div>
        <p class="text-xs uppercase tracking-widest text-muted font-display mb-1">Foto do veículo</p>
        <label class="inline-flex items-center gap-2 bg-surface2 border border-line hover:border-brand cursor-pointer px-3 py-2 rounded-lg text-xs font-display uppercase tracking-wide transition">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          ${v.foto_url ? 'Trocar foto' : 'Adicionar foto'}
          <input id="dgFotoInput" type="file" accept="image/*" capture="environment" class="hidden">
        </label>
        <p class="text-muted text-[11px] mt-1">A foto só é salva quando você clicar em "Salvar dados gerais" abaixo.</p>
      </div>
    </div>

    <form id="formDadosGerais" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label class="block text-sm"><span class="text-muted">Placa</span>
        <input required id="dgPlaca" value="${v.placa || ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2 uppercase font-mono"></label>
      <label class="block text-sm"><span class="text-muted">Modelo</span>
        <input required id="dgModelo" value="${v.modelo || ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2"></label>
      <label class="block text-sm"><span class="text-muted">Renavam</span>
        <input id="dgRenavam" value="${v.renavam || ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2 font-mono"></label>
      <label class="block text-sm"><span class="text-muted">Chassi</span>
        <input id="dgChassi" value="${v.chassi || ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2 font-mono"></label>
      <label class="block text-sm"><span class="text-muted">Ano/Modelo</span>
        <input id="dgAnoModelo" value="${v.ano_modelo || ''}" placeholder="ex: 2022/2023" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2"></label>
      <label class="block text-sm"><span class="text-muted">Cor</span>
        <input id="dgCor" value="${v.cor || ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2"></label>
      <label class="block text-sm"><span class="text-muted">Capacidade do tanque (L)</span>
        <input id="dgTanque" type="number" value="${v.capacidade_tanque_litros ?? ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2 font-mono"></label>
      <label class="block text-sm"><span class="text-muted">Combustível padrão</span>
        <select id="dgCombustivel" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2">
          <option value="" ${!v.combustivel_padrao ? 'selected' : ''}>—</option>
          <option value="gasolina" ${v.combustivel_padrao === 'gasolina' ? 'selected' : ''}>Gasolina</option>
          <option value="etanol" ${v.combustivel_padrao === 'etanol' ? 'selected' : ''}>Etanol</option>
          <option value="flex" ${v.combustivel_padrao === 'flex' ? 'selected' : ''}>Flex</option>
          <option value="diesel" ${v.combustivel_padrao === 'diesel' ? 'selected' : ''}>Diesel</option>
        </select></label>

      <label class="block text-sm sm:col-span-2"><span class="text-muted">Tipo de posse</span>
        <select id="dgTipoPosse" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2">
          <option value="proprio" ${v.tipo_posse === 'proprio' ? 'selected' : ''}>Próprio</option>
          <option value="locado" ${v.tipo_posse === 'locado' ? 'selected' : ''}>Locado</option>
        </select></label>

      <div id="dgCamposLocacao" class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 ${v.tipo_posse === 'locado' ? '' : 'hidden'}">
        <label class="block text-sm"><span class="text-muted">Locadora</span>
          <input id="dgLocadoraNome" value="${v.locadora_nome || ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2"></label>
        <label class="block text-sm"><span class="text-muted">Nº do contrato</span>
          <input id="dgLocadoraContrato" value="${v.locadora_contrato || ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2 font-mono"></label>
        <label class="block text-sm"><span class="text-muted">Término da vigência</span>
          <input id="dgLocadoraTermino" type="date" value="${v.locadora_termino_vigencia || ''}" class="w-full mt-1 bg-surface2 border border-line rounded-lg px-3 py-2"></label>
      </div>

      <button type="submit" class="sm:col-span-2 bg-brand font-display font-700 uppercase tracking-wide py-2.5 rounded-lg mt-1">Salvar dados gerais</button>
    </form>`;

  document.getElementById('dgTipoPosse').addEventListener('change', (e) => {
    document.getElementById('dgCamposLocacao').classList.toggle('hidden', e.target.value !== 'locado');
  });

  // preview instantâneo ao escolher uma foto nova (antes mesmo de salvar)
  document.getElementById('dgFotoInput').addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    const preview = document.getElementById('dgFotoPreview');
    const leitor = new FileReader();
    leitor.onload = () => {
      preview.src = leitor.result;
      preview.style.opacity = '1';
    };
    leitor.readAsDataURL(arquivo);
  });

  document.getElementById('formDadosGerais').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      const payload = {
        placa: document.getElementById('dgPlaca').value.trim().toUpperCase(),
        modelo: document.getElementById('dgModelo').value.trim(),
        renavam: document.getElementById('dgRenavam').value.trim() || null,
        chassi: document.getElementById('dgChassi').value.trim() || null,
        ano_modelo: document.getElementById('dgAnoModelo').value.trim() || null,
        cor: document.getElementById('dgCor').value.trim() || null,
        capacidade_tanque_litros: document.getElementById('dgTanque').value ? Number(document.getElementById('dgTanque').value) : null,
        combustivel_padrao: document.getElementById('dgCombustivel').value || null,
        tipo_posse: document.getElementById('dgTipoPosse').value,
        locadora_nome: document.getElementById('dgLocadoraNome').value.trim() || null,
        locadora_contrato: document.getElementById('dgLocadoraContrato').value.trim() || null,
        locadora_termino_vigencia: document.getElementById('dgLocadoraTermino').value || null
      };

      // se uma foto nova foi escolhida, comprime e envia antes de salvar
      const arquivoFoto = document.getElementById('dgFotoInput').files[0];
      if (arquivoFoto) {
        btn.textContent = 'Enviando foto...';
        payload.foto_url = await enviarFotoVeiculo(arquivoFoto, payload.placa);
        btn.textContent = 'Salvando...';
      }

      const { error } = await supabaseClient.from('veiculos').update(payload).eq('id', v.id);
      if (error) throw error;

      toastAdmin('Dados gerais salvos!');
      carregarVeiculos();
      document.getElementById('prontuarioTitulo').textContent = `${payload.placa} — ${payload.modelo}`;
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar dados gerais';
    }
  });
}

// ---- B) DOCUMENTOS & PRAZOS ----
document.getElementById('docTipo').addEventListener('change', (e) => {
  const cautelar = e.target.value === 'inspecao_cautelar';
  document.getElementById('docEmissaoLabel').textContent = cautelar ? 'Data da última inspeção' : 'Data de emissão';
  document.getElementById('docVencimentoLabel').textContent = cautelar ? 'Próxima vistoria' : 'Data de vencimento';
});

async function carregarDocumentosDoVeiculo(veiculoId) {
  const { data, error } = await supabaseClient
    .from('documentos_veiculo').select('*').eq('veiculo_id', veiculoId)
    .order('data_vencimento', { ascending: true, nullsFirst: false });
  if (error) { console.error(error); return; }

  document.getElementById('listaDocumentosVeiculo').innerHTML = data.map((d) => {
    const venc = d.data_vencimento ? new Date(d.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    return `
      <div class="rounded-lg bg-surface2 border border-line px-3 py-2 flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="font-display font-700 uppercase text-xs">${labelDocumento(d.tipo, d.descricao)}</p>
          <p class="text-muted text-xs truncate">${d.emissor_orgao || ''} ${d.numero_documento ? '· nº ' + d.numero_documento : ''} · vence ${venc}</p>
        </div>
        <button onclick="pedirExclusao('documentos_veiculo','${d.id}','este documento', recarregarProntuarioAtual)" title="Excluir"
          class="w-7 h-7 shrink-0 rounded-lg bg-surface border border-line flex items-center justify-center hover:border-red hover:text-red transition">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
        </button>
      </div>`;
  }).join('') || '<p class="text-muted text-sm">Nenhum documento cadastrado ainda.</p>';
}

document.getElementById('formDocumentoVeiculo').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!prontuarioVeiculoAtual) return;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const payload = {
    veiculo_id: prontuarioVeiculoAtual.veiculoId,
    tipo: document.getElementById('docTipo').value,
    descricao: document.getElementById('docDescricao').value.trim() || null,
    emissor_orgao: document.getElementById('docEmissor').value.trim() || null,
    numero_documento: document.getElementById('docNumero').value.trim() || null,
    data_emissao: document.getElementById('docDataEmissao').value || null,
    data_vencimento: document.getElementById('docDataVencimento').value || null
  };

  const { error } = await supabaseClient.from('documentos_veiculo').insert(payload);
  btn.disabled = false;
  btn.textContent = 'Salvar documento';
  if (error) { alert('Erro ao salvar documento: ' + error.message); return; }

  e.target.reset();
  toastAdmin('Documento salvo!');
  await Promise.all([carregarDocumentosDoVeiculo(prontuarioVeiculoAtual.veiculoId), carregarAlertasDoVeiculo(prontuarioVeiculoAtual.veiculoId)]);
});

// ---- C) MANUTENÇÃO PREVENTIVA (dentro do prontuário) ----
async function carregarManutencaoDoVeiculo(veiculoId, kmAtual) {
  const { data: itens, error } = await supabaseClient
    .from('manutencoes_veiculo').select('*').eq('veiculo_id', veiculoId);
  if (error) { alert('Erro ao carregar manutenção: ' + error.message); return; }

  document.getElementById('manutencaoItens').innerHTML = TIPOS_MANUTENCAO.map(({ tipo, label, intervaloPadrao }) => {
    const existente = itens.find((i) => i.tipo === tipo);
    const kmUltima = existente ? existente.km_ultima_troca : 0;
    const intervalo = existente ? existente.intervalo_km : intervaloPadrao;
    return `
      <div class="rounded-xl bg-surface2 border border-line p-3">
        <p class="font-display font-700 uppercase text-sm mb-2">${label}</p>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs text-muted">KM da última troca
            <input type="number" id="manutKm_${tipo}" value="${kmUltima}" class="w-full mt-1 bg-surface border border-line rounded-lg px-2 py-1.5 font-mono text-sm">
          </label>
          <label class="text-xs text-muted">Intervalo (km)
            <input type="number" id="manutIntervalo_${tipo}" value="${intervalo}" class="w-full mt-1 bg-surface border border-line rounded-lg px-2 py-1.5 font-mono text-sm">
          </label>
        </div>
        <div class="flex gap-2 mt-2">
          <button onclick="salvarManutencaoItem('${tipo}')" class="flex-1 bg-brand font-display font-700 uppercase tracking-wide text-xs py-2 rounded-lg">Salvar</button>
          <button onclick="registrarManutencaoRealizada('${tipo}')" class="flex-1 bg-green font-display font-700 uppercase tracking-wide text-xs py-2 rounded-lg">Registrar Realizada</button>
        </div>
      </div>`;
  }).join('');
}

async function salvarManutencaoItem(tipo) {
  if (!prontuarioVeiculoAtual) return;
  const kmUltima = Number(document.getElementById(`manutKm_${tipo}`).value || 0);
  const intervalo = Number(document.getElementById(`manutIntervalo_${tipo}`).value || 0);
  if (!intervalo || intervalo <= 0) { alert('Informe um intervalo de KM válido.'); return; }

  const { error } = await supabaseClient.from('manutencoes_veiculo').upsert({
    veiculo_id: prontuarioVeiculoAtual.veiculoId,
    tipo,
    km_ultima_troca: kmUltima,
    intervalo_km: intervalo,
    atualizado_em: new Date().toISOString()
  }, { onConflict: 'veiculo_id,tipo' });

  if (error) { alert('Erro ao salvar: ' + error.message); return; }
  toastAdmin('Manutenção atualizada!');
  carregarGaugesManutencao();
  carregarAlertasDoVeiculo(prontuarioVeiculoAtual.veiculoId);
}

async function registrarManutencaoRealizada(tipo) {
  if (!prontuarioVeiculoAtual) return;
  const intervalo = Number(document.getElementById(`manutIntervalo_${tipo}`).value || 0);
  if (!intervalo || intervalo <= 0) { alert('Informe um intervalo de KM válido antes de registrar.'); return; }

  const { error } = await supabaseClient.from('manutencoes_veiculo').upsert({
    veiculo_id: prontuarioVeiculoAtual.veiculoId,
    tipo,
    km_ultima_troca: prontuarioVeiculoAtual.kmAtual,
    intervalo_km: intervalo,
    atualizado_em: new Date().toISOString()
  }, { onConflict: 'veiculo_id,tipo' });

  if (error) { alert('Erro ao registrar manutenção: ' + error.message); return; }

  document.getElementById(`manutKm_${tipo}`).value = prontuarioVeiculoAtual.kmAtual;
  toastAdmin(`Manutenção registrada! Contagem reiniciada a partir de ${prontuarioVeiculoAtual.kmAtual.toLocaleString('pt-BR')} km.`);
  carregarGaugesManutencao();
  carregarAlertasDoVeiculo(prontuarioVeiculoAtual.veiculoId);
}

// ---- D) HISTÓRICO DE INCIDENTES ----
async function carregarIncidentesDoVeiculo(veiculoId) {
  const { data, error } = await supabaseClient
    .from('historico_incidentes').select('*').eq('veiculo_id', veiculoId).order('data_ocorrido', { ascending: false });
  if (error) { console.error(error); return; }

  document.getElementById('listaIncidentes').innerHTML = data.map((inc) => {
    const fotos = (inc.fotos_urls || []).map((url) => `
      <button onclick="verFoto('${url}')" class="w-12 h-12 rounded-lg overflow-hidden border border-line shrink-0">
        <img src="${url}" style="display:block;width:100%;height:100%;object-fit:cover;" alt="Foto da ocorrência">
      </button>`).join('');

    return `
      <div class="rounded-xl bg-surface2 border border-line p-3">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="font-display font-700 uppercase text-sm">${labelIncidente(inc.tipo)} — ${new Date(inc.data_ocorrido + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
            <p class="text-muted text-sm mt-1">${inc.descricao}</p>
            <p class="text-muted text-xs mt-1">
              ${inc.valor_conserto ? 'R$ ' + Number(inc.valor_conserto).toFixed(2) + ' · ' : ''}${inc.oficina_fornecedor || ''}
            </p>
          </div>
          <button onclick="pedirExclusao('historico_incidentes','${inc.id}','esta ocorrência', recarregarProntuarioAtual)" title="Excluir"
            class="w-7 h-7 shrink-0 rounded-lg bg-surface border border-line flex items-center justify-center hover:border-red hover:text-red transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
          </button>
        </div>
        ${fotos ? `<div class="flex gap-2 mt-2 flex-wrap">${fotos}</div>` : ''}
      </div>`;
  }).join('') || '<p class="text-muted text-sm">Nenhuma ocorrência registrada — histórico limpo.</p>';
}

document.getElementById('formIncidente').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!prontuarioVeiculoAtual) return;
  const btn = e.target.querySelector('button[type="submit"]');
  const textoOriginal = btn.textContent;
  btn.disabled = true;

  try {
    const arquivos = Array.from(document.getElementById('incFotos').files || []);
    const fotosUrls = [];
    for (let i = 0; i < arquivos.length; i++) {
      btn.textContent = `Enviando foto ${i + 1}/${arquivos.length}...`;
      const url = await comprimirEEnviar(arquivos[i], 'veiculos', `incidente_${prontuarioVeiculoAtual.placa}`);
      fotosUrls.push(url);
    }

    btn.textContent = 'Salvando...';
    const payload = {
      veiculo_id: prontuarioVeiculoAtual.veiculoId,
      data_ocorrido: document.getElementById('incData').value,
      tipo: document.getElementById('incTipo').value,
      descricao: document.getElementById('incDescricao').value.trim(),
      valor_conserto: document.getElementById('incValor').value ? Number(document.getElementById('incValor').value) : null,
      oficina_fornecedor: document.getElementById('incOficina').value.trim() || null,
      fotos_urls: fotosUrls
    };

    const { error } = await supabaseClient.from('historico_incidentes').insert(payload);
    if (error) throw error;

    e.target.reset();
    toastAdmin('Ocorrência registrada no histórico!');
    await carregarIncidentesDoVeiculo(prontuarioVeiculoAtual.veiculoId);
  } catch (err) {
    alert('Erro ao registrar ocorrência: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

// toast simples pro admin (o app do motorista já tem um; aqui é só um alert
// discreto, já que o admin usa alert() nativo pro resto das mensagens)
function toastAdmin(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0E4B57;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,.4);';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// tempo real: novo abastecimento aparece sozinho se a aba estiver aberta
supabaseClient
  .channel('painel-admin-abastecimentos')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'fuel_supplies' }, () => {
    if (document.getElementById('tab-abastecimentos').classList.contains('active')) carregarAbastecimentos();
  })
  .subscribe();

// ---------------------------------------------------------------------------
// 8. DASHBOARD — visão geral "Dark Industrial Premium": saúde da frota,
// prontuário resumido, documentos/prazos, manutenção, incidentes, gráfico
// de custo, calendário e atalho de etiqueta QR — tudo numa tela só.
// ---------------------------------------------------------------------------
function badgeSaude(status) {
  const map = {
    em_dia: '<span class="text-xs px-2.5 py-1 rounded-full bg-green-dim text-green font-display uppercase tracking-wide whitespace-nowrap">Em Dia</span>',
    atencao: '<span class="text-xs px-2.5 py-1 rounded-full bg-yellow-dim text-yellow font-display uppercase tracking-wide whitespace-nowrap">Atenção</span>',
    atrasado: '<span class="text-xs px-2.5 py-1 rounded-full bg-red-dim text-red font-display uppercase tracking-wide whitespace-nowrap animate-pulse">Em Atraso</span>'
  };
  return map[status] || status;
}

function badgePosse(tipoPosse) {
  if (tipoPosse === 'locado') {
    return '<span class="text-xs px-2.5 py-1 rounded-full bg-brand-dim text-brand font-display uppercase tracking-wide whitespace-nowrap">Locado</span>';
  }
  return '<span class="text-xs px-2.5 py-1 rounded-full bg-surface2 border border-line text-muted font-display uppercase tracking-wide whitespace-nowrap">Próprio</span>';
}

// junta veículos + KM atual + pior severidade de alerta de cada um, pra
// classificar a saúde geral (em_dia / atencao / atrasado)
async function calcularSaudeFrota() {
  const [{ data: veiculos, error: e1 }, { data: kms, error: e2 }, { data: alertas, error: e3 }] = await Promise.all([
    supabaseClient.from('veiculos').select('*').order('placa'),
    supabaseClient.from('v_ultimos_kms').select('veiculo_id, ultimo_km'),
    supabaseClient.from('v_prontuario_alertas').select('veiculo_id, severidade')
  ]);
  if (e1 || e2 || e3) {
    console.error(e1 || e2 || e3);
    return { veiculos: [], contagens: { emDia: 0, atencao: 0, atrasado: 0 } };
  }

  const kmPorVeiculo = {};
  (kms || []).forEach((k) => { kmPorVeiculo[k.veiculo_id] = Number(k.ultimo_km); });

  const rank = { critico: 2, preventivo: 1, regular: 0 };
  const piorPorVeiculo = {};
  (alertas || []).forEach((a) => {
    const atual = piorPorVeiculo[a.veiculo_id];
    if (!atual || rank[a.severidade] > rank[atual]) piorPorVeiculo[a.veiculo_id] = a.severidade;
  });

  const contagens = { emDia: 0, atencao: 0, atrasado: 0 };
  const lista = (veiculos || []).map((v) => {
    const pior = piorPorVeiculo[v.id];
    let status = 'em_dia';
    if (pior === 'critico') status = 'atrasado';
    else if (pior === 'preventivo') status = 'atencao';
    contagens[status === 'em_dia' ? 'emDia' : status === 'atencao' ? 'atencao' : 'atrasado']++;
    return { ...v, kmAtual: kmPorVeiculo[v.id] || 0, statusSaude: status };
  });

  return { veiculos: lista, contagens };
}

async function carregarDashboard() {
  const { veiculos, contagens } = await calcularSaudeFrota();

  document.getElementById('dashTotalVeiculos').textContent = veiculos.length;
  document.getElementById('dashEmDia').textContent = contagens.emDia;
  document.getElementById('dashAtencao').textContent = contagens.atencao;
  document.getElementById('dashAtrasado').textContent = contagens.atrasado;
  document.getElementById('statusGlobalEmDia').textContent = contagens.emDia;
  document.getElementById('statusGlobalAtencao').textContent = contagens.atencao;
  document.getElementById('statusGlobalAtrasado').textContent = contagens.atrasado;
  document.getElementById('statusGlobalAtrasadoWrap').classList.toggle('animate-pulse', contagens.atrasado > 0);

  renderTabelaFrotaDashboard(veiculos);
  renderCardsVeiculosSidebar(veiculos);
  renderGaugeSaudeFrota(veiculos.length > 0 ? (contagens.emDia / veiculos.length) * 100 : 0);
  popularSelectQrRapido(veiculos);

  await Promise.all([
    renderDocumentosDashboard(),
    renderManutencaoDashboard(),
    renderIncidentesDashboard(),
    renderGraficoCustoCombustivel()
  ]);
}

function renderTabelaFrotaDashboard(veiculos) {
  document.getElementById('tbodyFrotaDashboard').innerHTML = veiculos.map((v) => `
    <tr>
      <td class="py-2">${miniaturaVeiculo(v)}</td>
      <td>${v.modelo}</td>
      <td class="font-mono">${v.placa}</td>
      <td class="font-mono">${v.kmAtual.toLocaleString('pt-BR')}</td>
      <td>${badgePosse(v.tipo_posse)}</td>
      <td>${badgeSaude(v.statusSaude)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="py-6 text-center text-muted">Nenhum veículo cadastrado</td></tr>';
}

function renderCardsVeiculosSidebar(veiculos) {
  document.getElementById('cardsVeiculosSidebar').innerHTML = veiculos.map((v) => {
    const glow = v.statusSaude === 'atrasado' ? 'glow-card-red' : v.statusSaude === 'atencao' ? 'glow-card-yellow' : 'glow-card-green';
    // estilo inline garante o recorte certo mesmo se o CSS ainda não tiver
    // sido aplicado no instante em que o HTML é inserido dinamicamente —
    // é isso que evita a foto aparecer "gigante" por uma fração de segundo
    const estiloFoto = 'display:block;width:100%;height:100%;object-fit:cover;';
    const foto = v.foto_url
      ? `<img src="${v.foto_url}" alt="${v.placa}" style="${estiloFoto}" loading="lazy">`
      : `<img src="/vehicle-placeholder.webp" alt="Sem foto cadastrada" style="${estiloFoto}opacity:.6;" loading="lazy">`;
    return `
      <div class="bg-surface border border-line rounded-2xl overflow-hidden ${glow}">
        <div class="h-28 bg-surface2 overflow-hidden">${foto}</div>
        <div class="p-3">
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="min-w-0">
              <p class="font-display font-700 uppercase text-sm truncate">${v.modelo}</p>
              <p class="text-muted text-xs font-mono">${v.placa} · ${v.kmAtual.toLocaleString('pt-BR')} km</p>
            </div>
            ${badgeSaude(v.statusSaude)}
          </div>
          <div class="flex gap-1.5">
            <button onclick="abrirProntuarioPorId('${v.id}','dados')" title="Ficha (Dados Gerais)" class="mini-icon">
              <svg width="18" height="18" viewBox="0 0 128 128" fill="none" stroke="url(#icon-neon)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 77l9-24h52l22 24v17H18z"/><path d="M34 53l10-14h26l13 14"/><circle cx="36" cy="94" r="10"/><circle cx="92" cy="94" r="10"/><path d="M28 76h72"/></svg>
            </button>
            <button onclick="abrirProntuarioPorId('${v.id}','documentos')" title="Documentos" class="mini-icon">
              <svg width="18" height="18" viewBox="0 0 128 128" fill="none" stroke="url(#icon-neon)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M29 18h49l21 21v71H29z"/><path d="M78 18v23h21M43 60h43M43 74h43M43 88h31"/></svg>
            </button>
            <button onclick="abrirProntuarioPorId('${v.id}','manutencao')" title="Manutenção" class="mini-icon">
              <svg width="18" height="18" viewBox="0 0 128 128" fill="none" stroke="url(#icon-neon)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M91 27a25 25 0 0 0-29 29L27 91a10 10 0 1 0 14 14l35-35a25 25 0 0 0 29-29L88 55 73 40l-2-13z"/></svg>
            </button>
            <button onclick="abrirProntuarioPorId('${v.id}','historico')" title="Histórico de Incidentes" class="mini-icon">
              <svg width="18" height="18" viewBox="0 0 128 128" fill="none" stroke="url(#icon-neon)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M28 48a39 39 0 1 1-1 27"/><path d="M28 48V30M28 48h18"/><path d="M64 45v20l14 9"/></svg>
            </button>
          </div>
        </div>
      </div>`;
  }).join('') || '<p class="text-muted text-sm">Nenhum veículo cadastrado ainda.</p>';
}

function renderGaugeSaudeFrota(pct) {
  const circ = 2 * Math.PI * 52;
  const offset = circ - (Math.max(0, Math.min(100, pct)) / 100) * circ;
  const circle = document.getElementById('gaugeSaudeFrota');
  circle.setAttribute('stroke-dasharray', circ.toFixed(1));
  circle.setAttribute('stroke-dashoffset', offset.toFixed(1));
  circle.style.stroke = pct >= 80 ? '#22D3EE' : pct >= 50 ? '#FFB020' : '#FF3B5C';
  document.getElementById('gaugeSaudeFrotaTexto').textContent = Math.round(pct) + '%';
}

async function renderDocumentosDashboard() {
  const { data, error } = await supabaseClient
    .from('documentos_veiculo')
    .select('id, tipo, descricao, data_vencimento, veiculos(placa)')
    .not('data_vencimento', 'is', null)
    .order('data_vencimento', { ascending: true })
    .limit(30);
  if (error) { console.error(error); return; }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const diasComVencimentoNoMes = new Set();

  document.getElementById('listaDocumentosDashboard').innerHTML = data.map((d) => {
    const venc = new Date(d.data_vencimento + 'T00:00:00');
    const dias = Math.round((venc - hoje) / 86400000);
    const sev = dias <= 15 ? 'critico' : dias <= 30 ? 'preventivo' : 'regular';
    const cores = { critico: 'bg-red-dim text-red', preventivo: 'bg-yellow-dim text-yellow', regular: 'bg-green-dim text-green' };
    const label = dias < 0 ? `Vencido há ${Math.abs(dias)}d` : `${dias}d restantes`;

    if (venc.getMonth() === hoje.getMonth() && venc.getFullYear() === hoje.getFullYear()) {
      diasComVencimentoNoMes.add(d.data_vencimento);
    }

    return `
      <div class="flex items-center justify-between gap-2 rounded-lg bg-surface2 border border-line px-3 py-2">
        <div class="min-w-0">
          <p class="text-sm font-700 truncate">${labelDocumento(d.tipo, d.descricao)} <span class="text-muted font-mono text-xs">${d.veiculos ? d.veiculos.placa : ''}</span></p>
          <p class="text-muted text-xs">${venc.toLocaleDateString('pt-BR')}</p>
        </div>
        <span class="text-xs px-2 py-1 rounded-full ${cores[sev]} font-display uppercase whitespace-nowrap ${sev === 'critico' ? 'animate-pulse' : ''}">${label}</span>
      </div>`;
  }).join('') || '<p class="text-muted text-sm">Nenhum documento com prazo cadastrado.</p>';

  renderCalendarioManutencao(diasComVencimentoNoMes);
}

async function renderManutencaoDashboard() {
  const { data, error } = await supabaseClient.from('v_manutencoes_status').select('*').order('placa');
  if (error) { console.error(error); return; }

  document.getElementById('tbodyManutencaoDashboard').innerHTML = data.map((m) => {
    const pct = Math.min(100, Math.max(0, ((Number(m.km_atual) - Number(m.km_ultima_troca)) / Number(m.intervalo_km)) * 100));
    const status = statusManutencao(m);
    const cor = status === 'vencido' ? 'bg-red' : status === 'atencao' ? 'bg-yellow' : 'bg-green';
    const alvo = Number(m.km_ultima_troca) + Number(m.intervalo_km);
    return `
      <tr>
        <td class="py-2 font-mono">${m.placa}</td>
        <td>${labelManutencao(m.tipo)}</td>
        <td class="font-mono">${Number(m.km_ultima_troca).toLocaleString('pt-BR')}</td>
        <td class="font-mono">${alvo.toLocaleString('pt-BR')}</td>
        <td><div class="w-full h-2 bg-surface2 rounded-full overflow-hidden"><div class="h-full ${cor}" style="width:${pct}%"></div></div></td>
      </tr>`;
  }).join('') || '<tr><td colspan="5" class="py-6 text-center text-muted">Nenhuma manutenção configurada — use o Prontuário de cada veículo</td></tr>';
}

async function renderIncidentesDashboard() {
  const { data, error } = await supabaseClient
    .from('historico_incidentes')
    .select('id, data_ocorrido, tipo, oficina_fornecedor, valor_conserto, veiculos(placa)')
    .order('data_ocorrido', { ascending: false })
    .limit(20);
  if (error) { console.error(error); return; }

  document.getElementById('tbodyIncidentesDashboard').innerHTML = data.map((i) => `
    <tr>
      <td class="py-2 whitespace-nowrap">${new Date(i.data_ocorrido + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
      <td class="font-mono">${i.veiculos ? i.veiculos.placa : '—'}</td>
      <td>${labelIncidente(i.tipo)}</td>
      <td class="text-muted">${i.oficina_fornecedor || '—'}</td>
      <td class="font-mono">${i.valor_conserto ? 'R$ ' + Number(i.valor_conserto).toFixed(2) : '—'}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="py-6 text-center text-muted">Nenhum incidente registrado</td></tr>';
}

function renderCalendarioManutencao(diasComVencimento) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();

  let celulas = '';
  for (let i = 0; i < primeiroDiaSemana; i++) celulas += '<div></div>';
  for (let dia = 1; dia <= totalDias; dia++) {
    const chave = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const temVencimento = diasComVencimento.has(chave);
    const ehHoje = dia === hoje.getDate();
    celulas += `<div class="aspect-square flex items-center justify-center text-[11px] rounded-md ${temVencimento ? 'bg-red-dim text-red font-700' : 'text-muted'} ${ehHoje ? 'ring-1 ring-brand' : ''}">${dia}</div>`;
  }

  document.getElementById('calendarioManutencao').innerHTML = `
    <p class="text-center text-xs uppercase font-display text-muted mb-2">${hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
    <div class="grid grid-cols-7 gap-1 text-center text-[10px] text-muted mb-1">
      <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
    </div>
    <div class="grid grid-cols-7 gap-1">${celulas}</div>`;
}

async function renderGraficoCustoCombustivel() {
  const seisMesesAtras = new Date();
  seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5);
  seisMesesAtras.setDate(1);
  seisMesesAtras.setHours(0, 0, 0, 0);

  const { data, error } = await supabaseClient
    .from('fuel_supplies').select('valor_total, created_at').gte('created_at', seisMesesAtras.toISOString());
  if (error) { console.error(error); return; }

  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    d.setDate(1);
    meses.push({ chave: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), total: 0 });
  }
  (data || []).forEach((f) => {
    const d = new Date(f.created_at);
    const chave = `${d.getFullYear()}-${d.getMonth()}`;
    const m = meses.find((x) => x.chave === chave);
    if (m) m.total += Number(f.valor_total);
  });

  const maxValor = Math.max(...meses.map((m) => m.total), 1);
  document.getElementById('graficoCustoCombustivel').innerHTML = meses.map((m) => `
    <div class="flex-1 flex flex-col items-center justify-end h-full gap-1">
      <span class="text-[9px] text-muted font-mono">${m.total > 0 ? 'R$' + Math.round(m.total) : ''}</span>
      <div class="w-full bg-brand rounded-t transition-all" style="height:${Math.max(3, (m.total / maxValor) * 100)}%"></div>
      <span class="text-[10px] text-muted uppercase font-display">${m.label}</span>
    </div>`).join('');
}

function popularSelectQrRapido(veiculos) {
  document.getElementById('selectQrRapido').innerHTML = veiculos.map((v) =>
    `<option value="${v.id}" data-qr="${v.qr_code_id || ''}" data-placa="${v.placa}">${v.placa} — ${v.modelo}</option>`
  ).join('') || '<option value="">Nenhum veículo cadastrado</option>';
}

document.getElementById('btnQrRapido').addEventListener('click', () => {
  const sel = document.getElementById('selectQrRapido');
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) { alert('Cadastre um veículo primeiro, na aba Cadastros.'); return; }
  abrirModalQr(opt.value, opt.dataset.qr, opt.dataset.placa);
});

// atalhos da barra superior: rolam até o módulo correspondente no dashboard
function atalhoProntuario(destino) {
  const mapa = {
    dados: 'modProntuarioFrota',
    documentos: 'listaDocumentosDashboard',
    manutencao: 'tbodyManutencaoDashboard',
    historico: 'tbodyIncidentesDashboard'
  };
  const el = document.getElementById(mapa[destino]);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// 5. INIT — o carregamento dos cadastros acontece no onAuthStateChange
// (seção 0.2) assim que a sessão é confirmada, não aqui. Isso evita buscar
// dados antes de saber se o usuário está autenticado.
// ---------------------------------------------------------------------------
