/* Casca da aplicação autenticada: sidebar, topbar e área de conteúdo (porta de AppShell.tsx). */
window.Itapet = window.Itapet || {};
(function (I) {
  const { esc, icons } = I.ui;
  const shell = {};

  shell.mount = () => {
    const S = I.state;
    const role = S.role;
    const name = S.profile.nome || S.email;
    const avatar = role === "clinica" ? "🏥" : name.charAt(0).toUpperCase();

    const nav = I.router.menu(role).map((item) =>
      item.section
        ? '<div class="nav-section-label">' + esc(item.section) + "</div>"
        : '<a href="#' + item.to + '" class="nav-item" data-path="' + item.to + '"><div class="nav-icon">' +
          item.icon + "</div> " + esc(item.label) + "</a>",
    ).join("");

    const root = document.getElementById("root");
    root.innerHTML =
      '<div id="app" class="' + (role === "clinica" ? "role-clinica" : "role-tutor") + '">' +
        '<aside class="sidebar" id="sidebar">' +
          '<div class="sidebar-header"><div class="sidebar-logo"><div class="logo-icon">🐾</div><h1>Itapet</h1></div></div>' +
          '<div class="sidebar-user"><div class="sidebar-user-inner">' +
            '<div class="user-avatar">' + esc(avatar) + "</div>" +
            '<div class="user-info"><div class="name">' + esc(name) + '</div><div class="role">' +
              (role === "clinica" ? "Clínica Veterinária" : "Tutor(a)") + "</div></div>" +
          "</div></div>" +
          '<nav class="sidebar-nav">' + nav + "</nav>" +
          '<div class="sidebar-footer"><button class="nav-item" data-action="logout"><div class="nav-icon">🚪</div> Sair</button></div>' +
        "</aside>" +
        '<div class="sidebar-backdrop" id="sidebar-backdrop" data-action="close-menu"></div>' +
        '<main class="main">' +
          '<div class="topbar">' +
            '<div class="topbar-left" style="display:flex;align-items:center;gap:12px">' +
              '<button class="icon-btn mobile-menu-btn" data-action="open-menu" aria-label="Abrir menu">' + icons.menu() + "</button>" +
              '<div><h2 id="page-title"></h2><p id="page-subtitle"></p></div>' +
            "</div>" +
            '<div class="topbar-right">' +
              (role === "clinica"
                ? '<button class="icon-btn" data-action="new-appointment" title="Agendar consulta" aria-label="Agendar consulta">' + icons.plus() + "</button>"
                : "") +
              '<button class="icon-btn" data-action="notifications" title="Notificações" aria-label="Notificações">' +
                icons.bell() + '<span class="notif-dot"></span></button>' +
              '<a href="#/seguranca" class="user-avatar" style="width:40px;height:40px" aria-label="Minha conta">' + esc(avatar) + "</a>" +
            "</div>" +
          "</div>" +
          '<div class="content" id="page"></div>' +
        "</main>" +
        '<div id="modal-root"></div>' +
      "</div>";

    root.onsubmit = null;
    root.oninput = null;
    root.onclick = (e) => {
      const el = e.target.closest("[data-action], .nav-item[data-path]");
      if (!el) return;
      const action = el.dataset.action;
      if (!action) return setMenu(false); // clique em link do menu
      if (action === "open-menu") setMenu(true);
      else if (action === "close-menu") setMenu(false);
      else if (action === "notifications") I.openModal("notif");
      else if (action === "new-appointment") I.router.go("/consultas");
      else if (action === "logout") I.app.logout();
    };
  };

  function setMenu(open) {
    const sb = document.getElementById("sidebar");
    const bd = document.getElementById("sidebar-backdrop");
    if (sb) sb.classList.toggle("open", open);
    if (bd) bd.classList.toggle("open", open);
  }

  /** Atualiza título, item ativo do menu e fecha o menu mobile. */
  shell.update = (path) => {
    const [title, subtitle] = I.router.titleFor(path, I.state.role);
    const t = document.getElementById("page-title");
    const s = document.getElementById("page-subtitle");
    if (t) t.textContent = title;
    if (s) s.textContent = subtitle;
    document.title = title + " — Itapet";
    document.querySelectorAll(".sidebar-nav .nav-item").forEach((a) =>
      a.classList.toggle("active", a.dataset.path === path),
    );
    setMenu(false);
  };

  I.shell = shell;
})(window.Itapet);
