/* Roteador por hash (#/dashboard, #/pets, ...). Substitui o TanStack Router. */
window.Itapet = window.Itapet || {};
(function (I) {
  /** Cada tela registra-se em Itapet.pages["/caminho"] = { render(container) }. */
  I.pages = I.pages || {};

  const MENUS = {
    tutor: [
      { section: "Principal" },
      { to: "/dashboard", icon: "🏠", label: "Dashboard" },
      { to: "/pets", icon: "🐶", label: "Meus Pets" },
      { to: "/prontuario", icon: "📋", label: "Prontuário" },
      { to: "/vacinas", icon: "💉", label: "Vacinas" },
      { section: "Acompanhamento" },
      { to: "/consultas", icon: "📅", label: "Consultas" },
      { to: "/exames", icon: "🧪", label: "Exames" },
      { to: "/medicamentos", icon: "💊", label: "Medicamentos" },
      { to: "/lembretes", icon: "🔔", label: "Lembretes" },
      { section: "Mais" },
      { to: "/relatorios", icon: "📊", label: "Relatórios" },
      { to: "/planos", icon: "💰", label: "Planos" },
      { to: "/seguranca", icon: "🔐", label: "Segurança" },
    ],
    clinica: [
      { section: "Clínica" },
      { to: "/dashboard", icon: "🏠", label: "Dashboard" },
      { to: "/clinica/perfil", icon: "🏥", label: "Dados da Clínica" },
      { to: "/clinica/veterinarios", icon: "🩺", label: "Veterinários" },
      { section: "Operação" },
      { to: "/consultas", icon: "📅", label: "Agenda & Reservas" },
      { to: "/pets", icon: "🐶", label: "Pacientes" },
      { to: "/prontuario", icon: "📋", label: "Prontuário" },
      { to: "/vacinas", icon: "💉", label: "Vacinas" },
      { to: "/exames", icon: "🧪", label: "Exames" },
      { to: "/medicamentos", icon: "💊", label: "Prescrições" },
      { to: "/lembretes", icon: "🔔", label: "Lembretes" },
      { section: "Gestão" },
      { to: "/relatorios", icon: "📊", label: "Relatórios" },
      { to: "/planos", icon: "💰", label: "Planos" },
      { to: "/seguranca", icon: "🔐", label: "Segurança" },
    ],
  };

  function pageTitle(path, role) {
    const tutor = role === "tutor";
    const titles = {
      "/dashboard": ["Dashboard", "Visão geral"],
      "/pets": tutor ? ["Meus Pets", "Gerencie todos os seus pets cadastrados"] : ["Pacientes", "Pets vinculados à sua clínica"],
      "/prontuario": ["Prontuário Digital", "Histórico clínico completo do pet selecionado"],
      "/vacinas": ["Carteira de Vacinação", "Controle de vacinas e reforços"],
      "/consultas": tutor ? ["Consultas", "Acompanhe as consultas dos seus pets"] : ["Agenda", "Agendamentos e atendimentos"],
      "/exames": tutor
        ? ["Exames & Documentos", "Visualize solicitações e laudos da clínica"]
        : ["Exames & Documentos", "Upload, solicitações e visualização"],
      "/medicamentos": tutor
        ? ["Medicamentos", "Prescrições ativas dos seus pets"]
        : ["Medicamentos", "Prescrições e controle de dosagem"],
      "/lembretes": ["Lembretes", "Consultas, exames, medicamentos e avisos personalizados"],
      "/relatorios": ["Relatórios & Insights", "Análise dos atendimentos"],
      "/planos": ["Planos", "Escolha o melhor plano para você"],
      "/seguranca": ["Segurança & Privacidade", "Proteção dos dados — LGPD"],
      "/clinica/perfil": ["Dados da Clínica", "Atualize o cadastro da sua clínica"],
      "/clinica/veterinarios": ["Veterinários & Reservas", "Gestão da equipe e solicitações dos tutores"],
    };
    return titles[path] || ["Itapet", ""];
  }

  let token = 0;

  const router = {
    menu: (role) => MENUS[role] || [],
    titleFor: pageTitle,

    /** Caminho atual a partir do hash; cai no dashboard se for inválido. */
    current() {
      const path = (location.hash || "").replace(/^#/, "").split("?")[0];
      const valid = I.state.role && pageTitle(path, I.state.role)[0] !== "Itapet";
      return valid ? path : "/dashboard";
    },

    go(path) {
      if (location.hash === "#" + path) router.render();
      else location.hash = path;
    },

    /** Desenha a página atual dentro de #page e atualiza título/menu. */
    async render() {
      const path = router.current();
      const container = document.getElementById("page");
      if (!container) return;
      const my = ++token;
      I.shell.update(path);
      const page = I.pages[path];
      if (!page) {
        container.innerHTML =
          '<div class="card" style="text-align:center;padding:40px">' +
          '<div style="font-size:40px;margin-bottom:8px">🚧</div>' +
          '<p class="text-sm text-mid">Esta tela ainda será migrada para HTML/JS puro.</p></div>';
        return;
      }
      try {
        container.innerHTML = "";
        // cada tela registra seus próprios handlers; limpa os da tela anterior
        container.onclick = container.onchange = container.oninput = null;
        container.ondragover = container.ondragleave = container.ondrop = null;
        await page.render(container);
      } catch (error) {
        if (my !== token) return;
        console.error(error);
        container.innerHTML = '<div class="card"><p class="text-sm text-mid">Não foi possível carregar esta tela.</p></div>';
        I.ui.toast(I.db.errorMessage(error));
      }
    },

    start() {
      if (!router._bound) {
        window.addEventListener("hashchange", () => I.state.profile && router.render());
        router._bound = true;
      }
      if (!location.hash || location.hash === "#") history.replaceState(null, "", "#/dashboard");
      router.render();
    },
  };
  I.router = router;
})(window.Itapet);
