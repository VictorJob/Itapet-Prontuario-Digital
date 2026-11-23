/* Telas: Consultas e Lembretes. */
(function (I) {
  const { esc } = I.ui;
  const P = I.P;
  const R = I.rules;
  const db = I.db;

  /* ---------------- Consultas ---------------- */
  const consultaMem = { vet: "", time: "14:00", type: "Consulta de rotina" };

  function scheduleForm() {
    const pet = I.activePet();
    return (
      '<div class="card" id="schedule-form"><div class="card-header"><span class="card-title">Agendar Consulta</span></div>' +
      '<div class="form-group"><label>Pet</label><select class="form-input" name="pet">' + P.petOptions(consultaMem.pet || (pet && pet.cod)) + "</select></div>" +
      '<div class="form-group"><label>Veterinário</label><select class="form-input" name="vet">' + P.vetOptions(consultaMem.vet) + "</select></div>" +
      '<div class="form-row"><div class="form-group"><label>Nome do responsável</label><input class="form-input" name="owner" placeholder="Nome completo"></div>' +
      '<div class="form-group"><label>Telefone do responsável</label><input class="form-input" type="tel" name="phone" placeholder="(11) 99999-9999"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Data</label><input type="date" class="form-input" name="date"></div>' +
      '<div class="form-group"><label>Horário</label><select class="form-input" name="time">' +
      P.options(["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"], consultaMem.time) + "</select></div></div>" +
      '<div class="form-group"><label>Tipo de Consulta</label><select class="form-input" name="type">' +
      P.options(["Consulta de rotina", "Vacinação", "Retorno", "Emergência", "Exame"], consultaMem.type) + "</select></div>" +
      '<div class="form-group"><label>Observações</label><textarea class="form-input" rows="2" name="details" placeholder="Sintomas ou motivo da consulta..."></textarea></div>' +
      '<button class="btn-primary" data-act="schedule">Confirmar Agendamento</button></div>'
    );
  }

  I.pages["/consultas"] = {
    render(el) {
      const today = P.today();
      const upcoming = P.upcoming();
      const past = I.state.data.reminders.filter((r) => r.data < today).sort((a, b) => b.data.localeCompare(a.data));
      const list = (items, empty) => (items.length ? items.map(P.appointmentItem).join("") : '<p class="text-sm text-mid">' + empty + "</p>");
      el.innerHTML = P.view(
        '<div class="grid-2 consultations-layout" style="margin-bottom:24px">' +
        (I.state.role === "clinica" ? scheduleForm() : "") +
        '<div><div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title">Próximas Consultas</span></div>' +
        list(upcoming, "Nenhuma consulta futura.") + "</div>" +
        '<div class="card"><div class="card-header"><span class="card-title">Consultas Passadas</span></div>' +
        list(past, "Nenhuma consulta anterior.") + "</div></div></div>",
      );
      P.bind(el, {
        schedule: async (btn) => {
          const f = P.values(el.querySelector("#schedule-form"));
          const petId = Number(f.pet || (I.activePet() && I.activePet().cod));
          if (!petId || !f.date) return I.ui.toast("Selecione um pet e informe a data.");
          btn.disabled = true;
          btn.textContent = "Salvando...";
          Object.assign(consultaMem, { pet: f.pet, vet: f.vet, time: f.time, type: f.type });
          const ok = await P.run(
            () => db.insertReminder({
              cod_pet: petId,
              cod_veterinario: Number(f.vet) || null,
              titulo: f.type,
              tipo: "consulta",
              detalhe: [f.details.trim(), f.owner.trim(), f.phone.trim()].filter(Boolean).join(" · ") || null,
              data: f.date,
              hora: f.time || null,
              agendado_por_clinica: true,
            }),
            "Consulta salva na agenda.",
          );
          if (!ok) { btn.disabled = false; btn.textContent = "Confirmar Agendamento"; }
        },
      });
    },
  };

  /* ---------------- Lembretes ---------------- */
  const TYPE_ICONS = { consulta: "📅", exame: "🧪", medicamento: "💊", vacina: "💉", personalizado: "📝" };
  const FILTERS = ["todos"].concat(Object.keys(R.REMINDER_TYPES));
  const PLACEHOLDERS = {
    consulta: "Ex: Retorno com o veterinário",
    exame: "Ex: Hemograma completo",
    medicamento: "Ex: Dar vermífugo",
    personalizado: "Ex: Comprar ração",
  };
  let lembFilter = "todos";
  const lembMem = { pet: "", type: "consulta", vet: "" };

  function reminderItem(item) {
    const S = I.state.data;
    const pet = S.pets.find((p) => p.cod === item.cod_pet);
    const vet = S.vets.find((v) => v.cod === item.cod_veterinario);
    const tipo = item.tipo || "personalizado";
    const label = R.REMINDER_TYPES[tipo] || R.HISTORY_TYPE_LABELS[tipo] || "Lembrete";
    const when = R.formatDate(item.data) + (item.hora ? " às " + String(item.hora).slice(0, 5) : "");
    return (
      '<div class="appointment-item"><div class="appt-date" style="font-size:22px" aria-hidden="true">' + (TYPE_ICONS[tipo] || "🔔") + "</div>" +
      '<div class="appt-info"><div class="appt-title">' + esc(item.titulo) + '</div><div class="appt-details">' +
      esc([label, when, item.detalhe, vet && vet.nome, item.agendado_por_clinica ? "Criado pela clínica" : null].filter(Boolean).join(" · ")) + "</div></div>" +
      '<div class="appt-time"><span class="pet-name-small">' + esc(pet ? pet.nome : "") + "</span>" +
      '<button class="btn-sm btn-outline" data-act="del-reminder" data-cod="' + item.cod + '">Excluir</button></div></div>'
    );
  }

  function reminderList(title, items, empty) {
    return (
      '<div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title">' + esc(title) + (items.length ? " (" + items.length + ")" : "") +
      "</span></div>" + (items.length ? items.map(reminderItem).join("") : '<p class="text-sm text-mid">' + esc(empty) + "</p>") + "</div>"
    );
  }

  function reminderForm() {
    const S = I.state;
    const pet = I.activePet();
    const clinic = S.role === "clinica";
    const type = lembMem.type;
    return (
      '<div class="card" id="reminder-form"><div class="card-header"><span class="card-title">Novo Lembrete</span></div>' +
      '<div class="form-group"><label>Pet</label><select class="form-input" name="pet">' + P.petOptions(lembMem.pet || (pet && pet.cod)) + "</select></div>" +
      '<div class="form-group"><label>Tipo</label><select class="form-input" name="type" data-change="rem-type">' +
      Object.entries(R.REMINDER_TYPES).map(([k, l]) => '<option value="' + k + '"' + (k === type ? " selected" : "") + ">" + esc(l) + "</option>").join("") + "</select></div>" +
      '<div class="form-group"><label id="rem-title-label">Título' + (type === "personalizado" ? "" : " (opcional)") + "</label>" +
      '<input class="form-input" name="title" id="rem-title" placeholder="' + esc(PLACEHOLDERS[type]) + '"></div>' +
      '<div class="form-row"><div class="form-group"><label>Data</label><input type="date" class="form-input" name="date" min="' + P.today() + '"></div>' +
      '<div class="form-group"><label>Horário (opcional)</label><input type="time" class="form-input" name="time"></div></div>' +
      (clinic && S.data.vets.length ? '<div class="form-group"><label>Veterinário</label><select class="form-input" name="vet">' + P.vetOptions(lembMem.vet) + "</select></div>" : "") +
      '<div class="form-group"><label>Observações</label><textarea class="form-input" rows="2" name="details" placeholder="Dose, local, o que levar..."></textarea></div>' +
      '<button class="btn-primary" data-act="save-reminder">Salvar Lembrete</button></div>'
    );
  }

  I.pages["/lembretes"] = {
    render(el) {
      const S = I.state;
      if (!S.data.pets.length) { el.innerHTML = P.emptyPets(); P.bind(el); return; }
      const visible = S.data.reminders.filter((r) => {
        if (lembFilter === "todos") return true;
        if (lembFilter === "personalizado") return !r.tipo || !(r.tipo in R.REMINDER_TYPES) || r.tipo === "personalizado";
        return r.tipo === lembFilter;
      });
      const g = R.groupReminders(visible, P.today());
      el.innerHTML = P.view(
        '<div class="grid-2 consultations-layout" style="margin-bottom:24px">' + reminderForm() + "<div>" +
        '<div class="tabs" style="margin-bottom:16px;flex-wrap:wrap">' +
        FILTERS.map((k) => '<button class="tab-btn' + (lembFilter === k ? " active" : "") + '" data-act="filter" data-key="' + k + '">' +
          (k === "todos" ? "Todos" : esc(R.REMINDER_TYPES[k])) + "</button>").join("") + "</div>" +
        reminderList("Hoje", g.today, "Nada para hoje.") + reminderList("Próximos", g.upcoming, "Nenhum lembrete futuro.") +
        reminderList("Passados", g.past, "Nenhum lembrete passado.") + "</div></div>",
      );
      P.bind(el, {
        filter: (t) => { lembFilter = t.dataset.key; I.router.render(); },
        "del-reminder": (t) => {
          if (!window.confirm("Excluir este lembrete?")) return;
          P.run(() => db.deleteReminder(Number(t.dataset.cod)), "Lembrete excluído.");
        },
        "save-reminder": async (btn) => {
          const f = P.values(el.querySelector("#reminder-form"));
          const petId = Number(f.pet || (I.activePet() && I.activePet().cod));
          if (!petId) return I.ui.toast("Selecione um pet.");
          const problem = R.reminderError({ type: f.type, title: f.title, date: f.date }, P.today());
          if (problem) return I.ui.toast(problem);
          btn.disabled = true;
          btn.textContent = "Salvando...";
          Object.assign(lembMem, { pet: f.pet, type: f.type, vet: f.vet || "" });
          const ok = await P.run(
            () => db.insertReminder({
              cod_pet: petId,
              cod_veterinario: Number(f.vet) || null,
              titulo: f.title.trim() || R.REMINDER_TYPES[f.type] || "Lembrete",
              tipo: f.type,
              detalhe: f.details.trim() || null,
              data: f.date,
              hora: f.time || null,
              agendado_por_clinica: S.role === "clinica",
            }),
            "Lembrete criado.",
          );
          if (!ok) { btn.disabled = false; btn.textContent = "Salvar Lembrete"; }
        },
      }, {
        "rem-type": (sel) => {
          lembMem.type = sel.value;
          el.querySelector("#rem-title-label").textContent = "Título" + (sel.value === "personalizado" ? "" : " (opcional)");
          el.querySelector("#rem-title").placeholder = PLACEHOLDERS[sel.value] || "";
        },
      });
    },
  };
})(window.Itapet);
