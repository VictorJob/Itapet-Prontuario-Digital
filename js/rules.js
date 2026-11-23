/* Regras de negócio puras (porta de src/lib/itapet/rules.ts). */
window.Itapet = window.Itapet || {};
(function (I) {
  const R = {};

  R.localDateISO = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  };

  R.formatDate = (value) => {
    if (!value) return "—";
    const p = value.slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : value;
  };

  R.normalizeCode = (code) => (code || "").trim().toUpperCase();

  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  /** Códigos de pet: PET-AB12-34 (sem caracteres ambíguos como 0/O ou 1/I). */
  // A geração evita 0/O/1/I, mas o formato aceito também preserva códigos
  // antigos ou digitados manualmente com qualquer letra/dígito.
  R.PET_CODE_PATTERN = /^PET-[A-Z0-9]{4}-[A-Z0-9]{2}$/;
  R.isValidPetCode = (code) => R.PET_CODE_PATTERN.test(R.normalizeCode(code));
  R.generatePetCode = (taken = [], random = Math.random) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = "PET-";
      for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
      code += "-";
      for (let i = 0; i < 2; i++) code += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
      if (!taken.includes(code)) return code;
    }
    throw new Error("Não foi possível gerar um código único.");
  };

  /** Validação de CNPJ (14 dígitos + dígitos verificadores). */
  R.isValidCnpj = (value) => {
    const digits = String(value).replace(/\D/g, "");
    if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
    const calc = (base, weights) => {
      const sum = [...base].reduce((t, d, i) => t + Number(d) * (weights[i] || 0), 0);
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const first = calc(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = calc(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return first === Number(digits[12]) && second === Number(digits[13]);
  };

  /** Vacinas guardam o reforço em `tratamento` como "Reforço: YYYY-MM-DD". */
  R.boosterDate = (tratamento) => {
    const m = (tratamento || "").match(/Reforço:\s*(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };
  R.isBoosterDue = (tratamento, today) => {
    const d = R.boosterDate(tratamento);
    return Boolean(d && d <= today);
  };

  R.historyDateError = (date, today) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Informe uma data válida.";
    if (date > today) return "A data do registro não pode ser no futuro.";
    return null;
  };
  R.boosterError = (applied, booster) =>
    booster && booster <= applied ? "O próximo reforço deve ser depois da data de aplicação." : null;
  R.weightError = (value) => {
    if (!String(value).trim()) return null;
    const w = Number(String(value).replace(",", "."));
    if (!Number.isFinite(w) || w <= 0 || w > 500) return "Informe um peso válido em kg.";
    return null;
  };

  R.HISTORY_TYPE_LABELS = {
    consulta: "Consulta", diagnostico: "Diagnóstico", exame: "Exame", procedimento: "Procedimento",
    tratamento: "Tratamento", vacina: "Vacina", medicamento: "Medicamento",
  };

  R.MAX_PET_PHOTO_BYTES = 5 * 1024 * 1024;
  R.PET_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
  R.MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
  R.DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
  R.isValidPetPhoto = (f) => R.PET_PHOTO_TYPES.includes(f.type) && f.size <= R.MAX_PET_PHOTO_BYTES;
  R.isValidDocument = (f) => R.DOCUMENT_TYPES.includes(f.type) && f.size <= R.MAX_DOCUMENT_BYTES;
  R.safeFileName = (name) => name.replace(/[^\w.-]/g, "_");

  R.REMINDER_TYPES = { consulta: "Consulta", exame: "Exame", medicamento: "Medicamento", personalizado: "Personalizado" };
  R.reminderError = (form, today) => {
    if (!R.REMINDER_TYPES[form.type]) return "Escolha o tipo do lembrete.";
    if (form.type === "personalizado" && !form.title.trim()) return "Dê um título ao lembrete personalizado.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return "Informe a data do lembrete.";
    if (form.date < today) return "A data do lembrete não pode estar no passado.";
    return null;
  };

  /** Separa lembretes em hoje / próximos (mais cedo primeiro) / passados (mais recente primeiro). */
  R.groupReminders = (items, today) => {
    const key = (r) => r.data + " " + (r.hora || "99:99");
    const asc = (a, b) => key(a).localeCompare(key(b));
    return {
      today: items.filter((r) => r.data === today).sort(asc),
      upcoming: items.filter((r) => r.data > today).sort(asc),
      past: items.filter((r) => r.data < today).sort((a, b) => asc(b, a)),
    };
  };

  I.rules = R;
})(window.Itapet);
