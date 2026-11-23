/* Telas: Dashboard, Meus Pets, Prontuário e Vacinas. */
(function (I) {
  const { esc, petAvatar } = I.ui;
  const P = I.P;
  const R = I.rules;
  const db = I.db;

  /* ---------------- Dashboard ---------------- */
  I.pages["/dashboard"] = {
    render(el) {
      const S = I.state;
      const data = S.data;
      const tutor = S.role === "tutor";
      const today = P.today();
      const upcoming = P.upcoming();
      const alerts = data.history.filter((h) => h.tipo === "vacina" && R.isBoosterDue(h.tratamento, today));
      const appts = upcoming.filter((r) => r.tipo === "consulta" || r.tipo === "agendamento");
      const stats = [
        { cls: "green", icon: "🐾", value: data.pets.length, label: tutor ? "Pets cadastrados" : "Pacientes", detail: tutor ? "Seus pets cadastrados" : "Pacientes vinculados", trend: "trend-up" },
        { cls: "coral", icon: "💉", value: alerts.length, label: "Vacinas vencendo", detail: alerts.length ? "Atenção necessária" : "Nenhum reforço vencido", trend: "trend-warn" },
        { cls: "amber", icon: "📅", value: appts.length, label: "Consulta agendada", detail: upcoming[0] ? "Próxima: " + R.formatDate(upcoming[0].data) : "Nenhuma consulta futura", trend: "trend-up" },
        { cls: "sky", icon: "📁", value: data.documents.length, label: "Documentos salvos", detail: "Arquivos no prontuário", trend: "trend-up" },
      ];

      const petCards = data.pets.slice(0, 3).map((pet) =>
        '<a href="#/prontuario" class="pet-card" data-act="select-pet" data-cod="' + pet.cod + '">' + petAvatar(pet) +
        '<div class="pet-name">' + esc(pet.nome) + '</div><div class="pet-breed">' + esc(pet.raca || pet.especie || "") + "</div></a>",
      ).join("");

      const alertsHtml = alerts.length
        ? alerts.map((i) =>
            '<div class="notif-item"><div class="notif-icon">💉</div><div class="notif-text"><div class="notif-title">' + esc(i.diagnostico_motivo) +
            '</div><div class="notif-desc">Reforço vencido · ' + esc(R.formatDate(i.data)) + "</div></div></div>").join("")
        : '<p class="text-sm text-mid">Nenhum alerta pendente.</p>';

      const recent = data.history.length
        ? data.history.slice(0, 5).map((i) => {
            const pet = data.pets.find((p) => p.cod === i.cod_pet);
            return '<div class="timeline-item"><div class="timeline-dot">📋</div><div class="timeline-content"><div class="timeline-date">' +
              esc(R.formatDate(i.data)) + '</div><div class="timeline-title">' + esc(i.tipo || "Registro") + " — " + esc(pet ? pet.nome : "") +
              '</div><div class="timeline-desc">' + esc(i.diagnostico_motivo || "") + "</div></div></div>";
          }).join("")
        : '<p class="text-sm text-mid">Nenhum registro ainda.</p>';

      el.innerHTML = P.view(
        '<div class="stats-grid">' +
          stats.map((s) =>
            '<div class="stat-card ' + s.cls + '"><div class="stat-icon">' + s.icon + '</div><div class="stat-value">' + s.value +
            '</div><div class="stat-label">' + esc(s.label) + '</div><div class="stat-trend ' + s.trend + '">' + esc(s.detail) + "</div></div>").join("") +
        "</div>" +
        '<div class="dashboard-grid">' +
          '<div class="card span-2"><div class="card-header"><div class="card-title-icon"><div class="title-icon" style="background:var(--green-pale)">🐶</div>' +
          '<span class="card-title">' + (tutor ? "Meus Pets" : "Pacientes") + "</span></div>" +
          '<button class="btn-sm btn-green" data-act="open-modal" data-modal="' + (tutor ? "pet" : "link") + '">' +
          (tutor ? "+ Adicionar Pet" : "+ Vincular paciente") + "</button></div>" +
          '<div class="pets-grid" id="dashboard-pets">' + petCards +
          (tutor ? '<div class="add-pet-card" data-act="open-modal" data-modal="pet"><div class="add-icon">➕</div><span>Adicionar novo pet</span></div>' : "") +
          (!tutor && !data.pets.length ? '<p class="text-sm text-mid">Nenhum paciente vinculado ainda.</p>' : "") +
          "</div></div>" +
          '<div class="card"><div class="card-header"><span class="card-title">🔔 Alertas</span></div>' + alertsHtml + "</div>" +
          '<div class="card span-2"><div class="card-header"><span class="card-title">📅 Próximas Consultas</span>' +
          '<a href="#/consultas" class="btn-sm btn-outline">Ver todas</a></div>' +
          (upcoming.length ? upcoming.map(P.appointmentItem).join("") : '<p class="text-sm text-mid">Nenhuma consulta futura.</p>') + "</div>" +
          '<div class="card"><div class="card-header"><span class="card-title">📋 Atividade Recente</span></div><div class="timeline">' + recent + "</div></div>" +
        "</div>",
      );
      P.bind(el);
    },
  };

  /* ---------------- Meus Pets / Pacientes ---------------- */
  I.pages["/pets"] = {
    render(el) {
      const S = I.state;
      const tutor = S.role === "tutor";
      const cards = S.data.pets.map((pet) =>
        '<div class="pet-card" style="padding:28px 20px" data-act="open-record" data-cod="' + pet.cod + '">' + petAvatar(pet, 80) +
        '<div class="pet-name" style="font-size:20px;margin-top:4px">' + esc(pet.nome) + "</div>" +
        '<div class="pet-breed">' + esc(pet.raca || pet.especie || "") + "</div>" +
        '<div style="font-size:12px;color:var(--text-light);margin:6px 0 10px">' + esc(pet.sexo || "") + esc(pet.codigo ? " · " + pet.codigo : "") + "</div>" +
        '<div style="margin-top:14px;display:flex;gap:6px;justify-content:center" data-act="noop">' +
        (tutor
          ? '<button class="btn-sm btn-outline" data-act="open-modal" data-modal="pet" data-cod="' + pet.cod + '">Editar</button>' +
            '<button class="btn-sm btn-outline" data-act="del-pet" data-cod="' + pet.cod + '">Excluir</button>'
          : '<button class="btn-sm btn-outline" data-act="unlink-pet" data-cod="' + pet.cod + '">Remover vínculo</button>') +
        "</div></div>").join("");

      el.innerHTML = P.view(
        '<div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:24px">' +
        '<button class="btn-sm btn-green" style="padding:10px 20px;font-size:14px" data-act="open-modal" data-modal="' + (tutor ? "pet" : "link") + '">' +
        (tutor ? "+ Cadastrar novo pet" : "+ Vincular paciente") + "</button></div>" +
        '<div class="pets-grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">' + cards +
        (tutor
          ? '<div class="add-pet-card" data-act="open-modal" data-modal="pet"><div class="add-icon">➕</div><span>Adicionar novo pet</span></div>'
          : '<div class="add-pet-card" data-act="open-modal" data-modal="link"><div class="add-icon">🔗</div><span>Vincular paciente pelo código</span></div>') +
        "</div>",
      );
      const petOf = (t) => S.data.pets.find((p) => p.cod === Number(t.dataset.cod));
      P.bind(el, {
        "open-record": (t) => { I.setActivePetId(Number(t.dataset.cod)); I.router.go("/prontuario"); },
        "del-pet": (t) => {
          if (!window.confirm("Excluir este pet e os registros vinculados?")) return;
          P.run(() => db.deletePet(Number(t.dataset.cod)), "Pet excluído.");
        },
        "unlink-pet": (t) => {
          const pet = petOf(t);
          if (!window.confirm("Remover " + (pet ? pet.nome : "este pet") + " da lista de pacientes?")) return;
          P.run(() => db.unlinkPet(S.profile.cod, Number(t.dataset.cod)), "Vínculo removido.");
        },
      });
    },
  };

  /* ---------------- Prontuário ---------------- */
  let prontTab = "historico";
  I.pages["/prontuario"] = {
    render(el) {
      const S = I.state;
      const pet = I.activePet();
      if (!pet) { el.innerHTML = P.view(P.emptyPets()); P.bind(el); return; }
      const records = S.data.history.filter((h) => h.cod_pet === pet.cod && h.tipo !== "documento");
      const kind = (h) => (h.tipo || "").toLowerCase();
      const diagnoses = records.filter((h) => ["consulta", "diagnostico"].includes(kind(h)));
      const procedures = records.filter((h) => ["exame", "procedimento", "tratamento"].includes(kind(h)));
      const label = (t) => R.HISTORY_TYPE_LABELS[t || ""] || t || "";
      const chips = [
        pet.codigo && "🔖 " + pet.codigo,
        pet.microchip && "Microchip: " + pet.microchip,
        pet.pelagem && "Pelagem: " + pet.pelagem,
        pet.cod_coleira && "Coleira: " + pet.cod_coleira,
        S.role === "tutor" && "👤 Tutor: " + (S.profile.nome || ""),
      ].filter(Boolean);
      const sub = [pet.raca, pet.sexo, pet.nascimento && R.formatDate(pet.nascimento)].filter(Boolean).join(" · ");
      const tabBtn = (key, text) =>
        '<button class="tab-btn' + (prontTab === key ? " active" : "") + '" data-act="tab" data-tab="' + key + '">' + text + "</button>";
      const vaxItem = (icon, item, extra) =>
        '<div class="vaccine-item"><div class="vax-icon">' + icon + '</div><div class="vax-info"><div class="vax-name">' +
        esc(item.diagnostico_motivo || item.tipo) + '</div><div class="vax-date">' + esc(R.formatDate(item.data) + extra) + "</div></div></div>";

      let body = "";
      if (prontTab === "historico") {
        body =
          '<div class="card"><div class="card-header"><span class="card-title">Histórico de Consultas</span>' +
          '<button class="btn-sm btn-green" data-act="open-modal" data-modal="consulta">+ Novo registro</button></div><div class="timeline">' +
          (records.length
            ? records.map((item) =>
                '<div class="timeline-item"><div class="timeline-dot">📋</div><div class="timeline-content"><div class="timeline-date">' +
                esc(R.formatDate(item.data) + " · " + label(item.tipo)) + '</div><div class="timeline-title">' +
                esc(item.diagnostico_motivo || item.tipo || "Registro") + '</div><div class="timeline-desc">' +
                esc([item.sintomas, item.tratamento, item.nome_clinica && "Clínica: " + item.nome_clinica,
                  item.peso && "Peso: " + String(item.peso).replace(".", ",") + " kg"].filter(Boolean).join(" · ")) + "</div>" +
                '<button class="btn-sm btn-outline" style="margin-top:8px" data-act="del-history" data-cod="' + item.cod + '">Excluir</button></div></div>').join("")
            : '<p class="text-sm text-mid">Nenhum registro clínico.</p>') +
          "</div></div>";
      } else if (prontTab === "diagnosticos") {
        body =
          '<div class="card"><div class="card-header"><span class="card-title">Diagnósticos Registrados</span></div><div class="vaccine-grid">' +
          (diagnoses.length ? diagnoses.map((i) => vaxItem("🩺", i, "")).join("") : '<p class="text-sm text-mid">Nenhum diagnóstico registrado.</p>') +
          "</div></div>";
      } else {
        body =
          '<div class="card"><div class="card-header"><span class="card-title">Procedimentos e tratamentos</span></div><div class="vaccine-grid">' +
          (procedures.length
            ? procedures.map((i) => vaxItem(i.tipo === "tratamento" ? "🩹" : "🔬", i, " · " + label(i.tipo))).join("")
            : '<p class="text-sm text-mid">Nenhum procedimento ou tratamento registrado.</p>') +
          "</div></div>";
      }

      el.innerHTML = P.view(
        '<div class="profile-header"><div class="profile-avatar-large' + (pet.photoUrl ? " has-photo" : "") + '">' +
        (pet.photoUrl ? '<img src="' + esc(pet.photoUrl) + '" alt="Foto de ' + esc(pet.nome) + '">' : "🐕") + "</div>" +
        '<div class="profile-info"><h2>' + esc(pet.nome) + "</h2><p>" + esc(sub) + '</p><div class="profile-chips">' +
        chips.map((c) => '<span class="profile-chip">' + esc(c) + "</span>").join("") + "</div></div>" +
        '<div style="margin-left:auto">' + P.petSelect(pet.cod) + "</div></div>" +
        '<div class="tabs">' + tabBtn("historico", "📋 Histórico") + tabBtn("diagnosticos", "🔬 Diagnósticos") + tabBtn("procedimentos", "⚕️ Procedimentos") + "</div>" + body,
      );
      P.bind(el, { tab: (t) => { prontTab = t.dataset.tab; I.router.render(); } });
    },
  };

  /* ---------------- Vacinas ---------------- */
  I.pages["/vacinas"] = {
    render(el) {
      const S = I.state;
      const pet = I.activePet();
      if (!pet) { el.innerHTML = P.view(P.emptyPets()); P.bind(el); return; }
      const today = P.today();
      const records = S.data.history.filter((h) => h.tipo === "vacina" && h.cod_pet === pet.cod);
      const items = records.map((item) => {
        const booster = R.boosterDate(item.tratamento);
        const due = R.isBoosterDue(item.tratamento, today);
        return (
          '<div class="vaccine-item"><div class="vax-icon">💉</div><div class="vax-info"><div class="vax-name">' + esc(item.diagnostico_motivo) +
          '</div><div class="vax-date">' + esc("Aplicada: " + R.formatDate(item.data) + " · " + (item.tratamento || "")) + "</div></div>" +
          (booster ? '<span class="vax-status ' + (due ? "vax-soon" : "vax-ok") + '">' + (due ? "⚠ Reforço vencido" : "✓ Em dia") + "</span>" : "") +
          '<button class="btn-sm btn-outline" data-act="del-history" data-cod="' + item.cod + '">Excluir</button></div>'
        );
      }).join("");
      el.innerHTML = P.view(
        '<div class="card" style="margin-bottom:20px"><div class="card-header"><div class="card-title-icon">' +
        '<div class="title-icon" style="background:var(--amber-light)">💉</div><span class="card-title">Carteira de Vacinação — ' + esc(pet.nome) + "</span></div>" +
        '<div style="display:flex;gap:8px">' + P.petSelect(pet.cod) +
        (S.role === "clinica" ? '<button class="btn-sm btn-green" data-act="open-modal" data-modal="vaccine">+ Registrar Vacina</button>' : "") +
        '</div></div><div class="vaccine-grid">' + (items || '<p class="text-sm text-mid">Nenhuma vacina registrada.</p>') + "</div></div>",
      );
      P.bind(el);
    },
  };
})(window.Itapet);
