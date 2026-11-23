/* Camada de dados (porta de src/lib/itapet/db.ts). Roda no navegador, protegida por RLS. */
window.Itapet = window.Itapet || {};
(function (I) {
  const sb = I.sb;
  const R = I.rules;
  const db = {};

  db.PHOTO_BUCKET = "itapet-pet-photos";
  db.DOCS_BUCKET = "itapet-documents";
  db.EMPTY = () => ({ pets: [], history: [], reminders: [], weights: [], documents: [], vets: [] });

  const isUrl = (v) => /^https?:\/\//i.test(v || "");
  db.isUrl = isUrl;

  /** Lança erro se a query falhar ou não retornar registro. */
  async function result(query) {
    const { data, error } = await query;
    if (error) throw error;
    if (data === null || data === undefined) throw new Error("Registro não encontrado.");
    return data;
  }

  /** Valores de `role` nos metadados do auth que representam uma clínica. */
  const ROLE_CLINIC = ["clinica", "clínica", "clinic", "veterinaria", "veterinária", "clinica veterinaria", "clínica veterinária"];
  const digits = (v) => String(v === null || v === undefined ? "" : v).replace(/\D/g, "");
  const text = (v) => {
    const s = String(v === null || v === undefined ? "" : v).trim();
    return s || null;
  };

  /** Lê a primeira linha do perfil (tutor ou clínica) ligada ao usuário autenticado. */
  async function profileRow(table, userId) {
    const { data, error } = await sb.from(table).select("*").eq("auth_user_id", userId).limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  }

  async function findProfile(userId) {
    const clinic = await profileRow("clinica", userId);
    if (clinic) return Object.assign({}, clinic, { role: "clinica" });
    const tutor = await profileRow("tutor", userId);
    if (tutor) return Object.assign({}, tutor, { role: "tutor" });
    return null;
  }

  /** Cria a linha em `tutor` ou `clinica` a partir dos metadados gravados no cadastro. */
  async function createProfile(user) {
    const meta = user.user_metadata || {};
    const roleMeta = String(meta.role || meta.tipo || meta.perfil || "").trim().toLowerCase();
    const role = ROLE_CLINIC.includes(roleMeta) ? "clinica" : "tutor";
    const email = text(user.email) || text(meta.email);
    const nome = text(meta.nome || meta.name || meta.full_name || meta.nome_clinica) ||
      (email ? email.split("@")[0] : null);
    if (!nome) throw new Error("Não foi possível identificar o nome do cadastro. Entre em contato com o suporte.");

    const row = {
      nome,
      email,
      telefone: digits(meta.telefone || meta.phone) || null,
      auth_user_id: user.id,
    };
    if (role === "clinica") {
      row.cnpj = digits(meta.cnpj) || null;
      row.endereco = text(meta.endereco || meta.endereço || meta.address);
      row.cep = digits(meta.cep) || null;
    }

    const table = role === "clinica" ? "clinica" : "tutor";
    const { data, error } = await sb.from(table).insert(row).select("*").single();
    if (error) {
      // Perfil criado em paralelo (outra aba, duplo clique ou login simultâneo).
      if (error.code === "23505") {
        const existing = await findProfile(user.id);
        if (existing) return existing;
      }
      throw error;
    }
    return Object.assign({}, data, { role });
  }

  /** Localiza o perfil do usuário e, se ainda não existir, cria a partir do cadastro. */
  db.loadLoginProfile = async () => {
    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData.user) throw new Error("Entre novamente para verificar sua conta.");
    const user = userData.user;

    // 1) Perfil já existente (tutor ou clínica) é a fonte da verdade.
    const existing = await findProfile(user.id);
    if (existing) return existing;

    // 2) Contas antigas: a RPC de reparo pode criar o perfil pelo e-mail.
    //    Se a função não existir, estiver sem permissão ou não criar nada, seguimos para o cadastro.
    try {
      const { error } = await sb.rpc("itapet_repair_login_profile");
      if (error) console.warn("[Itapet] itapet_repair_login_profile:", error.message || error);
    } catch (error) {
      console.warn("[Itapet] itapet_repair_login_profile:", (error && error.message) || error);
    }
    const repaired = await findProfile(user.id);
    if (repaired) return repaired;

    // 3) Cadastro novo: cria a linha com as colunas reais de `tutor` / `clinica`.
    return createProfile(user);
  };

  db.createProfile = createProfile;

  async function signedUrls(bucket, paths) {
    if (!paths.length) return {};
    const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, 3600);
    if (error) throw error;
    const urls = {};
    data.forEach((item, i) => {
      if (paths[i] && item.signedUrl) urls[paths[i]] = item.signedUrl;
    });
    return urls;
  }

  db.loadAppData = async (profile) => {
    // O RLS devolve só os pets do tutor ou vinculados à clínica.
    let petsQuery = sb.from("pet").select("*").order("nome");
    if (profile.role === "tutor") petsQuery = petsQuery.eq("cod_tutor", profile.cod);
    const pets = await result(petsQuery);
    const vets =
      profile.role === "clinica"
        ? await result(sb.from("veterinario").select("*").eq("cod_clinica", profile.cod).order("nome"))
        : [];
    const petIds = pets.map((p) => p.cod);
    if (!petIds.length) return { pets: [], history: [], reminders: [], weights: [], documents: [], vets };

    const [history, reminders, weights] = await Promise.all([
      result(
        sb.from("historico").select("*").in("cod_pet", petIds)
          .order("data", { ascending: false }).order("data", { ascending: false }),
      ),
      result(sb.from("lembrete").select("*").in("cod_pet", petIds).order("data")),
      result(sb.from("pet_peso").select("*").in("pet_cod", petIds).order("data")),
    ]);

    const docHistoryIds = history.filter((h) => h.tipo === "documento").map((h) => h.cod);
    const docs = docHistoryIds.length
      ? await result(sb.from("documentos").select("*").in("cod_historico", docHistoryIds).order("data", { ascending: false }))
      : [];

    const photoPaths = pets.map((p) => p.foto).filter((p) => Boolean(p) && !isUrl(p));
    const [photoUrls, docUrls] = await Promise.all([
      signedUrls(db.PHOTO_BUCKET, photoPaths),
      signedUrls(db.DOCS_BUCKET, docs.map((d) => d.documento)),
    ]);

    return {
      pets: pets.map((p) => Object.assign({}, p, {
        photoUrl: (p.foto && (photoUrls[p.foto] || (isUrl(p.foto) ? p.foto : ""))) || "",
      })),
      history, reminders, weights,
      documents: docs.map((d) => Object.assign({}, d, { signedUrl: docUrls[d.documento] || null })),
      vets,
    };
  };

  db.updateTutor = (cod, row) => result(sb.from("tutor").update(row).eq("cod", cod).select("*").single());
  db.updateClinic = (cod, row) => result(sb.from("clinica").update(row).eq("cod", cod).select("*").single());

  db.savePet = async (row, editingCod) => {
    if (editingCod) {
      const changes = Object.assign({}, row);
      delete changes.cod_tutor;
      return result(sb.from("pet").update(changes).eq("cod", editingCod).select("*").single());
    }
    return result(sb.from("pet").insert(row).select("*").single());
  };

  db.uploadPetPhoto = async (file, petCod, userId, previous) => {
    const path = "pets/" + petCod + "/" + userId + "/" + Date.now() + "-" + R.safeFileName(file.name);
    const { error } = await sb.storage.from(db.PHOTO_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
    if (error) throw error;
    const { error: updateError } = await sb.from("pet").update({ foto: path }).eq("cod", petCod);
    if (updateError) {
      await sb.storage.from(db.PHOTO_BUCKET).remove([path]);
      throw updateError;
    }
    if (previous && !isUrl(previous)) await sb.storage.from(db.PHOTO_BUCKET).remove([previous]);
    return path;
  };

  db.deletePet = async (cod) => {
    const pet = await result(sb.from("pet").select("foto").eq("cod", cod).single());
    const history = await result(sb.from("historico").select("cod").eq("cod_pet", cod));
    const docs = history.length
      ? await result(sb.from("documentos").select("documento").in("cod_historico", history.map((h) => h.cod)))
      : [];
    if (docs.length) {
      const { error } = await sb.storage.from(db.DOCS_BUCKET).remove(docs.map((d) => d.documento));
      if (error) throw error;
    }
    if (pet.foto && !isUrl(pet.foto)) {
      const { error } = await sb.storage.from(db.PHOTO_BUCKET).remove([pet.foto]);
      if (error) throw error;
    }
    return result(sb.from("pet").delete().eq("cod", cod).select("cod").single());
  };

  db.insertHistory = (row) => result(sb.from("historico").insert(row).select("*").single());
  db.deleteHistory = (cod) => result(sb.from("historico").delete().eq("cod", cod).select("cod").single());
  db.insertWeight = (row) => result(sb.from("pet_peso").insert(row).select("*").single());
  db.insertReminder = (row) => result(sb.from("lembrete").insert(row).select("*").single());
  db.deleteReminder = (cod) => result(sb.from("lembrete").delete().eq("cod", cod).select("cod").single());
  db.saveVeterinarian = (row) => result(sb.from("veterinario").insert(row).select("*").single());
  db.linkPetByCode = async (codigo) => {
    const data = await result(sb.rpc("itapet_link_pet_by_code", { _codigo: codigo }));
    // A RPC retorna integer, mas aceitar também as formas de retorno de
    // versões antigas evita que uma alteração de assinatura quebre o front-end.
    const row = Array.isArray(data) ? data[0] : data;
    const value = row && typeof row === "object"
      ? (row.pet_cod ?? row.cod_pet ?? row.cod)
      : row;
    const petCod = Number(value);
    if (!Number.isInteger(petCod) || petCod <= 0) {
      const error = new Error("A vinculação retornou um identificador de pet inválido.");
      error.code = "ITAPET_INVALID_RPC_RETURN";
      throw error;
    }
    return petCod;
  };
  db.createHistoryWithWeight = async (row, weight, requestId) => {
    const data = await result(sb.rpc("itapet_create_history_with_weight", {
      _cod_pet: row.cod_pet,
      _cod_veterinario: row.cod_veterinario || null,
      _tipo: row.tipo || null,
      _diagnostico_motivo: row.diagnostico_motivo,
      _sintomas: row.sintomas || null,
      _tratamento: row.tratamento || null,
      _nome_clinica: row.nome_clinica || null,
      _peso: weight > 0 ? weight : null,
      _data: row.data,
      _request_id: requestId || null,
    }));
    const history = Array.isArray(data) ? data[0] : data;
    if (!history || !history.cod) {
      const error = new Error("O banco não retornou o registro clínico salvo.");
      error.code = "ITAPET_INVALID_HISTORY_RETURN";
      throw error;
    }
    return history;
  };
  db.unlinkPet = (clinicCod, petCod) =>
    result(sb.from("clinicas_e_pets").delete().eq("cod_clinica", clinicCod).eq("cod_pet", petCod).select("cod_clinica, cod_pet"));

  db.uploadDocument = async (file, petCod, userId, type) => {
    const path = "pets/" + petCod + "/" + userId + "/" + Date.now() + "-" + R.safeFileName(file.name);
    const { error: uploadError } = await sb.storage.from(db.DOCS_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
    if (uploadError) throw uploadError;
    let historyCod = null;
    try {
      const history = await db.insertHistory({
        cod_pet: petCod, tipo: "documento", diagnostico_motivo: type + ": " + file.name,
        data: R.localDateISO(new Date()), sintomas: path,
      });
      historyCod = history.cod;
      await result(sb.from("documentos")
        .insert({ cod_historico: history.cod, documento: path, data: R.localDateISO(new Date()) }).select("cod"));
    } catch (error) {
      await sb.storage.from(db.DOCS_BUCKET).remove([path]);
      if (historyCod) await sb.from("historico").delete().eq("cod", historyCod);
      throw error;
    }
  };

  db.deleteDocument = async (doc) => {
    const { error } = await sb.storage.from(db.DOCS_BUCKET).remove([doc.documento]);
    if (error) throw error;
    await result(sb.from("documentos").delete().eq("cod", doc.cod).select("cod").single());
    // A linha do histórico existe só para guardar o arquivo; remove também.
    await sb.from("historico").delete().eq("cod", doc.cod_historico);
  };

  db.errorMessage = (error) => {
    const msg = (error && error.message) || "";
    const code = (error && error.code) || "";
    if (/\[ITAPET_NOT_CLINIC\]/i.test(msg)) return "A vinculação só pode ser feita por uma conta de clínica.";
    if (/\[ITAPET_INVALID_PET_CODE\]/i.test(msg)) return "Código inválido. Use o formato PET-AB12-34.";
    if (/\[ITAPET_PET_NOT_FOUND\]/i.test(msg)) return "Nenhum pet foi encontrado com esse código.";
    if (/\[ITAPET_DUPLICATE_PET_CODE\]/i.test(msg)) return "Esse código está duplicado no cadastro. Corrija os pets duplicados no Supabase.";
    if (/\[ITAPET_ALREADY_LINKED\]/i.test(msg)) return "Este pet já está vinculado a esta clínica.";
    if (/\[ITAPET_HISTORY_ACCESS\]/i.test(msg)) return "Você não tem permissão para registrar informações neste pet.";
    if (/\[ITAPET_HISTORY_INVALID\]/i.test(msg)) return "Confira a data, o diagnóstico e o peso informado.";
    if (code === "ITAPET_INVALID_RPC_RETURN" || code === "ITAPET_INVALID_HISTORY_RETURN")
      return "O banco não confirmou a operação. Aplique a migração do Itapet e tente novamente.";
    if (code === "invalid_credentials" || /invalid login credentials/i.test(msg))
      return "E-mail ou senha incorretos. Confira seus dados e tente novamente.";
    if (/already registered|user_already_exists/i.test(msg + code))
      return 'Este e-mail já tem conta. Entre pela aba "Entrar".';
    if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail pelo link enviado antes de entrar.";
    if (/rate.?limit/i.test(msg) && /email/i.test(msg))
      return "Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente novamente.";
    if (/pet_codigo_key|duplicate key.*codigo/i.test(msg)) return "Este código já está sendo usado por outro pet.";
    if (code === "23505" || /duplicate key/i.test(msg)) {
      if (/cnpj/i.test(msg)) return "Já existe uma clínica cadastrada com este CNPJ.";
      if (/email/i.test(msg)) return "Já existe um cadastro com este e-mail.";
      return "Já existe um cadastro com estes dados.";
    }
    if (code === "23502" || /null value in column/i.test(msg)) return "Preencha os campos obrigatórios do cadastro.";
    if (code === "42501" || /permission denied|row-level security/i.test(msg))
      return "O banco bloqueou o cadastro (permissões/RLS). Aplique o script sql/corrigir-cadastro.sql no Supabase.";
    if (/registro não encontrado/i.test(msg))
      return "Cadastro não encontrado para esta conta. Saia e entre novamente.";
    return msg || "Não foi possível concluir a operação.";
  };

  I.db = db;
})(window.Itapet);
