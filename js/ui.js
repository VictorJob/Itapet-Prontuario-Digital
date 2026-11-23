/* Utilitários de interface: escape de HTML, toast, ícones e componentes pequenos. */
window.Itapet = window.Itapet || {};
(function (I) {
  const ui = {};

  /** Escapa texto para uso seguro em HTML e atributos. */
  ui.esc = (v) =>
    String(v === null || v === undefined ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const svg = (inner, size) =>
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + (size || 18) + '" height="' + (size || 18) +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    inner + "</svg>";
  ui.icons = {
    menu: (s) => svg('<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>', s),
    bell: (s) => svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', s),
    plus: (s) => svg('<path d="M5 12h14"/><path d="M12 5v14"/>', s),
  };

  let toastEl = null;
  let toastTimer = null;
  ui.toast = (message) => {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "itapet-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    // força reflow para a transição disparar mesmo em toasts consecutivos
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3500);
  };

  /** Monta uma URL absoluta para outro arquivo da mesma pasta (usada nos redirects do Supabase). */
  ui.siblingUrl = (file) => new URL(file, location.href.split("#")[0]).href;

  /** Avatar do pet: foto (URL assinada) ou patinha. */
  ui.petAvatar = (pet, size) => {
    const style = size ? "width:" + size + "px;height:" + size + "px;font-size:" + size / 2 + "px;" : "";
    return pet.photoUrl
      ? '<div class="pet-avatar has-photo" style="' + style + '"><img src="' + ui.esc(pet.photoUrl) +
          '" alt="Foto de ' + ui.esc(pet.nome) + '"></div>'
      : '<div class="pet-avatar" style="background:var(--green-pale);' + style + '">🐾</div>';
  };

  I.ui = ui;
})(window.Itapet);
