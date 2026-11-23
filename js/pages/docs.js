/* Telas: Exames & Documentos e Medicamentos. */
(function (I) {
  const { esc } = I.ui;
  const P = I.P;
  const R = I.rules;
  const db = I.db;

  /* ---------------- Exames & Documentos ---------------- */
  const examMem = { pet: "", type: "Exame laboratorial" };

  function uploadCard() {
    const pet = I.activePet();
    return (
      '<div class="card" style="margin-bottom:20px" id="upload-card"><div class="card-header"><span class="card-title">Upload de Documentos / Solicitar Exame</span></div>' +
      '<div class="form-group"><label>Pet</label><select class="form-input" name="pet">' + P.petOptions(examMem.pet || (pet && pet.cod)) + "</select></div>" +
      '<div class="form-group"><label>Tipo</label><select class="form-input" name="type">' +
      P.options(["Exame laboratorial", "Raio-X / Imagem", "Receita médica", "Laudo", "Outro"], examMem.type) + "</select></div>" +
      '<div class="upload-area" id="upload-area" data-act="pick"><div class="upload-icon">📁</div>' +
      '<p><strong id="upload-label">Clique ou arraste o arquivo aqui</strong></p><span>PDF, JPG, PNG — até 20MB</span></div>' +
      '<input type="file" id="upload-input" hidden multiple accept=".pdf,.jpg,.jpeg,.png" data-change="files" aria-label="Selecionar arquivos">' +
      '<button class="btn-primary" data-act="upload">Enviar documento</button></div>'
    );
  }

  I.pages["/exames"] = {
    render(el) {
      const S = I.state;
      const data = S.data;
      const tutor = S.role === "tutor";
      let files = [];

      const docs = data.documents.length
        ? data.documents.map((doc) => {
            const history = data.history.find((h) => h.cod === doc.cod_historico);
            const pet = data.pets.find((p) => p.cod === (history && history.cod_pet));
            const meta = [R.formatDate(doc.data), pet && pet.nome, history && history.diagnostico_motivo && history.diagnostico_motivo.split(":")[0]]
              .filter(Boolean).join(" · ");
            return (
              '<div class="file-item"><div class="file-icon">📄</div><div class="file-info"><div class="file-name">' +
              esc(doc.documento.split("/").pop()) + '</div><div class="file-meta">' + esc(meta) + "</div></div>" +
              (doc.signedUrl ? '<a class="btn-sm btn-outline" href="' + esc(doc.signedUrl) + '" target="_blank" rel="noopener noreferrer">Ver</a>' : "") +
              '<button class="btn-sm btn-outline" data-act="del-doc" data-cod="' + doc.cod + '">Excluir</button></div>'
            );
          }).join("")
        : '<p class="text-sm text-mid">Nenhum documento enviado.</p>';

      el.innerHTML = P.view(
        '<div class="grid-2">' + (tutor ? "" : uploadCard()) +
        '<div class="card"><div class="card-header"><span class="card-title">' +
        (tutor ? "Documentos &amp; Solicitações dos veterinários" : "Documentos Salvos") + "</span>" +
        '<span class="tag tag-green" style="font-size:11px">' + data.documents.length + " arquivo(s)</span></div>" +
        '<div class="file-list">' + docs + "</div></div></div>",
      );

      const label = () => el.querySelector("#upload-label");
      const setFiles = (list) => {
        files = Array.from(list || []);
        if (label()) label().textContent = files.length ? files.map((f) => f.name).join(", ") : "Clique ou arraste o arquivo aqui";
        if (files.length) I.ui.toast(files.length + " arquivo(s) pronto(s) para envio.");
      };

      P.bind(el, {
        pick: () => el.querySelector("#upload-input").click(),
        "del-doc": (t) => {
          if (!window.confirm("Excluir este documento?")) return;
          const doc = data.documents.find((d) => d.cod === Number(t.dataset.cod));
          if (doc) P.run(() => db.deleteDocument(doc), "Documento excluído.");
        },
        upload: async (btn) => {
          const f = P.values(el.querySelector("#upload-card"));
          const petCod = Number(f.pet || (I.activePet() && I.activePet().cod));
          if (!files.length || !petCod) return I.ui.toast("Selecione um pet e pelo menos um arquivo.");
          if (files.some((x) => !R.isValidDocument(x))) return I.ui.toast("Envie arquivos PDF, JPG ou PNG de até 20 MB.");
          btn.disabled = true;
          btn.textContent = "Enviando...";
          Object.assign(examMem, { pet: f.pet, type: f.type });
          const ok = await P.run(async () => {
            for (const file of files) await db.uploadDocument(file, petCod, S.userId, f.type);
          }, "Documento(s) enviado(s) com sucesso.");
          if (!ok) { btn.disabled = false; btn.textContent = "Enviar documento"; }
        },
      }, { files: (input) => setFiles(input.files) });

      // arrastar e soltar
      const area = () => el.querySelector("#upload-area");
      const highlight = (on) => {
        const a = area();
        if (!a) return;
        a.style.borderColor = on ? "var(--green-light)" : "";
        a.style.background = on ? "var(--green-pale)" : "";
      };
      el.ondragover = (e) => { if (e.target.closest("#upload-area")) { e.preventDefault(); highlight(true); } };
      el.ondragleave = () => highlight(false);
      el.ondrop = (e) => {
        if (!e.target.closest("#upload-area")) return;
        e.preventDefault();
        highlight(false);
        setFiles(e.dataTransfer.files);
      };
    },
  };

  /* ---------------- Medicamentos ---------------- */
  const medMem = { pet: "", frequency: "1x ao dia" };

  function medicationForm() {
    const pet = I.activePet();
    return (
      '<div class="card" id="med-form"><div class="card-header"><span class="card-title">Adicionar Medicamento</span></div>' +
      '<div class="form-group"><label>Pet</label><select class="form-input" name="pet">' + P.petOptions(medMem.pet || (pet && pet.cod)) + "</select></div>" +
      '<div class="form-group"><label>Nome do medicamento</label><input class="form-input" name="name" placeholder="Ex: Bravecto, Simparica..."></div>' +
      '<div class="form-row"><div class="form-group"><label>Dosagem</label><input class="form-input" name="dose" placeholder="Ex: 1 comprimido"></div>' +
      '<div class="form-group"><label>Frequência</label><select class="form-input" name="frequency">' +
      P.options(["1x ao dia", "2x ao dia", "3x ao dia", "Semanal", "Mensal"], medMem.frequency) + "</select></div></div>" +
      '<div class="form-row"><div class="form-group"><label>Início</label><input type="date" class="form-input" name="date"></div>' +
      '<div class="form-group"><label>Duração (dias)</label><input type="number" class="form-input" name="duration" placeholder="Ex: 10"></div></div>' +
      '<div class="form-group"><label>Observações</label><textarea class="form-input" rows="2" name="notes" placeholder="Administrar com alimento..."></textarea></div>' +
      '<button class="btn-primary" data-act="save-med">Salvar medicamento</button></div>'
    );
  }

  I.pages["/medicamentos"] = {
    render(el) {
      const S = I.state;
      const meds = S.data.history.filter((h) => h.tipo === "medicamento");
      const list = meds.length
        ? meds.map((item) => {
            const pet = S.data.pets.find((p) => p.cod === item.cod_pet);
            return (
              '<div class="prescription-card"><div class="rx-name">' + esc(item.diagnostico_motivo) + '</div><div class="rx-dose">' +
              esc([item.sintomas, pet && "🐾 " + pet.nome].filter(Boolean).join(" · ")) + "</div>" +
              '<div class="rx-schedule"><span class="rx-pill">📅 ' + esc(R.formatDate(item.data)) + "</span></div>" +
              '<button class="btn-sm btn-outline" style="margin-top:10px" data-act="del-history" data-cod="' + item.cod + '">Excluir</button></div>'
            );
          }).join("")
        : '<div class="card"><p class="text-sm text-mid">Nenhuma medicação registrada.</p></div>';

      el.innerHTML = P.view('<div class="grid-2"><div>' + list + "</div>" + (S.role === "clinica" ? medicationForm() : "") + "</div>");
      P.bind(el, {
        "save-med": async (btn) => {
          const f = P.values(el.querySelector("#med-form"));
          const petId = Number(f.pet || (I.activePet() && I.activePet().cod));
          const name = f.name.trim();
          if (!petId || !name) return I.ui.toast("Selecione o pet e informe o medicamento.");
          const details = [f.dose.trim(), f.frequency, f.duration ? f.duration + " dias" : "", f.notes.trim()].filter(Boolean).join(" · ");
          btn.disabled = true;
          btn.textContent = "Salvando...";
          Object.assign(medMem, { pet: f.pet, frequency: f.frequency });
          const ok = await P.run(
            () => db.insertHistory({
              cod_pet: petId, tipo: "medicamento", diagnostico_motivo: name,
              sintomas: details || null, data: f.date || P.today(),
            }),
            "Medicação registrada no prontuário.",
          );
          if (!ok) { btn.disabled = false; btn.textContent = "Salvar medicamento"; }
        },
      });
    },
  };
})(window.Itapet);
