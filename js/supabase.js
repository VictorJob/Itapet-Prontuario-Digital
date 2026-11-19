/* Supabase access layer. Only the public anon key belongs in this browser app. */
(() => {
  const config = window.ITAPET_SUPABASE_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(config.url || '') &&
    config.anonKey && config.anonKey !== 'SUA_CHAVE_ANON_PUBLICA';
  const client = configured && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

  function getClient() {
    if (!client) {
      throw new Error('Configure a URL e a chave anon pública do Supabase em js/supabase-config.js.');
    }
    return client;
  }

  async function result(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  function localDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  window.ItapetDB = {
    isConfigured: () => Boolean(client),
    auth: {
      signIn: (email, password) =>
        result(getClient().auth.signInWithPassword({ email, password })),
      signUp: (email, password, metadata) =>
        result(getClient().auth.signUp({ email, password, options: { data: metadata } })),
      signOut: () => result(getClient().auth.signOut()),
      getSession: async () => {
        const { data, error } = await getClient().auth.getSession();
        if (error) throw error;
        return data.session;
      },
      onChange: callback => getClient().auth.onAuthStateChange(callback),
    },
    getProfile: async userId => {
      const db = getClient();
      const tutor = await result(db.from('tutor').select('*').eq('auth_user_id', userId).maybeSingle());
      if (tutor) return { ...tutor, role: 'tutor' };
      const clinic = await result(db.from('clinica').select('*').eq('auth_user_id', userId).maybeSingle());
      return clinic ? { ...clinic, role: 'clinica' } : null;
    },
    getClinicName: async userId => {
      const clinic = await result(
        getClient().from('clinica').select('nome').eq('auth_user_id', userId).single()
      );
      if (!clinic.nome) throw new Error('O perfil da clínica não possui um nome cadastrado.');
      return clinic.nome;
    },
    ensureProfile: async (user, role, details) => {
      const db = getClient();
      const existing = await window.ItapetDB.getProfile(user.id);
      if (existing) return existing;
      const metadata = user.user_metadata || {};
      if (role === 'clinica') {
        const row = {
          auth_user_id: user.id,
          nome: details.nome || metadata.nome || user.email,
          email: user.email,
          cnpj: details.cnpj || metadata.cnpj || null,
          endereco: details.endereco || metadata.endereco || null,
          cep: details.cep || metadata.cep || null,
          telefone: details.telefone || metadata.telefone || null,
        };
        const clinic = await result(db.from('clinica').upsert(row, { onConflict: 'auth_user_id' }).select('*').single());
        return { ...clinic, role: 'clinica' };
      }
      const tutor = await result(db.from('tutor').upsert({
        auth_user_id: user.id,
        nome: details.nome || metadata.nome || user.email,
        email: user.email,
        telefone: details.telefone || metadata.telefone || null,
      }, { onConflict: 'auth_user_id' }).select('*').single());
      return { ...tutor, role: 'tutor' };
    },
    updateTutor: (cod, row) => result(getClient().from('tutor').update(row).eq('cod', cod).select('*').single()),
    getPets: async (profile, role) => {
      const db = getClient();
      if (role === 'clinica') {
        const links = await result(db.from('clinicas_e_pets').select('cod_pet').eq('cod_clinica', profile.cod));
        if (!links.length) return [];
        return result(db.from('pet').select('*').in('cod', links.map(link => link.cod_pet)).order('nome'));
      }
      return result(db.from('pet').select('*').eq('cod_tutor', profile.cod).order('nome'));
    },
    savePet: (row, code) => {
      const query = getClient().from('pet').upsert({ ...row, codigo: code }, { onConflict: 'codigo' });
      return result(query.select('*').single());
    },
    uploadPetPhoto: async (file, pet, userId) => {
      const db = getClient();
      const safeName = file.name.replace(/[^\w.-]/g, '_');
      const path = `pets/${pet.cod}/${userId}/${Date.now()}-${safeName}`;
      const { error } = await db.storage.from('itapet-pet-photos').upload(path, file, {
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });
      if (error) throw error;
      const { error: updateError } = await db.from('pet').update({ foto: path }).eq('cod', pet.cod);
      if (updateError) {
        const { error: removeError } = await db.storage.from('itapet-pet-photos').remove([path]);
        if (removeError) console.error('Não foi possível remover a foto após falha ao salvar o pet:', removeError);
        throw updateError;
      }
      return path;
    },
    getPetPhotoUrls: async pets => {
      const paths = pets.map(pet => pet.foto).filter(path => path && !/^https?:\/\//i.test(path));
      if (!paths.length) return {};
      const { data, error } = await getClient().storage.from('itapet-pet-photos').createSignedUrls(paths, 3600);
      if (error) throw error;
      return paths.reduce((urls, path, index) => {
        urls[path] = data[index] && data[index].signedUrl;
        return urls;
      }, {});
    },
    deletePet: async cod => {
      const db = getClient();
      const pet = await result(db.from('pet').select('foto').eq('cod', cod).single());
      const history = await result(db.from('historico').select('cod').eq('cod_pet', cod));
      const documents = history.length
        ? await result(db.from('documentos').select('documento').in('cod_historico', history.map(item => item.cod)))
        : [];
      const docPaths = documents.map(item => item.documento);
      if (docPaths.length) {
        const { error } = await db.storage.from('itapet-documents').remove(docPaths);
        if (error) throw error;
      }
      if (pet.foto && !/^https?:\/\//i.test(pet.foto)) {
        const { error } = await db.storage.from('itapet-pet-photos').remove([pet.foto]);
        if (error) throw error;
      }
      return result(db.from('pet').delete().eq('cod', cod).select('cod').single());
    },
    getHistory: petIds => petIds.length
      ? result(getClient().from('historico').select('*').in('cod_pet', petIds).order('data', { ascending: false }))
      : Promise.resolve([]),
    insertHistory: row => result(getClient().from('historico').insert(row).select('*').single()),
    deleteHistory: cod => result(getClient().from('historico').delete().eq('cod', cod).select('cod').single()),
    getWeights: petIds => petIds.length
      ? result(getClient().from('pet_peso').select('*').in('pet_cod', petIds).order('data'))
      : Promise.resolve([]),
    insertWeight: row => result(getClient().from('pet_peso').insert(row).select('*').single()),
    getReminders: petIds => petIds.length
      ? result(getClient().from('lembrete').select('*').in('cod_pet', petIds).order('data'))
      : Promise.resolve([]),
    insertReminder: row => result(getClient().from('lembrete').insert(row).select('*').single()),
    deleteReminder: cod => result(getClient().from('lembrete').delete().eq('cod', cod).select('cod').single()),
    getDocuments: async historyIds => {
      if (!historyIds.length) return [];
      const db = getClient();
      const docs = await result(db.from('documentos').select('*').in('cod_historico', historyIds).order('data', { ascending: false }));
      const { data, error } = await db.storage.from('itapet-documents').createSignedUrls(
        docs.map(doc => doc.documento), 3600
      );
      if (error) throw error;
      return docs.map((doc, index) => ({ ...doc, signedUrl: data[index] && data[index].signedUrl }));
    },
    uploadDocument: async (file, pet, profile, role, type) => {
      const db = getClient();
      const safeName = file.name.replace(/[^\w.-]/g, '_');
      const path = `pets/${pet.cod}/${profile.auth_user_id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await db.storage.from('itapet-documents').upload(path, file, {
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });
      if (uploadError) throw uploadError;
      let history;
      try {
        history = await window.ItapetDB.insertHistory({
          cod_pet: pet.cod,
          tipo: 'documento',
          diagnostico_motivo: `${type}: ${file.name}`,
          data: localDateISO(new Date()),
          sintomas: path,
        });
        await result(db.from('documentos').insert({
          cod_historico: history.cod,
          documento: path,
          data: localDateISO(new Date()),
        }));
      } catch (error) {
        const { error: removeError } = await db.storage.from('itapet-documents').remove([path]);
        if (removeError) console.error('Não foi possível remover o arquivo após falha ao salvar o registro:', removeError);
        if (history) {
          const { error: historyError } = await db.from('historico').delete().eq('cod', history.cod);
          if (historyError) console.error('Não foi possível reverter o registro clínico após falha no documento:', historyError);
        }
        throw error;
      }
    },
    deleteDocument: async doc => {
      const db = getClient();
      const { error } = await db.storage.from('itapet-documents').remove([doc.documento]);
      if (error) throw error;
      await result(db.from('documentos').delete().eq('cod', doc.cod).select('cod').single());
    },
    saveVeterinarian: row => result(getClient().from('veterinario').insert(row).select('*').single()),
    getVeterinarians: clinicId => result(getClient().from('veterinario').select('*').eq('cod_clinica', clinicId).order('nome')),
    updateClinic: (cod, row) => result(getClient().from('clinica').update(row).eq('cod', cod).select('*').single()),
  };
})();
