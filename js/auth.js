/* Tela de login / cadastro / recuperação de senha (porta de AuthScreen.tsx). */
window.Itapet = window.Itapet || {};
(function (I) {
  const { esc } = I.ui;
  const sb = I.sb;
  const FEATURES = [
    ["📋", "Prontuário digital completo"],
    ["💉", "Carteira de vacinação inteligente"],
    ["📅", "Acompanhamento de consultas"],
    ["🔔", "Alertas e lembretes automáticos"],
    ["🔐", "Dados seguros — LGPD"],
  ];

  const st = {
    tab: "login", // login | register | forgot
    role: "tutor",
    login: { email: "", password: "" },
    reg: { nome: "", email: "", telefone: "", password: "", confirm: "", cnpj: "", endereco: "", cep: "" },
  };
  let busy = false;

  const field = (id, label, path, opts = {}) => {
    const [a, b] = path.split(".");
    return (
      '<div class="form-group"><label for="' + id + '">' + esc(label) + "</label>" +
      '<input id="' + id + '" class="form-input" data-s="' + path + '" type="' + (opts.type || "text") + '"' +
      (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : "") +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") +
      ' value="' + esc(st[a][b]) + '"></div>'
    );
  };

  function loginForm() {
    return (
      '<form data-form="login"><h2>Bem-vindo de volta! 👋</h2>' +
      '<p class="subtitle">Entre com sua conta para acessar o painel</p>' +
      field("login-email", "E-mail", "login.email", { type: "email", autocomplete: "email", placeholder: "seu@email.com" }) +
      field("login-password", "Senha", "login.password", { type: "password", autocomplete: "current-password", placeholder: "••••••••" }) +
      '<div style="text-align:right;margin-top:-6px;margin-bottom:14px"><button type="button" class="auth-link" data-tab="forgot">Esqueci minha senha</button></div>' +
      '<button class="btn-primary" type="submit">Entrar</button>' +
      '<div class="auth-hint"><strong>Já usava o Itapet antes?</strong> Seus dados foram mantidos. No primeiro acesso, clique em ' +
      '<button type="button" class="auth-link" data-tab="register">Cadastrar</button> usando o mesmo e-mail e crie uma nova senha. ' +
      "Seu perfil e seus pets aparecem automaticamente.</div></form>"
    );
  }

  function forgotForm() {
    return (
      '<form data-form="forgot"><h2>Redefinir senha 🔑</h2>' +
      '<p class="subtitle">Enviaremos um link para você criar uma nova senha</p>' +
      field("forgot-email", "E-mail", "login.email", { type: "email", placeholder: "seu@email.com" }) +
      '<button class="btn-primary" type="submit">Enviar link</button>' +
      '<div style="text-align:center;margin-top:14px"><button type="button" class="auth-link" data-tab="login">Voltar para o login</button></div></form>'
    );
  }

  function registerForm() {
    const c = st.role === "clinica";
    return (
      '<form data-form="register"><h2>Criar conta</h2><p class="subtitle">Escolha seu perfil para começar</p>' +
      '<div class="role-selector">' +
      '<button type="button" class="role-btn' + (!c ? " selected" : "") + '" data-role="tutor"><span class="role-icon">👤</span><span class="role-label">Tutor</span></button>' +
      '<button type="button" class="role-btn' + (c ? " selected" : "") + '" data-role="clinica"><span class="role-icon">🏥</span><span class="role-label">Clínica</span></button>' +
      "</div>" +
      field("register-name", c ? "Nome da clínica" : "Nome completo", "reg.nome", { placeholder: c ? "Nome da clínica" : "Seu nome completo" }) +
      '<div class="form-row">' +
      field("register-email", "E-mail", "reg.email", { type: "email", autocomplete: "email", placeholder: "seu@email.com" }) +
      field("register-phone", "Telefone", "reg.telefone", { type: "tel", placeholder: "(11) 99999-9999" }) +
      "</div>" +
      (c
        ? field("register-cnpj", "CNPJ", "reg.cnpj", { placeholder: "00.000.000/0000-00" }) +
          '<div class="form-row">' +
          field("register-address", "Endereço", "reg.endereco", { placeholder: "Rua, número, bairro" }) +
          field("register-cep", "CEP", "reg.cep", { placeholder: "00000-000" }) +
          "</div>"
        : "") +
      '<div class="form-row">' +
      field("register-password", "Senha", "reg.password", { type: "password", autocomplete: "new-password", placeholder: "Mínimo 6 caracteres" }) +
      field("register-password-confirm", "Confirmar senha", "reg.confirm", { type: "password", autocomplete: "new-password", placeholder: "Repita a senha" }) +
      "</div>" +
      '<button class="btn-primary" type="submit">Criar minha conta</button></form>'
    );
  }

  function render() {
    const root = document.getElementById("root");
    root.innerHTML =
      '<div id="auth-screen"><div class="auth-left"><div class="auth-brand"><div class="logo-icon">🐾</div><h1>Itapet</h1>' +
      "<p>Carteira Pet Digital &amp; Prontuário Eletrônico</p></div><div class=\"auth-features\">" +
      FEATURES.map((f) => '<div class="auth-feature-item"><div class="feat-icon">' + f[0] + "</div><span>" + esc(f[1]) + "</span></div>").join("") +
      '</div></div><div class="auth-right"><div class="auth-card"><div class="auth-tabs">' +
      '<button class="auth-tab' + (st.tab !== "register" ? " active" : "") + '" data-tab="login">Entrar</button>' +
      '<button class="auth-tab' + (st.tab === "register" ? " active" : "") + '" data-tab="register">Cadastrar</button></div>' +
      (st.tab === "login" ? loginForm() : st.tab === "forgot" ? forgotForm() : registerForm()) +
      "</div></div></div>";
  }

  function setBusy(form, on, label) {
    busy = on;
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; }
    else if (btn.dataset.label) btn.textContent = btn.dataset.label;
    btn.disabled = on;
  }

  async function signIn(form) {
    const email = st.login.email.trim();
    if (!email || !st.login.password) return I.ui.toast("Informe e-mail e senha.");
    setBusy(form, true, "Entrando...");
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password: st.login.password });
      if (error) throw error;
      await I.app.enter();
    } catch (error) {
      I.ui.toast(I.db.errorMessage(error));
      setBusy(form, false);
    }
  }

  async function register(form) {
    const r = st.reg;
    const nome = r.nome.trim();
    const email = r.email.trim();
    if (!nome || !email || !r.password) return I.ui.toast("Informe nome, e-mail e senha.");
    if (r.password.length < 6) return I.ui.toast("A senha deve ter pelo menos 6 caracteres.");
    if (r.password !== r.confirm) return I.ui.toast("As senhas não coincidem.");
    const cnpj = r.cnpj.replace(/\D/g, "");
    const clinic = st.role === "clinica";
    if (clinic && !I.rules.isValidCnpj(cnpj)) return I.ui.toast("Informe um CNPJ válido com 14 dígitos.");
    setBusy(form, true, "Criando conta...");
    try {
      const { data, error } = await sb.auth.signUp({
        email,
        password: r.password,
        options: {
          emailRedirectTo: I.ui.siblingUrl("index.html"),
          data: {
            role: st.role, nome, telefone: r.telefone.trim(),
            cnpj: clinic ? cnpj : "", endereco: clinic ? r.endereco.trim() : "", cep: clinic ? r.cep.trim() : "",
          },
        },
      });
      if (error) throw error;
      if (data.session) return await I.app.enter();
      I.ui.toast("Conta criada. Entre com seu e-mail e senha.");
      st.login = { email, password: "" };
      st.tab = "login";
      render();
      busy = false;
    } catch (error) {
      I.ui.toast(I.db.errorMessage(error));
      setBusy(form, false);
    }
  }

  async function forgot(form) {
    const email = st.login.email.trim();
    if (!email) return I.ui.toast("Informe seu e-mail.");
    setBusy(form, true, "Enviando...");
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: I.ui.siblingUrl("redefinir-senha.html") });
      if (error) throw error;
      I.ui.toast("Enviamos um link para redefinir sua senha. Confira seu e-mail.");
      st.tab = "login";
      render();
      busy = false;
    } catch (error) {
      I.ui.toast(I.db.errorMessage(error));
      setBusy(form, false);
    }
  }

  I.auth = {
    show() {
      const root = document.getElementById("root");
      st.tab = st.tab === "register" ? "register" : "login";
      busy = false;
      render();
      root.oninput = (e) => {
        const path = e.target.dataset && e.target.dataset.s;
        if (!path) return;
        const [a, b] = path.split(".");
        st[a][b] = e.target.value;
      };
      root.onclick = (e) => {
        const tab = e.target.closest("[data-tab]");
        const role = e.target.closest("[data-role]");
        if (tab) { st.tab = tab.dataset.tab; render(); }
        else if (role) { st.role = role.dataset.role; render(); }
      };
      root.onsubmit = (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.target;
        const kind = form.dataset.form;
        if (kind === "login") signIn(form);
        else if (kind === "register") register(form);
        else if (kind === "forgot") forgot(form);
      };
    },
  };
})(window.Itapet);
