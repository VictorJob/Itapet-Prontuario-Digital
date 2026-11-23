/* Estado global da aplicação (substitui o ItapetContext + React Query). */
window.Itapet = window.Itapet || {};
(function (I) {
  const S = {
    user: null,
    profile: null,   // { ...tutor|clinica, role }
    role: null,      // "tutor" | "clinica"
    userId: "",
    email: "",
    data: I.db.EMPTY(),
    activePetId: null,
  };
  I.state = S;

  /** Pet selecionado (ou o primeiro da lista). */
  I.activePet = () => S.data.pets.find((p) => p.cod === S.activePetId) || S.data.pets[0];
  I.setActivePetId = (cod) => { S.activePetId = cod; };

  /** Recarrega os dados do banco e redesenha a tela atual. */
  I.refresh = async () => {
    try {
      S.data = await I.db.loadAppData(S.profile);
    } catch (error) {
      I.ui.toast(I.db.errorMessage(error) || "Não foi possível carregar seus dados.");
    }
    if (I.router) I.router.render();
  };

  /** Recarrega o perfil (ex.: após editar dados da clínica) e redesenha menu + tela. */
  I.refreshProfile = async () => {
    S.profile = await I.db.loadLoginProfile();
    I.shell.mount();
    await I.refresh();
  };

  I.resetState = () => {
    S.user = null; S.profile = null; S.role = null; S.userId = ""; S.email = "";
    S.data = I.db.EMPTY(); S.activePetId = null;
  };

  /** Abre um modal. Os modais são registrados em Itapet.modals (etapa 3). */
  I.modals = I.modals || {};
  I.openModal = (name, pet) => {
    const handler = I.modals[name];
    if (handler) handler.open(pet || null);
    else I.ui.toast("Este formulário será migrado na etapa 3.");
  };
  I.closeModal = () => {
    Object.values(I.modals).forEach((m) => m.close && m.close());
  };
})(window.Itapet);
