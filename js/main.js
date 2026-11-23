/* Inicialização: sessão, carregamento do perfil/dados e entrada no app. */
window.Itapet = window.Itapet || {};
(function (I) {
  const root = () => document.getElementById("root");
  let entering = false;

  function showLoading() {
    root().onclick = root().oninput = root().onsubmit = null;
    root().innerHTML = '<div class="auth-loading"><div class="logo-icon">🐾</div> Carregando seu painel...</div>';
  }

  function showProfileError(message) {
    root().innerHTML =
      '<div class="auth-loading" style="flex-direction:column;text-align:center;padding:24px">' +
      '<div class="logo-icon">🐾</div><p style="max-width:420px">' + I.ui.esc(message || "Não foi possível carregar seu perfil.") +
      '</p><button class="btn-sm btn-outline" id="back-to-login">Voltar para o login</button></div>';
    document.getElementById("back-to-login").onclick = () => I.app.logout();
  }

  const app = {
    /** Carrega perfil + dados e abre a área autenticada. */
    async enter() {
      if (entering) return;
      entering = true;
      showLoading();
      try {
        const profile = await I.db.loadLoginProfile();
        const { data } = await I.sb.auth.getUser();
        const S = I.state;
        S.profile = profile;
        S.role = profile.role;
        S.user = data.user;
        S.userId = data.user.id;
        S.email = data.user.email || "";
        try {
          S.data = await I.db.loadAppData(profile);
        } catch (error) {
          S.data = I.db.EMPTY();
          I.ui.toast(I.db.errorMessage(error) || "Não foi possível carregar seus dados.");
        }
        I.shell.mount();
        I.router.start();
      } catch (error) {
        showProfileError(error && error.message);
      } finally {
        entering = false;
      }
    },

    async logout() {
      try { await I.sb.auth.signOut(); } catch (e) { console.error(e); }
      I.resetState();
      history.replaceState(null, "", location.pathname + location.search);
      document.title = "Itapet — Carteira Pet Digital & Prontuário Eletrônico";
      I.auth.show();
    },

    async boot() {
      if (I.configMissing) {
        root().innerHTML =
          '<div class="auth-loading" style="flex-direction:column;text-align:center;padding:24px"><div class="logo-icon">⚙️</div>' +
          '<p style="max-width:460px">Configure a URL e a chave do Supabase em <strong>js/config.js</strong> e recarregue a página.</p></div>';
        return;
      }
      // Sessão expirada/encerrada em outra aba volta para o login.
      I.sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT" && I.state.profile) setTimeout(() => app.logout(), 0);
      });
      const { data } = await I.sb.auth.getSession();
      if (data.session) app.enter();
      else I.auth.show();
    },
  };
  I.app = app;

  document.addEventListener("DOMContentLoaded", () => app.boot());
})(window.Itapet);
