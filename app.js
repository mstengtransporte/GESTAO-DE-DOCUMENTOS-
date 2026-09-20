// ============================================================
// 1) CONFIGURAÇÃO DO SUPABASE — COLOQUE SEUS DADOS AQUI
// ============================================================
const SUPABASE_URL = "https://bddjdpyfypsiwnirbyhv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZGpkcHlmeXBzaXduaXJieWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NDk1MjgsImV4cCI6MjEwMDQyNTUyOH0.0HnH7caYH6sLp5n68izQXqbCJ-cLqTyxELl1EqoHHww";

const elCarregando = document.getElementById("telaCarregando");

if (
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY ||
  SUPABASE_URL.includes("COLOQUE_AQUI") ||
  SUPABASE_ANON_KEY.includes("COLOQUE_AQUI")
) {
  mostrarErroFatal(
    "Faltou configurar o Supabase",
    "Abra o arquivo app.js e substitua SUPABASE_URL e SUPABASE_ANON_KEY (no topo do arquivo) pelos valores do seu projeto."
  );
  throw new Error("Configuração do Supabase ausente.");
}

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  mostrarErroFatal(
    "Não consegui carregar a biblioteca do Supabase",
    "O script da CDN (supabase-js) não carregou."
  );
  throw new Error("Biblioteca do Supabase não carregada.");
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // detectSessionInUrl fica no padrão (true) de propósito aqui — o fluxo de
    // recuperação de senha (link "type=recovery" enviado por email) depende disso
    // pra funcionar, diferente do sistema de RDO que não usa esse tipo de link.
    storageKey: "escala-master-energy-auth",
    storage: window.localStorage,
  },
});

// Log de diagnóstico: se a sessão cair sozinha (pedir login de novo sem ter clicado em
// "Sair"), isso aparece no console (F12 no navegador) mostrando o motivo exato — token
// expirado sem conseguir renovar, revogado, etc. Antes ficava mudo, sem pista nenhuma.
supabaseClient.auth.onAuthStateChange((evento, sessao) => {
  console.log(
    "[Escala][auth]",
    evento,
    sessao ? `expira em ${sessao.expires_at ? new Date(sessao.expires_at * 1000).toLocaleString("pt-BR") : "?"}` : "(sem sessão)"
  );
});

const elTelaLogin = document.getElementById("telaLogin");
const elTelaCadastro = document.getElementById("telaCadastro");
const elApp = document.getElementById("app");

const formLogin = document.getElementById("formLogin");
const formCadastro = document.getElementById("formCadastro");

let usuarioAtual = null;
let perfilAtual = null;
let erroAoBuscarPerfil = false;

function mostrarErroFatal(titulo, mensagem) {
  elCarregando.innerHTML = `
    <div style="max-width:420px;text-align:center;">
      <div style="font-size:32px;margin-bottom:10px;">⚠️</div>
      <h2 style="color:#B4180F;margin:0 0 8px;font-size:17px;">${titulo}</h2>
      <p style="color:#5B7A93;font-size:13.5px;line-height:1.5;">${mensagem}</p>
    </div>
  `;
}

const elTelaEsqueciSenha = document.getElementById("telaEsqueciSenha");
const elTelaNovaSenha = document.getElementById("telaNovaSenha");

function mostrarTela(nome) {
  elCarregando.classList.add("hidden");
  elTelaLogin.classList.toggle("hidden", nome !== "login");
  elTelaCadastro.classList.toggle("hidden", nome !== "cadastro");
  elTelaEsqueciSenha.classList.toggle("hidden", nome !== "esqueciSenha");
  elTelaNovaSenha.classList.toggle("hidden", nome !== "novaSenha");
  elApp.classList.toggle("hidden", nome !== "app");
  // CORREÇÃO DE BUG — faixa branca no rodapé da tela de login (2026-08-31): em vez de
  // depender de acertar a altura EXATA da tela (frágil — muda de navegador pra
  // navegador, de zoom, de moldura de janela), garantimos que QUALQUER sobra de
  // espaço, se acontecer, apareça na cor escura da própria imagem de fundo, nunca
  // branca. O body só fica escuro enquanto uma tela de login/autenticação está na
  // tela — no app principal, continua com o fundo claro de sempre.
  const telaDeAutenticacao = (nome === "login" || nome === "cadastro" || nome === "esqueciSenha" || nome === "novaSenha");
  document.body.classList.toggle("fundo-tela-auth", telaDeAutenticacao);
  document.documentElement.classList.toggle("fundo-tela-auth", telaDeAutenticacao);
}

