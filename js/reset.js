/* Página "Redefinir senha" (porta de src/routes/redefinir-senha.tsx). */
(function (I) {
  if (I.configMissing) {
    I.ui.toast("Configure js/config.js antes de usar esta página.");
    return;
  }
  const $ = (id) => document.getElementById(id);
  let ready = false;

  function setReady() {
    if (ready) return;
    ready = true;
    $("reset-subtitle").textContent = "Escolha uma nova senha para sua conta";
    ["new-password", "new-password-confirm", "reset-submit"].forEach((id) => ($(id).disabled = false));
  }

  I.sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady();
  });
  I.sb.auth.getSession().then(({ data }) => data.session && setReady());

  $("reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = $("new-password").value;
    const confirm = $("new-password-confirm").value;
    if (password.length < 6) return I.ui.toast("A senha deve ter pelo menos 6 caracteres.");
    if (password !== confirm) return I.ui.toast("As senhas não coincidem.");
    const btn = $("reset-submit");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try {
      const { error } = await I.sb.auth.updateUser({ password });
      if (error) throw error;
      I.ui.toast("Senha atualizada!");
      setTimeout(() => (location.href = "index.html#/dashboard"), 800);
    } catch (error) {
      I.ui.toast(I.db.errorMessage(error));
      btn.disabled = false;
      btn.textContent = "Salvar nova senha";
    }
  });
})(window.Itapet);
