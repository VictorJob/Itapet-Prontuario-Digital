/* Modais: pet, vacina, registro de prontuário, notificações, veterinário e vincular pet.
 * Porta de src/components/itapet/Modals.tsx. Cada modal se registra em Itapet.modals[nome]. */
window.Itapet = window.Itapet || {};
(function (I) {
  const { esc } = I.ui;
  const P = I.P;
  const R = I.rules;
  const db = I.db;
  const toast = (m) => I.ui.toast(m);

  /* ---------- infraestrutura ---------- */
  let current = null; // { handlers, cleanup }

  function onKey(e) { if (e.key === "Escape") close(); }

  function close() {
    const mr = document.getElementById("modal-root");
    if (current && current.cleanup) current.cleanup();
    current = null;
    document.removeEventListener("keydown", onKey);
    if (mr) { mr.innerHTML = ""; mr.onclick = mr.oninput = mr.onchange = null; }
  }

  function show(title, body, opts, handlers) {
    close();
    const mr = document.getElementById("modal-root");
    if (!mr) return null;
    mr.innerHTML =
      '<div class="modal-overlay open" data-overlay="1"><div class="modal" role="dialog" aria-label="' + esc(title) + '"' +
      (opts.maxWidth ? ' style="max-width:' + opts.maxWidth + 'px"' : "") + '>' +
      '<div class="modal-header"><div class="modal-title">' + esc(title) + '</div>' +
      '<button class="modal-close" data-m="close" aria-label="Fechar">✕</button></div>' + body + "</div></div>";
    current = { handlers, cleanup: opts.cleanup };
    mr.onclick = (e) => {
      if (e.target.dataset && e.target.dataset.overlay) return close();
      const b = e.target.closest("[data-m]");
      if (!b) return;
      if (b.dataset.m === "close") return close();
      const fn = handlers[b.dataset.m];
      if (fn) fn(b, e);
    };
    mr.oninput = (e) => handlers.input && handlers.input(e.target, e);
    mr.onchange = (e) => handlers.change && handlers.change(e.target, e);
    document.addEventListener("keydown", onKey);
    return mr.querySelector(".modal");
  }

  /** Evita duplo clique: desabilita o botão enquanto a ação roda. */
  async function saving(btn, label, fn) {
    if (btn.disabled) return;
    const text = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try { await fn(); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = text; } }
  }

  const val = (modal) => P.values(modal);
  const group = (label, inner) => '<div class="form-group"><label>' + label + "</label>" + inner + "</div>";
  const input = (label, name, o) => {
    o = o || {};
    return group(label,
      '<input class="form-input" name="' + name + '"' + (o.type ? ' type="' + o.type + '"' : "") + (o.step ? ' step="' + o.step + '"' : "") +
      (o.max ? ' max="' + o.max + '"' : "") + (o.list ? ' list="' + o.list + '"' : "") + (o.readonly ? " readonly" : "") +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : "") + ' value="' + esc(o.value || "") + '">');
  };
  const textarea = (label, name, placeholder) =>
    group(label, '<textarea class="form-input" rows="2" name="' + name + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : "") + "></textarea>");
  const row = (a, b) => '<div class="form-row">' + a + b + "</div>";
  const activeCod = () => { const p = I.activePet(); return p ? p.cod : ""; };

  /* ---------- Pet (cadastrar / editar) ---------- */
  function openPet(pet) {
    const S = I.state;
    const profile = S.profile;
    let file = null;
    let blobUrl = "";
    const previewHtml = (url) => (url ? '<img src="' + esc(url) + '" alt="Pré-visualização da foto do pet" style="display:block">' : "<span>🐕</span>");

    const body =
      '<div class="pet-photo-field"><label class="pet-photo-preview" id="pet-preview" aria-label="Selecionar foto do pet">' + previewHtml(pet && pet.photoUrl) +
      '<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-photo="1"></label>' +
      '<label class="btn-sm btn-outline" style="cursor:pointer">Adicionar foto<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-photo="1"></label>' +
      '<span class="field-help">JPG, PNG ou WEBP · até 5 MB</span></div>' +
      row(input("Nome do pet *", "nome", { value: pet && pet.nome, placeholder: "Ex: Thor, Luna..." }),
        group("Espécie *", '<select class="form-input" name="especie">' + P.options(["Cachorro", "Gato", "Coelho", "Pássaro", "Outro"], pet ? pet.especie : "Cachorro") + "</select>")) +
      row(input("Raça", "raca", { value: pet && pet.raca, placeholder: "Ex: Golden Retriever" }),
        group("Sexo", '<select class="form-input" name="sexo">' + P.options(["Macho", "Fêmea"], pet ? pet.sexo : "Macho") + "</select>")) +
      row(input("Data de nascimento", "nascimento", { type: "date", value: pet && pet.nascimento }),
        input("Peso (kg)", "peso", { type: "number", step: "0.1", placeholder: "0.0" })) +
      row(input("Pelagem", "pelagem", { value: pet && pet.pelagem, placeholder: "Ex: Curta, dourada" }),
        input("Código da coleira", "codColeira", { value: pet && pet.cod_coleira, placeholder: "(opcional)" })) +
      input("Nº Microchip", "microchip", { value: pet && pet.microchip, placeholder: "(opcional)" }) +
      row(input("Nome do responsável *", "ownerName", { value: profile.nome, placeholder: "Nome completo" }),
        input("Telefone do responsável *", "ownerPhone", { type: "tel", value: profile.telefone, placeholder: "(11) 99999-9999" })) +
      group("Código do pet *",
        '<div style="display:flex;gap:8px"><input class="form-input" name="codigo" placeholder="Ex: PET-AB12-34" value="' + esc(pet && pet.codigo) + '">' +
        '<button type="button" class="btn-sm btn-green" style="white-space:nowrap" data-m="gen">Gerar</button></div>' +
        '<div id="code-hint" style="font-size:12px;color:var(--text-light);margin-top:6px"></div>') +
      '<div style="display:flex;gap:4px;margin-bottom:16px"><label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">' +
      '<input type="checkbox" name="cadastrado"' + (!pet || pet.cadastrado !== false ? " checked" : "") + '> Cadastrado/a</label></div>' +
      '<button class="btn-primary" data-m="save">' + (pet ? "Salvar alterações" : "Cadastrar pet 🐾") + "</button>";

    const modal = show(pet ? "🐾 Editar pet" : "🐾 Cadastrar novo pet", body, {
      cleanup: () => { if (blobUrl) URL.revokeObjectURL(blobUrl); },
    }, {
      gen: () => {
        modal.querySelector('[name="codigo"]').value = R.generatePetCode(S.data.pets.map((p) => p.codigo));
        checkCode();
      },
      input: (el) => {
        if (el.name === "codigo") { el.value = R.normalizeCode(el.value); checkCode(); }
      },
      change: (el) => {
        if (!el.dataset.photo) return;
        const picked = el.files && el.files[0];
        if (!picked) return;
        if (!R.isValidPetPhoto(picked)) {
          toast("Selecione uma imagem JPG, PNG ou WEBP de até 5 MB.");
          el.value = "";
          return;
        }
        file = picked;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = URL.createObjectURL(picked);
        const prev = modal.querySelector("#pet-preview");
        prev.querySelectorAll("img, span").forEach((n) => n.remove());
        prev.insertAdjacentHTML("afterbegin", previewHtml(blobUrl));
      },
      save: (btn) => saving(btn, "Salvando...", async () => {
        const f = val(modal);
        const code = R.normalizeCode(f.codigo);
        const nome = f.nome.trim();
        const ownerName = f.ownerName.trim();
        const ownerPhone = f.ownerPhone.trim();
        if (profile.role !== "tutor") return toast("Entre como tutor para cadastrar pets.");
        if (!nome) return toast("Informe o nome do pet ⚠️");
        if (!code) return toast("Informe ou gere um código ⚠️");
        if (!R.isValidPetCode(code)) return toast("Código inválido. Use o formato PET-AB12-34.");
        if (!ownerName || !ownerPhone) return toast("Informe o nome e o telefone do responsável ⚠️");
        if (conflictFor(code)) return toast("Este código já está sendo usado por outro pet.");
        try {
          const tutorChanged = ownerName !== profile.nome || ownerPhone !== profile.telefone;
          if (tutorChanged) await db.updateTutor(profile.cod, { nome: ownerName, telefone: ownerPhone });
          const saved = await db.savePet({
            cod_tutor: profile.cod, codigo: code, nome, especie: f.especie, raca: f.raca.trim() || null, sexo: f.sexo,
            nascimento: f.nascimento || null, microchip: f.microchip.trim() || null, pelagem: f.pelagem.trim() || null,
            cod_coleira: f.codColeira.trim() || null, cadastrado: modal.querySelector('[name="cadastrado"]').checked,
          }, pet ? pet.cod : null);
          const weight = Number(f.peso);
          const lastWeight = S.data.weights.filter((w) => w.pet_cod === saved.cod).slice(-1)[0];
          if (weight > 0 && (!lastWeight || Number(lastWeight.peso) !== weight)) {
            await db.insertWeight({ pet_cod: saved.cod, peso: weight, data: R.localDateISO(new Date()) });
          }
          if (file) await db.uploadPetPhoto(file, saved.cod, S.userId, saved.foto);
          close();
          if (tutorChanged) await I.refreshProfile(); else await I.refresh();
          toast(pet ? "Cadastro do pet atualizado." : "Pet cadastrado com sucesso.");
        } catch (error) {
          toast(db.errorMessage(error));
        }
      }),
    });
    if (!modal) return;

    const conflictFor = (code) => S.data.pets.find((p) => R.normalizeCode(p.codigo) === code && (!pet || p.cod !== pet.cod));
    function checkCode() {
      const code = R.normalizeCode(modal.querySelector('[name="codigo"]').value);
      const conflict = conflictFor(code);
      const hint = modal.querySelector("#code-hint");
      const valid = !code || R.isValidPetCode(code);
      hint.style.color = conflict || !valid ? "var(--amber)" : "var(--text-light)";
      hint.textContent = conflict
        ? "⚠ Código já pertence a " + conflict.nome + "."
        : !valid
          ? "⚠ Use o formato PET-AB12-34. Este é o código de identificação, não o da coleira."
          : "A clínica usa este código de identificação para vincular o pet.";
      modal.querySelector('[data-m="save"]').disabled = Boolean(conflict || !valid);
    }
    checkCode();
  }

  /* ---------- Vacina ---------- */
  function openVaccine() {
    const S = I.state;
    const today = R.localDateISO(new Date());
    const vaccines = ["V10 — Polivalente", "V8 — Polivalente", "Antirrábica", "Giardíase", "Bordetella", "V4 Felina", "V5 Felina"];
    const body =
      group("Pet", '<select class="form-input" name="pet">' + P.petOptions(activeCod()) + "</select>") +
      group("Vacina *", '<input class="form-input" name="name" list="vaccine-options" placeholder="Ex: V10 — Polivalente">' +
        '<datalist id="vaccine-options">' + vaccines.map((v) => '<option value="' + esc(v) + '"></option>').join("") + "</datalist>") +
      row(input("Data de aplicação *", "date", { type: "date", max: today, value: today }), input("Próximo reforço", "next", { type: "date" })) +
      row(input("Veterinário", "vet", { placeholder: "Nome do vet." }), input("Lote", "lot", { placeholder: "Nº do lote" })) +
      textarea("Observações", "notes") +
      '<button class="btn-primary" data-m="save">Registrar vacina 💉</button>';
    const modal = show("💉 Registrar Vacina", body, {}, {
      save: (btn) => saving(btn, "Salvando...", async () => {
        const f = val(modal);
        const petId = Number(f.pet);
        const name = f.name.trim();
        if (!petId || !name || !f.date) return toast("Selecione o pet e informe vacina e data.");
        const problem = R.historyDateError(f.date, R.localDateISO(new Date())) || R.boosterError(f.date, f.next);
        if (problem) return toast(problem);
        const details = [f.next ? "Reforço: " + f.next : "", f.vet.trim(), f.lot.trim() ? "Lote: " + f.lot.trim() : ""].filter(Boolean).join(" · ");
        try {
          await db.insertHistory({
            cod_pet: petId, tipo: "vacina", diagnostico_motivo: name, sintomas: f.notes.trim() || null,
            tratamento: details || null, data: f.date,
          });
          if (f.next) {
            await db.insertReminder({
              cod_pet: petId, titulo: "Reforço da vacina: " + name, tipo: "vacina", detalhe: f.vet.trim() || null,
              data: f.next, agendado_por_clinica: S.role === "clinica",
            });
          }
          close();
          await I.refresh();
          toast("Vacina registrada no prontuário.");
        } catch (error) {
          toast(db.errorMessage(error));
        }
      }),
    });
  }

  /* ---------- Novo registro no prontuário ---------- */
  function openConsulta() {
    const S = I.state;
    const clinic = S.role === "clinica";
    let requestId = null;
    const today = R.localDateISO(new Date());
    const types = [["consulta", "Consulta"], ["diagnostico", "Diagnóstico"], ["exame", "Exame"], ["procedimento", "Procedimento"], ["tratamento", "Tratamento"]];
    const body =
      row(group("Pet", '<select class="form-input" name="pet">' + P.petOptions(activeCod()) + "</select>"),
        group("Tipo", '<select class="form-input" name="type">' + types.map(([v, l]) => '<option value="' + v + '">' + l + "</option>").join("") + "</select>")) +
      row(input("Data *", "date", { type: "date", max: today, value: today }),
        input("Veterinário", "vet", { placeholder: "Dr. Nome", list: clinic ? "clinic-vet-options" : "" }) +
        (clinic ? '<datalist id="clinic-vet-options">' + S.data.vets.map((v) => '<option value="' + esc(v.nome) + '"></option>').join("") + "</datalist>" : "")) +
      input("Clínica", "clinic", { value: clinic ? S.profile.nome : "", readonly: clinic, placeholder: "Nome da clínica" }) +
      input("Diagnóstico / Motivo *", "reason", { placeholder: "Ex: Check-up, otite..." }) +
      textarea("Sintomas observados", "symptoms", "Descreva os sintomas...") +
      textarea("Tratamento / Prescrição", "treatment", "Medicamentos, procedimentos...") +
      input("Peso na consulta (kg)", "weight", { type: "number", step: "0.1", placeholder: "Ex: 28.5" }) +
      '<button class="btn-primary" data-m="save">Salvar registro 📋</button>';
    const modal = show("📋 Novo registro no prontuário", body, {}, {
      save: (btn) => saving(btn, "Salvando...", async () => {
        const f = val(modal);
        const petId = Number(f.pet);
        const reason = f.reason.trim();
        if (!petId || !reason || !f.date) return toast("Selecione o pet, informe o motivo e a data.");
        const problem = R.historyDateError(f.date, R.localDateISO(new Date())) || R.weightError(f.weight);
        if (problem) return toast(problem);
        const weight = f.weight.trim() ? Number(f.weight.replace(",", ".")) : null;
        const vetName = f.vet.trim();
        const vet = clinic ? S.data.vets.find((v) => v.nome.trim().toLowerCase() === vetName.toLowerCase()) : undefined;
        try {
          if (!requestId) requestId = window.crypto && window.crypto.randomUUID
            ? window.crypto.randomUUID()
            : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = Math.random() * 16 | 0;
              const v = c === "x" ? r : (r & 0x3 | 0x8);
              return v.toString(16);
            });
          await db.createHistoryWithWeight({
            cod_pet: petId, cod_veterinario: vet ? vet.cod : null, tipo: f.type, diagnostico_motivo: reason,
            sintomas: f.symptoms.trim() || null,
            tratamento: [f.treatment.trim(), vetName].filter(Boolean).join(" · ") || null,
            nome_clinica: (clinic ? S.profile.nome : f.clinic.trim()) || null,
            data: f.date,
          }, weight, requestId);
          close();
          await I.refresh();
          toast((R.HISTORY_TYPE_LABELS[f.type] || "Registro") + " salvo no prontuário.");
        } catch (error) {
          toast(db.errorMessage(error));
        }
      }),
    });
  }

  /* ---------- Notificações (próximos 7 dias) ---------- */
  function notifications() {
    const data = I.state.data;
    const today = R.localDateISO(new Date());
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const end = R.localDateISO(future);
    const petName = (cod) => { const p = data.pets.find((x) => x.cod === cod); return p ? p.nome : ""; };
    return data.reminders
      .filter((r) => r.data >= today && r.data <= end)
      .map((r) => ({ title: r.titulo, detail: petName(r.cod_pet) + " · " + R.formatDate(r.data) + " " + String(r.hora || "").slice(0, 5) }))
      .concat(
        data.history
          .filter((h) => { const d = h.tipo === "vacina" ? R.boosterDate(h.tratamento) : null; return Boolean(d && d <= end); })
          .map((h) => ({ title: "Reforço de vacina: " + h.diagnostico_motivo, detail: petName(h.cod_pet) + " · " + (h.tratamento || "") })),
      );
  }

  function openNotif() {
    const items = notifications();
    show("🔔 Notificações",
      items.length
        ? items.map((i) => '<div class="notif-item"><div class="notif-icon">🔔</div><div class="notif-text"><div class="notif-title">' + esc(i.title) +
            '</div><div class="notif-desc">' + esc(i.detail) + "</div></div></div>").join("")
        : '<p class="text-sm text-mid">Nenhum lembrete para os próximos 7 dias.</p>',
      { maxWidth: 400 }, {});
  }

  /* ---------- Veterinário ---------- */
  function openVet() {
    const S = I.state;
    const body =
      row(input("Nome completo *", "nome", { placeholder: "Dr(a). Nome Sobrenome" }), input("CRMV *", "crmv", { placeholder: "CRMV-SP 00000" })) +
      row(input("E-mail *", "email", { type: "email", placeholder: "vet@clinica.com" }), input("Especialidade", "especialidade", { placeholder: "Clínica geral, dermato..." })) +
      '<button class="btn-primary" data-m="save">Cadastrar veterinário</button>';
    const modal = show("🩺 Cadastrar Veterinário", body, {}, {
      save: (btn) => saving(btn, "Salvando...", async () => {
        if (S.profile.role !== "clinica") return toast("Entre com uma conta de clínica para cadastrar veterinários.");
        const f = val(modal);
        const nome = f.nome.trim(), crmv = f.crmv.trim(), email = f.email.trim();
        if (!nome || !crmv || !email) return toast("Informe nome, CRMV e e-mail do veterinário.");
        try {
          await db.saveVeterinarian({ cod_clinica: S.profile.cod, nome, crmv, email, especialidade: f.especialidade.trim() || null });
          close();
          await I.refresh();
          toast("Veterinário cadastrado.");
        } catch (error) {
          toast(db.errorMessage(error));
        }
      }),
    });
  }

  /* ---------- Vincular paciente pelo código ---------- */
  function openLink() {
    const body =
      '<p class="text-sm text-mid mb-4">Peça ao tutor o código do pet (aparece no cartão do pet, ex.: PET-AB12-34). ' +
      "Depois de vinculado, a clínica pode ver e atualizar o prontuário.</p>" +
      input("Código do pet (não é o código da coleira)", "code", { placeholder: "PET-AB12-34" }) +
      '<button class="btn-primary" data-m="save">Vincular paciente</button>';
    const modal = show("🔗 Vincular paciente", body, { maxWidth: 440 }, {
      input: (el) => { if (el.name === "code") el.value = R.normalizeCode(el.value); },
      save: (btn) => saving(btn, "Vinculando...", async () => {
        const code = R.normalizeCode(val(modal).code);
        if (!code) return toast("Informe o código do pet.");
        if (I.state.role !== "clinica") return toast("A vinculação só pode ser feita por uma conta de clínica.");
        if (!R.isValidPetCode(code)) return toast("Código inválido. Use o formato PET-AB12-34.");
        try {
          const petCod = await db.linkPetByCode(code);
          I.setActivePetId(petCod);
          close();
          await I.refresh();
          toast("Paciente vinculado à clínica.");
        } catch (error) {
          toast(db.errorMessage(error));
        }
      }),
    });
  }

  I.modals.pet = { open: openPet, close };
  I.modals.vaccine = { open: openVaccine, close };
  I.modals.consulta = { open: openConsulta, close };
  I.modals.notif = { open: openNotif, close };
  I.modals.vet = { open: openVet, close };
  I.modals.link = { open: openLink, close };
  I.notifications = notifications;
})(window.Itapet);