const INICIO_CARREGAMENTO = Date.now();
// CORREÇÃO DE VELOCIDADE (2026-08-31): antes, era 1100ms — o app OBRIGAVA a pessoa a
// esperar 1,1 segundo parada na tela de splash, mesmo quando a internet respondia na
// hora. Agora a troca de tela acontece assim que os dados de sessão realmente
// chegarem — sem nenhuma espera artificial por cima.
const TEMPO_MINIMO_SPLASH_MS = 0;
async function esperarTempoMinimoSplash() {
  const passou = Date.now() - INICIO_CARREGAMENTO;
  if (passou < TEMPO_MINIMO_SPLASH_MS) {
    await new Promise((resolve) => setTimeout(resolve, TEMPO_MINIMO_SPLASH_MS - passou));
  }
}

async function iniciar() {
  const vieloDeRecuperacaoSenha =
    window.location.hash.includes("type=recovery") ||
    window.location.search.includes("type=recovery");

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const session = data.session;

    await esperarTempoMinimoSplash();
    if (vieloDeRecuperacaoSenha && session && session.user) {
      mostrarTela("novaSenha");
    } else if (session && session.user) {
      await entrarNoApp(session.user);
    } else {
      mostrarTela("login");
    }
  } catch (e) {
    console.error("Erro ao iniciar o app:", e);
    mostrarErroFatal(
      "Não consegui falar com o Supabase",
      "Confira se a URL e a chave no app.js estão corretas. Detalhe técnico: " + (e.message || e)
    );
    return;
  }

  supabaseClient.auth.onAuthStateChange((evento, session) => {
    if (evento === "PASSWORD_RECOVERY") {
      mostrarTela("novaSenha");
      return;
    }
    if (evento === "SIGNED_IN" && session && session.user && !vieloDeRecuperacaoSenha) {
      entrarNoApp(session.user);
    }
    if (evento === "SIGNED_OUT") {
      usuarioAtual = null;
      perfilAtual = null;
      if(typeof pararDeObservarDia === "function") pararDeObservarDia();
      mostrarTela("login");
    }
  });
}

async function buscarPerfil(userId) {
  const { data, error } = await supabaseClient
    .from("perfis_usuario")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Não foi possível buscar o perfil:", error.message);
    return { erro: error.message };
  }
  return data;
}

// TRAVA DE SEGURANÇA: este aplicativo (Escala) é de uso EXCLUSIVO do Administrador.
// Checa de verdade o perfil vindo da tabela "profiles" — antes disto, ehAdmin() sempre
// devolvia true sem checar nada, deixando literalmente qualquer pessoa autenticada
// (inclusive Encarregados) passar como se fosse admin.
//
// Aceita o valor tanto no campo "role" quanto "papel" (nomes diferentes já apareceram
// em projetos parecidos, então cobre os dois pra não depender de acertar o nome exato
// da coluna) e usa .toLowerCase() + .includes("admin") em vez de igualdade exata — assim
// tanto 'admin' quanto 'Admin', 'ADMIN' ou 'administrador' são reconhecidos como admin;
// qualquer outro valor ('encarregado', 'comum', em branco, etc.) é tratado como
// não-admin e barrado.
function valorEhAdmin(perfil) {
  if (!perfil) return false;
  const valor = (perfil.role || perfil.papel || perfil.perfil || "").toString().toLowerCase();
  return valor.includes("admin");
}

function ehAdmin() {
  return valorEhAdmin(perfilAtual);
}

// Nega o acesso e desloga na hora: chamado sempre que o perfil autenticado não é
// 'admin' (ou quando nem foi possível confirmar o perfil — nesse caso também barra,
// por segurança, nunca assume admin "por via das dúvidas"). Encerra a sessão do
// Supabase de verdade (signOut), então mesmo recarregando a página a pessoa não
// continua logada; mostra a tela de login de novo com a mensagem de acesso negado.
async function bloquearAcessoNaoAdmin() {
  try {
    await supabaseClient.auth.signOut();
  } catch (e) {
    console.error("Erro ao encerrar sessão negada:", e);
  }
  usuarioAtual = null;
  perfilAtual = null;
  mostrarTela("login");
  const msgErro = document.getElementById("loginErro");
  if (msgErro) {
    msgErro.textContent = "Acesso restrito ao Administrador";
    msgErro.classList.remove("hidden");
  }
}

