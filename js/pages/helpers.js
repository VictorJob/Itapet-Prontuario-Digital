/* Helpers compartilhados pelas telas (porta de components/itapet/shared.tsx). */
window.Itapet = window.Itapet || {};
(function (I) {
  const { esc } = I.ui;
  const db = I.db;
  const R = I.rules;
  const P = {};

  P.today = () => R.localDateISO(new Date());
  P.view = (inner) => '<div class="view active">' + inner + "</div>";

  /** Executa uma ação assíncrona, recarrega os dados e avisa o resultado. */
  P.run = async (fn, okMessage) => {
    try {
      await fn();
      await I.refresh();
      if (okMessage) I.ui.toast(okMessage);
      return true;
    } catch (error) {
      I.ui.toast(db.errorMessage(error));
      return false;
    }
  };

  /** Liga cliques/changes da tela por delegação (data-act / data-change). */
  P.bind = (container, acts, changes) => {
    const all = Object.assign({}, P.common, acts || {});
    const chg = Object.assign({ "pet-select": (el) => { I.setActivePetId(Number(el.value)); I.router.render(); } }, changes || {});
    container.onclick = (e) => {
      const t = e.target.closest("[data-act]");
      if (!t || !container.contains(t)) return;
      const fn = all[t.dataset.act];
      if (fn) fn(t, e);
    };
    container.onchange = (e) => {
      const t = e.target.closest("[data-change]");
      if (!t) return;
      const fn = chg[t.dataset.change];
      if (fn) fn(t, e);
    };
  };

  /** Lê os campos [name] de um container como objeto { name: valor }. */
  P.values = (root) => {
    const out = {};
    root.querySelectorAll("[name]").forEach((el) => { out[el.name] = el.value; });
    return out;
  };

  P.petOptions = (selected) =>
    I.state.data.pets
      .map((p) => '<option value="' + p.cod + '"' + (String(p.cod) === String(selected) ? " selected" : "") + ">" + esc(p.nome) + "</option>")
      .join("");

  P.petSelect = (value) => {
    if (!I.state.data.pets.length) return "";
    return (
      '<select class="form-input" style="width:auto;padding:8px 12px;font-size:13px" data-change="pet-select" aria-label="Selecionar pet">' +
      P.petOptions(value) + "</select>"
    );
  };

  P.options = (list, selected) =>
    list.map((o) => "<option" + (o === selected ? " selected" : "") + ">" + esc(o) + "</option>").join("");

  P.vetOptions = (selected) =>
    '<option value="">Não informado</option>' +
    I.state.data.vets
      .map((v) => '<option value="' + v.cod + '"' + (String(v.cod) === String(selected) ? " selected" : "") + ">" + esc(v.nome) + "</option>")
      .join("");

  P.emptyPets = () => {
    const tutor = I.state.role === "tutor";
    return (
      '<div class="card" style="text-align:center;padding:40px"><div style="font-size:40px;margin-bottom:8px">🐾</div>' +
      '<p class="text-sm text-mid mb-4">' +
      (tutor ? "Cadastre seu primeiro pet para começar." : "Vincule um paciente usando o código do pet.") + "</p>" +
      '<button class="btn-sm btn-green" data-act="open-modal" data-modal="' + (tutor ? "pet" : "link") + '">' +
      (tutor ? "+ Cadastrar pet" : "+ Vincular paciente") + "</button></div>"
    );
  };

  P.onlyClinic = () => P.view('<div class="card"><p class="text-sm text-mid">Esta página é exclusiva para contas de clínica.</p></div>');

  P.appointmentItem = (item) => {
    const S = I.state.data;
    const pet = S.pets.find((p) => p.cod === item.cod_pet);
    const parts = (item.data || "").split("-");
    const day = parts.length === 3 ? parts[2] : "—";
    const month = parts.length === 3
      ? new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString("pt-BR", { month: "short" }) : "";
    const vet = S.vets.find((v) => v.cod === item.cod_veterinario);
    return (
      '<div class="appointment-item"><div class="appt-date"><div class="day">' + esc(day) + '</div><div class="month">' + esc(month) + "</div></div>" +
      '<div class="appt-info"><div class="appt-title">' + esc(item.titulo) + '</div><div class="appt-details">' +
      esc([item.detalhe || item.tipo, vet && vet.nome].filter(Boolean).join(" · ")) + "</div></div>" +
      '<div class="appt-time">' + esc(String(item.hora || "").slice(0, 5)) +
      '<span class="pet-name-small">' + esc(pet ? pet.nome : "") + "</span>" +
      '<button class="btn-sm btn-outline" data-act="del-appointment" data-cod="' + item.cod + '">Excluir</button></div></div>'
    );
  };

  P.upcoming = () =>
    I.state.data.reminders.filter((r) => r.data >= P.today()).sort((a, b) => a.data.localeCompare(b.data));

  /** Ações comuns a várias telas. */
  P.common = {
    "open-modal": (el) => {
      const pet = el.dataset.cod ? I.state.data.pets.find((p) => p.cod === Number(el.dataset.cod)) : null;
      I.openModal(el.dataset.modal, pet);
    },
    "select-pet": (el) => I.setActivePetId(Number(el.dataset.cod)), // o href do <a> faz a navegação
    "copy-pet-code": async (el) => {
      const code = el.dataset.code || "";
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        I.ui.toast("Código copiado: " + code);
      } catch (error) {
        I.ui.toast("Não foi possível copiar automaticamente. Código: " + code);
      }
    },
    "del-appointment": (el) => {
      if (!window.confirm("Excluir esta consulta/lembrete?")) return;
      P.run(() => db.deleteReminder(Number(el.dataset.cod)), "Consulta removida.");
    },
    "del-history": (el) => {
      if (I.state.role !== "clinica") return I.ui.toast("Apenas a clínica vinculada pode alterar o prontuário.");
      if (!window.confirm("Excluir este registro clínico?")) return;
      P.run(() => db.deleteHistory(Number(el.dataset.cod)), "Registro excluído.");
    },
    noop: () => {},
  };

  I.P = P;
})(window.Itapet);