function mostrarAvisoPapel(tipo, detalhe) {
  if (tipo === "ok") {
    const existente = document.getElementById("avisoPapel");
    if (existente) existente.remove();
    return;
  }
  let aviso = document.getElementById("avisoPapel");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "avisoPapel";
    aviso.style.cssText =
      "position:sticky;top:0;z-index:60;padding:10px 16px;font-size:13px;text-align:center;font-weight:600;";
    document.body.insertBefore(aviso, document.body.firstChild.nextSibling);
  }
  if (tipo === "erro") {
    aviso.style.background = "#FCE1DF";
    aviso.style.color = "#B4180F";
    aviso.innerHTML =
      "⚠️ Não consegui confirmar seu perfil no Supabase (" + escaparHtml(detalhe || "erro desconhecido") + "). " +
      "Alguns botões podem estar escondidos por segurança. " +
      '<button id="btnTentarPerfilDeNovo" style="margin-left:8px;background:#B4180F;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;">Tentar de novo</button>';
    document.getElementById("btnTentarPerfilDeNovo").addEventListener("click", async () => {
      aviso.remove();
      await entrarNoApp(usuarioAtual);
    });
  } else {
    aviso.remove();
  }
}

async function entrarNoApp(user) {
  usuarioAtual = user;
  const resultadoPerfil = await buscarPerfil(user.id);

  if (resultadoPerfil && resultadoPerfil.erro) {
    // Não deu pra confirmar o perfil de verdade — por segurança, trata como acesso
    // negado também. NUNCA deixa passar assumindo admin "por via das dúvidas".
    perfilAtual = null;
    erroAoBuscarPerfil = true;
    await bloquearAcessoNaoAdmin();
    return;
  }

  perfilAtual = resultadoPerfil;
  erroAoBuscarPerfil = false;

  // ============================================================================
  // TRAVA DE SEGURANÇA — barra aqui, ANTES de mostrar qualquer tela do sistema ou
  // carregar qualquer dado. Se o perfil não for 'admin' (inclusive 'encarregado' ou
  // qualquer outro valor), o login é negado imediatamente: desloga, mostra a tela de
  // login de novo com a mensagem de acesso negado, e a função para aqui — nada do
  // que vem depois (mostrarTela("app"), loadState(), etc.) chega a rodar.
  // ============================================================================
  if (!valorEhAdmin(perfilAtual)) {
    await bloquearAcessoNaoAdmin();
    return;
  }

  mostrarAvisoPapel("ok");

  document.getElementById("nomeUsuarioLogado").textContent =
    (perfilAtual && perfilAtual.nome) || usuarioAtual.email;
  document.getElementById("badgeAdmin").classList.add("hidden");
  aplicarRestricoesPorPapel();

  mostrarTela("app");

  if(typeof loadState === "function"){
    await loadState();
    if(typeof garantirObrasClientes === "function"){
      try{ garantirObrasClientes(); }catch(e){ console.error("Falha ao garantir obras padrão:", e); }
    }
    if(typeof document !== "undefined"){
      const inputData = document.getElementById("inputData");
      if(inputData && typeof dataAtual !== "undefined") inputData.value = dataAtual;
    }
    if(typeof renderTudo === "function") renderTudo();
    if(typeof atualizarBotaoDesfazer === "function") atualizarBotaoDesfazer();
    if(typeof observarDiaAtual === "function") observarDiaAtual();
  }
}

function aplicarRestricoesPorPapel() {
  document.querySelectorAll(".somente-admin").forEach((el) => {
    el.classList.toggle("hidden", !ehAdmin());
  });
}

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const senha = document.getElementById("loginSenha").value;
  const btn = document.getElementById("btnLogin");
  const msgErro = document.getElementById("loginErro");

  msgErro.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Entrando...";

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });

  btn.disabled = false;
  btn.textContent = "Entrar";

  if (error) {
    msgErro.textContent = traduzirErro(error.message);
    msgErro.classList.remove("hidden");
    return;
  }
});

formCadastro.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("cadastroNome").value.trim();
  const email = document.getElementById("cadastroEmail").value.trim();
  const senha = document.getElementById("cadastroSenha").value;
  const btn = document.getElementById("btnCadastro");
  const msgErro = document.getElementById("cadastroErro");
  const msgSucesso = document.getElementById("cadastroSucesso");

  msgErro.classList.add("hidden");
  msgSucesso.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Cadastrando...";

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password: senha,
    options: { data: { nome } },
  });

  btn.disabled = false;
  btn.textContent = "Cadastrar";

  if (error) {
    msgErro.textContent = traduzirErro(error.message);
    msgErro.classList.remove("hidden");
    return;
  }

  if (data.session) {
    return;
  }
  msgSucesso.textContent = "Cadastro feito! Confira seu e-mail para confirmar a conta antes de entrar.";
  msgSucesso.classList.remove("hidden");
  formCadastro.reset();
});

document.getElementById("btnLogout").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});

// Os links "Cadastre-se" e "Esqueci minha senha" foram removidos da tela de login (o
// cadastro é feito direto pelo admin no Supabase, e-mails são fictícios). Os elementos
// não existem mais no HTML — por isso os "?." aqui, pra não quebrar o carregamento do
// app.js inteiro tentando anexar evento num elemento inexistente. As telas de Cadastro/
// Esqueci Senha em si continuam no HTML (só sem porta de entrada a partir do login).
document.getElementById("linkIrParaCadastro")?.addEventListener("click", (e) => {
  e.preventDefault();
  mostrarTela("cadastro");
});
document.getElementById("linkIrParaLogin").addEventListener("click", (e) => {
  e.preventDefault();
  mostrarTela("login");
});

document.getElementById("linkEsqueciSenha")?.addEventListener("click", (e) => {
  e.preventDefault();
  mostrarTela("esqueciSenha");
});
document.getElementById("linkVoltarLogin").addEventListener("click", (e) => {
  e.preventDefault();
  mostrarTela("login");
});

document.getElementById("formEsqueciSenha").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("esqueciSenhaEmail").value.trim();
  const btn = document.getElementById("btnEsqueciSenha");
  const msgErro = document.getElementById("esqueciSenhaErro");
  const msgSucesso = document.getElementById("esqueciSenhaSucesso");

  msgErro.classList.add("hidden");
  msgSucesso.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });

  btn.disabled = false;
  btn.textContent = "Enviar link";

  if (error) {
    msgErro.textContent = traduzirErro(error.message);
    msgErro.classList.remove("hidden");
    return;
  }
  msgSucesso.textContent = "Prontinho! Confira seu e-mail (inclusive o spam) e toque no link pra escolher uma senha nova.";
  msgSucesso.classList.remove("hidden");
});

document.getElementById("formNovaSenha").addEventListener("submit", async (e) => {
  e.preventDefault();
  const novaSenha = document.getElementById("novaSenhaCampo").value;
  const btn = document.getElementById("btnNovaSenha");
  const msgErro = document.getElementById("novaSenhaErro");

  msgErro.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });

  btn.disabled = false;
  btn.textContent = "Salvar nova senha";

  if (error) {
    msgErro.textContent = traduzirErro(error.message);
    msgErro.classList.remove("hidden");
    return;
  }
  toast_login_ok();
});
function toast_login_ok(){
  history.replaceState(null, "", window.location.pathname);
  supabaseClient.auth.getUser().then(({ data }) => {
    if (data && data.user) entrarNoApp(data.user);
    else mostrarTela("login");
  });
}

document.getElementById("btnAbrirUsuarios").addEventListener("click", () => {
  if(typeof fecharTodosOverlays === "function") fecharTodosOverlays();
  document.getElementById("painelUsuariosSupabase").classList.remove("hidden");
  carregarPainelAdmin();
});
document.getElementById("btnFecharPainelUsuarios").addEventListener("click", () => {
  document.getElementById("painelUsuariosSupabase").classList.add("hidden");
});

async function carregarPainelAdmin() {
  const cont = document.getElementById("listaUsuariosAdmin");
  // Filtro: como o mesmo projeto Supabase é compartilhado com o RDO, a tabela
  // "profiles" tem tanto administradores quanto encarregados juntos — esta tela é
  // só de gestão de administradores do sistema de Escala, então só mostra quem é
  // admin. Encarregados (usados no RDO) nunca aparecem aqui. Busca todos e filtra
  // no cliente com a mesma checagem tolerante do login (valorEhAdmin: aceita
  // "role" ou "papel", .toLowerCase() + .includes("admin")) — assim os dois pontos
  // que decidem "quem é admin" nunca ficam dessincronizados um do outro.
  const { data: todosUsuarios, error } = await supabaseClient
    .from("perfis_usuario")
    .select("*")
    .order("nome");

  if (error) {
    cont.textContent = "Não foi possível carregar os usuários.";
    console.error(error.message);
    return;
  }

  const usuarios = todosUsuarios.filter(valorEhAdmin);

  cont.innerHTML = `
    <table class="tabela-usuarios">
      <thead><tr><th>Nome</th><th>E-mail</th></tr></thead>
      <tbody>
        ${usuarios.map((u) => `
          <tr>
            <td>${escaparHtml(u.nome || "(sem nome)")}</td>
            <td>${escaparHtml(u.email || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function traduzirErro(mensagem) {
  const mapa = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "User already registered": "Já existe uma conta com esse e-mail.",
    "Email not confirmed": "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).",
    "Password should be at least 6 characters": "A senha precisa ter pelo menos 6 caracteres.",
    "New password should be different from the old password.": "Escolha uma senha diferente da atual.",
    "Auth session missing!": "O link de recuperação expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\".",
  };
  return mapa[mensagem] || mensagem;
}

window.DADOS = (() => {
  async function sincronizarTabelaPorNome(tabela, itensLocais, mapearParaLinha, nomesParaExcluir, colunaChave){
    colunaChave = colunaChave || "nome"; // "nome" pra funcionarios/obras, "placa" pra veiculos
    nomesParaExcluir = nomesParaExcluir || [];
    if(nomesParaExcluir.length > 0){
      const { error: errDel } = await supabaseClient.from(tabela).delete().in(colunaChave, nomesParaExcluir);
      if(errDel) throw errDel;
    }
    if(itensLocais.length > 0){
      const { error: errUp } = await supabaseClient.from(tabela).upsert(
        itensLocais.map(mapearParaLinha),
        { onConflict: colunaChave }
      );
      if(errUp) throw errUp;
    }
  }

  const cadastro = {
    async buscar(){
      const [rf, ro, rv] = await Promise.all([
        supabaseClient.from("funcionarios").select("*").order("nome"),
        supabaseClient.from("obras").select("*").order("nome"),
        supabaseClient.from("veiculos").select("*").order("placa"),
      ]);
      if(rf.error) throw rf.error;
      if(ro.error) throw ro.error;
      if(rv.error) throw rv.error;
      const veiculosCapacidade = {};
      const veiculosFotos = {};
      const veiculosResponsavel = {};
      const veiculosKmAtual = {};
      rv.data.forEach(v => {
        if(v.capacidade_passageiros) veiculosCapacidade[v.placa] = v.capacidade_passageiros;
        if(v.foto_url) veiculosFotos[v.placa] = v.foto_url;
        if(v.responsavel) veiculosResponsavel[v.placa] = v.responsavel;
        if(v.km_atual!==null && v.km_atual!==undefined) veiculosKmAtual[v.placa] = v.km_atual;
      });
      return {
        funcionarios: rf.data.map(f => ({ nome: f.nome, telefone: f.telefone, funcao: f.funcao })),
        obras: ro.data.map(o => ({ id: o.id, nome: o.nome, logo: o.logo })),
        veiculos: rv.data.map(v => v.placa),
        veiculosCapacidade,
        veiculosFotos,
        veiculosResponsavel,
        veiculosKmAtual,
      };
    },
    async salvar(funcionarios, obras, veiculos, veiculosCapacidade, exclusoes, veiculosFotos, veiculosResponsavel, veiculosKmAtual){
      veiculosCapacidade = veiculosCapacidade || {};
      veiculosFotos = veiculosFotos || {};
      veiculosResponsavel = veiculosResponsavel || {};
      veiculosKmAtual = veiculosKmAtual || {};
      exclusoes = exclusoes || {};
      await sincronizarTabelaPorNome("funcionarios", funcionarios, f => ({ nome: f.nome, telefone: f.telefone || null, funcao: f.funcao || null }), exclusoes.funcionarios);
      await sincronizarTabelaPorNome("veiculos", veiculos.map(nome => ({ nome, capacidade: veiculosCapacidade[nome] || null, foto: veiculosFotos[nome] || null, responsavel: veiculosResponsavel[nome] || null, km_atual: (veiculosKmAtual[nome]===0?0:(veiculosKmAtual[nome]||null)) })), v => ({ placa: v.nome, capacidade_passageiros: v.capacidade, foto_url: v.foto, responsavel: v.responsavel, km_atual: v.km_atual }), exclusoes.veiculos, "placa");
      await sincronizarTabelaPorNome("obras", obras, o => ({ nome: o.nome, logo: o.logo || null }), exclusoes.obras);
      const { data: obrasFrescas, error } = await supabaseClient.from("obras").select("*").order("nome");
      if(error) throw error;
      return { obras: obrasFrescas.map(o => ({ id: o.id, nome: o.nome, logo: o.logo })) };
    },
    async excluirTudo(){
      // DESATIVADO na versão do ERP: funcionarios/obras agora são a base
      // COMPARTILHADA de todo o sistema (SST, RDO, e futuros módulos) — apagar
      // tudo aqui apagaria também ASOs, NRs, EPIs e RDOs de todo mundo.
      throw new Error('Essa função foi desativada nesta versão — funcionários e obras agora são compartilhados com o resto do ERP (SST, RDO). Peça a um administrador do sistema pra excluir registros individualmente, se precisar.');
    },
  };

  const escalas = {
    async buscarDoDia(data){
      const { data: linha, error } = await supabaseClient
        .from("escalas_diarias").select("dados").eq("data", data).maybeSingle();
      if(error) throw error;
      return linha ? linha.dados : { atrib: {}, obras: {} };
    },
    async salvarDoDia(data, dados){
      const sessao = await supabaseClient.auth.getSession();
      const userId = sessao.data.session ? sessao.data.session.user.id : null;
      const { error } = await supabaseClient.from("escalas_diarias").upsert(
        { data, dados, atualizado_em: new Date().toISOString(), atualizado_por: userId },
        { onConflict: "data" }
      );
      if(error) throw error;
    },
    observarDia(data, aoMudar){
      const canal = supabaseClient
        .channel("escala-dia-" + data)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "escalas_diarias", filter: "data=eq." + data },
          (payload) => {
            if(payload.new && payload.new.dados) aoMudar(payload.new.dados);
          }
        )
        .subscribe();
      return () => { supabaseClient.removeChannel(canal); };
    },
    async listarHistorico(){
      const { data, error } = await supabaseClient
        .from("escalas_diarias").select("data,atualizado_em").order("data", { ascending: false });
      if(error) throw error;
      return data;
    },
    // Busca o conteúdo completo (não só a data) de todos os dias — usado pelo painel
    // "KM dos Veículos", que precisa varrer o histórico de todas as obras/dias pra somar
    // a quilometragem de cada veículo ao longo do tempo. limiteDias corta a busca nos
    // últimos N dias (padrão 365) pra não trazer o histórico inteiro sempre que alguém
    // abre o painel — normalmente isso já é mais que suficiente pro controle de frota.
    async buscarHistoricoCompleto(limiteDias){
      limiteDias = limiteDias || 365;
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - limiteDias);
      const dataLimiteStr = dataLimite.toISOString().slice(0,10);
      const { data, error } = await supabaseClient
        .from("escalas_diarias").select("data,dados").gte("data", dataLimiteStr).order("data", { ascending: true });
      if(error) throw error;
      return data;
    },
    // CORREÇÃO DE VELOCIDADE (2026-08-31): versão leve, usada pelo painel "KM dos
    // Veículos" — busca só o pedacinho de quilometragem de cada dia (calculado
    // dentro do próprio banco, função km_historico_veiculos), em vez de trazer o
    // registro do dia inteiro (todas as obras, funcionários, tudo) só pra usar essa
    // parte pequena. Se a função ainda não existir no banco (script SQL não rodado
    // ainda), cai automaticamente pro método antigo — nunca quebra o painel.
    async buscarHistoricoKmLeve(limiteDias){
      limiteDias = limiteDias || 365;
      const { data, error } = await supabaseClient.rpc("km_historico_veiculos", { dias_atras: limiteDias });
      if(error) throw error;
      return data;
    },
    async excluirDoDia(data){
      const { error } = await supabaseClient.from("escalas_diarias").delete().eq("data", data);
      if(error) throw error;
    },
    async excluirTudo(){
      const { error } = await supabaseClient.from("escalas_diarias")
        .delete().not("id", "is", null);
      if(error) throw error;
    },
  };

  return { cadastro, escalas };
})();

iniciar().catch((e) => {
  console.error("Erro inesperado ao iniciar:", e);
  mostrarErroFatal("Algo deu errado ao carregar o sistema", "Detalhe técnico: " + (e.message || e));
});
