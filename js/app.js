// ===== AUTH =====
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-tab')[tab === 'login' ? 0 : 1].classList.add('active');
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
}

function selectRole(el) {
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  const isClinic = el.querySelector('.role-label').textContent.trim() === 'Clínica';
  document.querySelectorAll('.register-clinic-field').forEach(field => {
    field.style.display = isClinic ? '' : 'none';
  });
  document.getElementById('register-name-label').textContent = isClinic ? 'Nome da clínica' : 'Nome completo';
  document.getElementById('register-name').placeholder = isClinic ? 'Nome da clínica' : 'Seu nome completo';
  document.getElementById('register-cnpj').required = isClinic;
}

function selectedRegistrationRole() {
  const selected = document.querySelector('.role-btn.selected .role-label');
  return selected && selected.textContent.trim() === 'Clínica' ? 'clinica' : 'tutor';
}

function isValidCnpj(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calculateDigit = (base, weights) => {
    const sum = [...base].reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const firstDigit = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return firstDigit === Number(digits[12]) && secondDigit === Number(digits[13]);
}

function authError(error) {
  console.error(error);
  showToast(error.message || 'Não foi possível concluir a operação no Supabase.');
}

function isEmailRateLimitError(error) {
  const details = `${error.code || ''} ${error.message || ''}`;
  return /email/i.test(details) && /rate.?limit/i.test(details);
}

async function signInAccount() {
  const email = document.getElementById('login-email').value.trim();
  try {
    const password = document.getElementById('login-password').value;
    if (!email || !password) throw new Error('Informe e-mail e senha.');
    const data = await ItapetDB.auth.signIn(email, password);
    if (!data || !data.user) throw new Error('O Supabase não retornou o usuário autenticado.');
    const metadata = data.user.user_metadata || {};
    let profile = await ItapetDB.getProfile(data.user.id);
    if (!profile) {
      profile = await ItapetDB.ensureProfile(data.user, metadata.role || 'tutor', {});
    }
    if (!['tutor', 'clinica'].includes(profile.role)) throw new Error('O perfil desta conta não é válido.');
    pendingAuthRole = null;
    startApp(data.user, profile);
  } catch (error) {
    pendingAuthRole = null;
    if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message || '')) {
      document.getElementById('register-email').value = email;
      switchAuthTab('register');
      showToast('Não encontramos uma conta com esses dados. Você já pode preencher o cadastro.');
      return;
    }
    authError(error);
  }
}

async function registerAccount() {
  const submitButton = document.getElementById('register-submit');
  if (submitButton.disabled) return;
  const originalButtonText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Criando conta...';
  let failed = false;
  try {
    const role = selectedRegistrationRole();
    pendingAuthRole = role;
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    const phone = document.getElementById('register-phone').value.trim();
    if (!name || !email || !password) throw new Error('Informe nome, e-mail e senha.');
    if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');
    if (password !== passwordConfirm) throw new Error('As senhas não coincidem.');
    const cnpj = document.getElementById('register-cnpj').value.replace(/\D/g, '');
    if (role === 'clinica' && !isValidCnpj(cnpj)) throw new Error('Informe um CNPJ válido com 14 dígitos.');
    const details = {
      nome: name,
      telefone: phone,
      cnpj: role === 'clinica' ? cnpj : '',
      endereco: document.getElementById('register-address').value.trim(),
      cep: document.getElementById('register-cep').value.trim(),
    };
    const data = await ItapetDB.auth.signUp(email, password, { ...details, role });
    if (!data || !data.user) throw new Error('O Supabase não retornou o usuário criado.');
    if (!data.session) {
      pendingAuthRole = null;
      showToast('Conta criada. Confirme o e-mail e depois entre no aplicativo.');
      document.getElementById('login-email').value = email;
      switchAuthTab('login');
      return;
    }
    const profile = await ItapetDB.ensureProfile(data.user, role, details);
    pendingAuthRole = null;
    startApp(data.user, profile);
  } catch (error) {
    failed = true;
    pendingAuthRole = null;
    if (isEmailRateLimitError(error)) {
      console.error(error);
      showToast('O Supabase recusou o envio do e-mail. Confira o Auth/SMTP e clique em “Tentar novamente” após corrigir.');
    } else {
      authError(error);
    }
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = failed ? 'Tentar novamente' : originalButtonText;
  }
}

async function restoreSession(session) {
  if (!session) return;
  try {
    const metadata = session.user.user_metadata || {};
    let profile = await ItapetDB.getProfile(session.user.id);
    if (!profile) profile = await ItapetDB.ensureProfile(session.user, metadata.role || 'tutor', {});
    if (pendingAuthRole && profile.role !== pendingAuthRole) {
      pendingAuthRole = null;
      await ItapetDB.auth.signOut();
      showToast('Esta conta não pertence ao perfil selecionado.');
      return;
    }
    pendingAuthRole = null;
    startApp(session.user, profile);
  } catch (error) {
    authError(error);
  }
}

let pendingAuthRole = null;

window.addEventListener('load', () => {
  if (!ItapetDB.isConfigured()) return;
  ItapetDB.auth.onChange((event, session) => {
    if (session && event !== 'SIGNED_IN') setTimeout(() => restoreSession(session), 0);
  });
  ItapetDB.auth.getSession().then(restoreSession).catch(authError);
});

let currentRole = 'tutor';
let currentProfile = null;
let currentUser = null;
let petsData = [];
let historyData = [];
let reminderData = [];
let weightData = [];
let documentData = [];
let veterinarianData = [];
let activePetId = null;

const ROLE_MENUS = {
  tutor: [
    { section: 'Principal' },
    { id:'dashboard', icon:'🏠', label:'Dashboard' },
    { id:'pets', icon:'🐶', label:'Meus Pets' },
    { id:'prontuario', icon:'📋', label:'Prontuário' },
    { id:'vacinas', icon:'💉', label:'Vacinas' },
    { section: 'Acompanhamento' },
    { id:'consultas', icon:'📅', label:'Consultas' },
    { id:'exames', icon:'🧪', label:'Exames' },
    { id:'medicamentos', icon:'💊', label:'Medicamentos' },
    { section: 'Mais' },
    { id:'relatorios', icon:'📊', label:'Relatórios' },
    { id:'planos', icon:'💰', label:'Planos' },
    { id:'seguranca', icon:'🔐', label:'Segurança' },
  ],
  vet: [],
  clinica: [
    { section: 'Clínica' },
    { id:'dashboard', icon:'🏠', label:'Dashboard' },
    { id:'clinica-perfil', icon:'🏥', label:'Dados da Clínica' },
    { id:'clinica-vets', icon:'🩺', label:'Veterinários' },
    { section: 'Operação' },
    { id:'consultas', icon:'📅', label:'Agenda & Reservas' },
    { id:'pets', icon:'🐶', label:'Pacientes' },
    { id:'prontuario', icon:'📋', label:'Prontuário' },
    { id:'vacinas', icon:'💉', label:'Vacinas' },
    { id:'exames', icon:'🧪', label:'Exames' },
    { id:'medicamentos', icon:'💊', label:'Prescrições' },
    { section: 'Gestão' },
    { id:'relatorios', icon:'📊', label:'Relatórios' },
    { id:'planos', icon:'💰', label:'Planos' },
    { id:'seguranca', icon:'🔐', label:'Segurança' },
  ],
};

function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  const items = ROLE_MENUS[currentRole] || ROLE_MENUS.tutor;
  nav.innerHTML = items.map(it => {
    if (it.section) return `<div class="nav-section-label">${it.section}</div>`;
    const badge = it.badge ? `<span class="badge">${it.badge}</span>` : '';
    return `<button class="nav-item" data-view="${it.id}" onclick="showView('${it.id}', this)">
      <div class="nav-icon">${it.icon}</div> ${it.label}${badge}
    </button>`;
  }).join('');
  // ativar primeiro item navegável
  const first = nav.querySelector('.nav-item');
  if (first) { first.classList.add('active'); showView(first.dataset.view, first); }
}

function applyRoleVisibility() {
  // mostrar elementos data-role-<role>-only só para o papel correspondente
  document.querySelectorAll('[data-role-tutor-only]').forEach(el => el.style.display = currentRole==='tutor' ? '' : 'none');
  document.querySelectorAll('[data-role-vet-only], [data-role-clinica-only]').forEach(el => {
    const isVetOnly = el.hasAttribute('data-role-vet-only');
    const isClinOnly = el.hasAttribute('data-role-clinica-only');
    const allowed = (isVetOnly && currentRole==='vet') || (isClinOnly && currentRole==='clinica');
    el.style.display = allowed ? '' : 'none';
  });
  // Exames: título da lista
  document.querySelectorAll('[data-exames-list-title]').forEach(el => {
    el.textContent = currentRole==='tutor' ? 'Documentos & Solicitações dos veterinários' : 'Documentos Salvos';
  });
}

function startApp(user, profile) {
  if (currentUser && currentUser.id === user.id && currentProfile && currentProfile.cod === profile.cod) return;
  currentUser = user;
  currentProfile = profile;
  currentRole = profile.role;
  document.body.classList.toggle('role-tutor', currentRole === 'tutor');
  document.body.classList.toggle('role-clinica', currentRole === 'clinica');
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  const prof = { name: profile.nome || user.email, role: currentRole === 'clinica' ? 'Clínica Veterinária' : 'Tutor(a)', avatar: currentRole === 'clinica' ? '🏥' : (profile.nome || user.email).charAt(0).toUpperCase(), bg: '' };
  document.getElementById('sidebar-user-name').textContent = prof.name;
  document.getElementById('sidebar-user-role').textContent = prof.role;
  const av = document.querySelector('.user-avatar');
  av.textContent = prof.avatar;
  if (prof.bg) av.style.background = prof.bg;
  // topbar avatar
  const tbAv = document.querySelector('.topbar-right .user-avatar');
  if (tbAv) { tbAv.textContent = prof.avatar; }
  buildSidebar();
  applyRoleVisibility();
  const ownerName = document.getElementById('pet-owner-name');
  const ownerPhone = document.getElementById('pet-owner-phone');
  if (ownerName) ownerName.value = currentRole === 'tutor' ? (profile.nome || '') : '';
  if (ownerPhone) ownerPhone.value = currentRole === 'tutor' ? (profile.telefone || '') : '';
  refreshAppData().catch(authError);
}

function openVetModal() {
  if (!currentProfile || currentRole !== 'clinica') { showToast('Entre com uma conta de clínica para cadastrar veterinários.'); return; }
  document.getElementById('modal-vet').classList.add('open');
}

async function logout() {
  try {
    await ItapetDB.auth.signOut();
  } catch (error) {
    authError(error);
    return;
  }
  currentUser = null;
  currentProfile = null;
  petsData = [];
  historyData = [];
  reminderData = [];
  weightData = [];
  documentData = [];
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

// ===== NAVIGATION =====
function showView(name, navEl) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById('view-' + name);
  if (view) view.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  const titles = {
    dashboard: ['Dashboard', 'Visão geral'],
    pets: ['Meus Pets', 'Gerencie todos os seus pets cadastrados'],
    prontuario: ['Prontuário Digital', 'Histórico clínico completo do pet selecionado'],
    vacinas: ['Carteira de Vacinação', 'Controle de vacinas e reforços'],
    consultas: currentRole==='tutor' ? ['Consultas', 'Acompanhe as consultas dos seus pets'] : ['Agenda', 'Agendamentos e atendimentos'],
    exames: currentRole==='tutor' ? ['Exames & Documentos', 'Visualize solicitações e laudos da clínica'] : ['Exames & Documentos', 'Upload, solicitações e visualização'],
    medicamentos: currentRole==='tutor' ? ['Medicamentos', 'Prescrições ativas dos seus pets'] : ['Medicamentos', 'Prescrições e controle de dosagem'],
    relatorios: ['Relatórios & Insights', 'Análise dos atendimentos'],
    planos: ['Planos', 'Escolha o melhor plano para você'],
    seguranca: ['Segurança & Privacidade', 'Proteção dos dados — LGPD'],
    'clinica-perfil': ['Dados da Clínica', 'Atualize o cadastro da sua clínica'],
    'clinica-vets': ['Veterinários & Reservas', 'Gestão da equipe e solicitações dos tutores']
  };
  if (titles[name]) {
    document.getElementById('page-title').textContent = titles[name][0];
    document.getElementById('page-subtitle').textContent = titles[name][1];
  }
  applyRoleVisibility();
}

function showPetProfile(petCode) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pet = petsData.find(item => String(item.cod) === String(petCode)) ||
    petsData.find(item => item.nome === petCode);
  if (pet) activePetId = pet.cod;
  showView('prontuario', null);
  renderHistory();
}

// ===== TABS =====
function switchTab(btn, panelId) {
  const parent = btn.closest('.tabs');
  parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');
}

// ===== MODALS =====
function openAddPetModal() {
  if (currentRole !== 'tutor') { showToast('O cadastro de pets deve ser feito pela conta do tutor.'); return; }
  resetPetForm();
  document.getElementById('pet-owner-name').value = currentProfile.nome || '';
  document.getElementById('pet-owner-phone').value = currentProfile.telefone || '';
  editingPetCod = null;
  document.getElementById('modal-add-pet').classList.add('open');
}
function openVaccineModal() {
  fillPetSelectors();
  document.getElementById('modal-vaccine').classList.add('open');
}
async function openConsultaModal() {
  fillPetSelectors();
  const clinicInput = document.getElementById('consulta-clinic');
  clinicInput.value = '';
  clinicInput.readOnly = currentRole === 'clinica';
  if (currentRole === 'clinica') {
    try {
      clinicInput.value = await ItapetDB.getClinicName(currentUser.id);
    } catch (error) {
      authError(error);
      return;
    }
  }
  document.getElementById('modal-consulta').classList.add('open');
}
function openNotifModal() {
  renderNotifications();
  document.getElementById('modal-notif').classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'modal-add-pet') resetPetForm();
}

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

const petEmojis = ['🐕','🐩','🐈','🐱','🐰','🐹','🦜','🐾','🐇','🦮'];
let emojiIdx = 0;
let pendingPetPhoto = '';
let pendingPetFile = null;
let editingPetCod = null;
function changePetEmoji(el) {
  emojiIdx = (emojiIdx + 1) % petEmojis.length;
  el.textContent = petEmojis[emojiIdx];
}

function previewPetPhoto(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showToast('Selecione uma imagem JPG, PNG ou WEBP de até 5 MB.');
    event.target.value = '';
    return;
  }
  pendingPetFile = file;
  pendingPetPhoto = URL.createObjectURL(file);
  const image = document.getElementById('pet-photo-image');
  const emoji = document.getElementById('pet-emoji');
  if (image && emoji) {
    image.src = pendingPetPhoto;
    image.style.display = 'block';
    emoji.style.display = 'none';
  }
}

// ===== PETS REGISTRY =====
function normalizeCode(c) { return (c || '').trim().toUpperCase(); }

function generatePetCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PET-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random()*chars.length)];
  code += '-';
  for (let i = 0; i < 2; i++) code += chars[Math.floor(Math.random()*chars.length)];
  if (petsData.some(pet => pet.codigo === code)) return generatePetCode();
  document.getElementById('pet-code').value = code;
  checkPetCode();
}

function checkPetCode() {
  const codeInput = document.getElementById('pet-code');
  const hint = document.getElementById('pet-code-hint');
  const btn = document.getElementById('pet-save-btn');
  const code = normalizeCode(codeInput.value);
  codeInput.value = code;
  const pet = petsData.find(item => item.codigo === code);
  if (code && pet && (!editingPetCod || String(pet.cod) !== String(editingPetCod))) {
    hint.textContent = `⚠ Código já pertence a ${pet.nome}.`;
    hint.style.color = 'var(--amber)';
    btn.disabled = true;
  } else {
    hint.textContent = 'Informe um código único para este pet.';
    hint.style.color = 'var(--text-light)';
    btn.disabled = false;
    btn.textContent = editingPetCod ? 'Salvar alterações' : 'Cadastrar pet 🐾';
  }
}

async function savePet() {
  if (!currentProfile || currentRole !== 'tutor') { showToast('Entre como tutor para cadastrar pets.'); return; }
  const code = normalizeCode(document.getElementById('pet-code').value);
  const name = document.getElementById('pet-name').value.trim();
  const ownerName = document.getElementById('pet-owner-name').value.trim();
  const ownerPhone = document.getElementById('pet-owner-phone').value.trim();
  if (!name) { showToast('Informe o nome do pet ⚠️'); return; }
  if (!code) { showToast('Informe ou gere um código ⚠️'); return; }
  if (!ownerName || !ownerPhone) { showToast('Informe o nome e o telefone do responsável ⚠️'); return; }
  try {
    if (petsData.some(pet => pet.codigo === code && String(pet.cod) !== String(editingPetCod))) {
      throw new Error('Este código já está sendo usado por outro pet.');
    }
    if (ownerName !== currentProfile.nome || ownerPhone !== currentProfile.telefone) {
      currentProfile = await ItapetDB.updateTutor(currentProfile.cod, { nome: ownerName, telefone: ownerPhone });
      currentProfile.role = 'tutor';
    }
    const previousPet = petsData.find(pet => String(pet.cod) === String(editingPetCod)) ||
      petsData.find(pet => pet.codigo === code);
    const pet = await ItapetDB.savePet({
      ...(editingPetCod ? { cod: editingPetCod } : {}),
      cod_tutor: currentProfile.cod,
      nome: name,
      especie: document.getElementById('pet-species').value,
      raca: document.getElementById('pet-breed').value.trim() || null,
      sexo: document.getElementById('pet-sex').value,
      nascimento: document.getElementById('pet-birth').value || null,
      microchip: document.getElementById('pet-microchip').value.trim() || null,
      cadastrado: document.getElementById('pet-cadastrado').checked,
      foto: previousPet && previousPet.foto || null,
    }, code);
    const weight = Number(document.getElementById('pet-weight').value);
    const previousWeight = weightData.filter(item => item.pet_cod === pet.cod).slice(-1)[0];
    if (weight > 0 && (!previousWeight || Number(previousWeight.peso) !== weight)) {
      await ItapetDB.insertWeight({ pet_cod: pet.cod, peso: weight, data: localDateISO(new Date()) });
    }
    if (pendingPetFile) await ItapetDB.uploadPetPhoto(pendingPetFile, pet, currentUser.id);
    closeModal('modal-add-pet');
    resetPetForm();
    await refreshAppData();
    showToast(previousPet ? 'Cadastro do pet atualizado.' : 'Pet cadastrado com sucesso.');
  } catch (error) {
    authError(error);
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
}

function resetPetForm() {
  ['pet-name','pet-breed','pet-birth','pet-weight','pet-microchip','pet-code','pet-owner-name','pet-owner-phone','pet-photo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('pet-cadastrado').checked = true;
  if (pendingPetPhoto) URL.revokeObjectURL(pendingPetPhoto);
  pendingPetPhoto = '';
  pendingPetFile = null;
  editingPetCod = null;
  const photoImage = document.getElementById('pet-photo-image');
  const petEmoji = document.getElementById('pet-emoji');
  if (photoImage && petEmoji) { photoImage.removeAttribute('src'); photoImage.style.display = 'none'; petEmoji.style.display = ''; }
}

function renderPets() {
  const container = document.getElementById('pets-grid');
  if (!container) return;
  const petCards = petsData.map(pet => {
    const photo = pet.photoUrl || (/^https?:\/\//i.test(pet.foto || '') ? pet.foto : '');
    const avatar = photo
      ? `<div class="pet-avatar has-photo" style="width:80px;height:80px"><img src="${escapeHtml(photo)}" alt="Foto de ${escapeHtml(pet.nome)}"><div class="status-dot ok"></div></div>`
      : `<div class="pet-avatar" style="background:var(--green-pale);width:80px;height:80px;font-size:40px">🐾<div class="status-dot ok"></div></div>`;
    return `<div class="pet-card" onclick="showPetProfile('${pet.cod}')" style="padding:28px 20px">
      ${avatar}
      <div class="pet-name" style="font-size:20px;margin-top:4px">${escapeHtml(pet.nome)}</div>
      <div class="pet-breed">${escapeHtml(pet.raca || pet.especie || '')}</div>
      <div style="font-size:12px;color:var(--text-light);margin:6px 0 10px">${escapeHtml(pet.sexo || '')}${pet.codigo ? ` · ${escapeHtml(pet.codigo)}` : ''}</div>
      <div style="margin-top:14px;display:flex;gap:6px;justify-content:center">
        ${currentRole === 'tutor' ? `<button class="btn-sm btn-outline" onclick="editPet('${pet.cod}',event)">Editar</button><button class="btn-sm btn-outline" onclick="removePet('${pet.cod}',event)">Excluir</button>` : ''}
      </div>
    </div>`;
  }).join('');
  const addCard = currentRole === 'tutor' ? '<div class="add-pet-card" onclick="openAddPetModal()"><div class="add-icon">➕</div><span>Adicionar novo pet</span></div>' : '';
  container.innerHTML = petCards + addCard;
}

function editPet(cod, event) {
  event.stopPropagation();
  const pet = petsData.find(item => String(item.cod) === String(cod));
  if (!pet) return;
  resetPetForm();
  editingPetCod = pet.cod;
  document.getElementById('pet-name').value = pet.nome || '';
  document.getElementById('pet-species').value = pet.especie || 'Outro';
  document.getElementById('pet-breed').value = pet.raca || '';
  document.getElementById('pet-sex').value = pet.sexo || 'Macho';
  document.getElementById('pet-birth').value = pet.nascimento || '';
  document.getElementById('pet-microchip').value = pet.microchip || '';
  document.getElementById('pet-code').value = pet.codigo || '';
  document.getElementById('pet-cadastrado').checked = pet.cadastrado !== false;
  document.getElementById('pet-owner-name').value = currentProfile.nome || '';
  document.getElementById('pet-owner-phone').value = currentProfile.telefone || '';
  if (pet.photoUrl) {
    const image = document.getElementById('pet-photo-image');
    image.src = pet.photoUrl;
    image.style.display = 'block';
    document.getElementById('pet-emoji').style.display = 'none';
  }
  checkPetCode();
  document.getElementById('modal-add-pet').classList.add('open');
}

async function removePet(cod, event) {
  event.stopPropagation();
  if (!window.confirm('Excluir este pet e os registros vinculados?')) return;
  try {
    await ItapetDB.deletePet(cod);
    await refreshAppData();
    showToast('Pet excluído.');
  } catch (error) {
    authError(error);
  }
}

function formatDate(value) {
  if (!value) return '—';
  const parts = value.slice(0, 10).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

function localDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function refreshAppData() {
  if (!currentProfile) return;
  const [pets, vets] = await Promise.all([
    ItapetDB.getPets(currentProfile, currentRole),
    currentRole === 'clinica' ? ItapetDB.getVeterinarians(currentProfile.cod) : Promise.resolve([]),
  ]);
  const petIds = pets.map(pet => pet.cod);
  const [history, reminders, weights] = await Promise.all([
    ItapetDB.getHistory(petIds),
    ItapetDB.getReminders(petIds),
    ItapetDB.getWeights(petIds),
  ]);
  const documentHistory = history.filter(item => item.tipo === 'documento');
  const [photoUrls, documents] = await Promise.all([
    ItapetDB.getPetPhotoUrls(pets),
    ItapetDB.getDocuments(documentHistory.map(item => item.cod)),
  ]);
  petsData = pets.map(pet => ({
    ...pet,
    photoUrl: photoUrls[pet.foto] || (/^https?:\/\//i.test(pet.foto || '') ? pet.foto : ''),
  }));
  historyData = history;
  reminderData = reminders;
  weightData = weights;
  documentData = documents;
  veterinarianData = vets;
  renderPets();
  renderDashboard();
  renderAppointments();
  renderHistory();
  renderVaccines();
  renderMedications();
  renderDocuments();
  renderWeightChart();
  renderReports();
  renderVeterinarians();
  fillPetSelectors();
  renderClinicProfile();
}

function fillPetSelectors() {
  ['vaccine-pet', 'vaccine-filter', 'consulta-pet', 'appointment-pet', 'medication-pet', 'document-pet', 'report-pet'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const selected = select.value;
    select.innerHTML = petsData.map(pet => `<option value="${pet.cod}">${escapeHtml(pet.nome)}</option>`).join('');
    if (selected && petsData.some(pet => String(pet.cod) === selected)) select.value = selected;
  });
  const vets = document.getElementById('appointment-vet');
  if (vets) vets.innerHTML = '<option value="">Não informado</option>' +
    veterinarianData.map(vet => `<option value="${vet.cod}">${escapeHtml(vet.nome)}</option>`).join('');
  const owner = document.getElementById('appointment-owner');
  const phone = document.getElementById('appointment-phone');
  if (currentRole === 'tutor') {
    if (owner) owner.value = currentProfile.nome || '';
    if (phone) phone.value = currentProfile.telefone || '';
  }
}

function renderDashboard() {
  const setStat = (key, value) => {
    const element = document.querySelector(`[data-stat="${key}"]`);
    if (element) element.textContent = String(value);
  };
  const today = localDateISO(new Date());
  const upcoming = reminderData.filter(item => item.data >= today).sort((a, b) => a.data.localeCompare(b.data));
  const vaccinations = historyData.filter(item => item.tipo === 'vacina');
  const vaccineAlerts = vaccinations.filter(item => {
    const match = (item.tratamento || '').match(/Reforço:\s*(\d{4}-\d{2}-\d{2})/);
    return match && match[1] <= today;
  });
  setStat('pets', petsData.length);
  setStat('vaccines', vaccineAlerts.length);
  setStat('appointments', upcoming.filter(item => item.tipo === 'consulta' || item.tipo === 'agendamento').length);
  setStat('documents', documentData.length);
  const details = {
    pets: currentRole === 'tutor' ? 'Seus pets cadastrados' : 'Pacientes vinculados',
    vaccines: vaccineAlerts.length ? 'Atenção necessária' : 'Nenhum reforço vencido',
    appointments: upcoming.length ? `Próxima: ${formatDate(upcoming[0].data)}` : 'Nenhuma consulta futura',
    documents: 'Arquivos no prontuário',
  };
  Object.keys(details).forEach(key => {
    const element = document.querySelector(`[data-stat-detail="${key}"]`);
    if (element) element.textContent = details[key];
  });
  const dashboardPets = document.getElementById('dashboard-pets');
  const petCardTitle = document.querySelector('#view-dashboard .card-title');
  if (petCardTitle) petCardTitle.textContent = currentRole === 'tutor' ? 'Meus Pets' : 'Pacientes';
  if (dashboardPets) dashboardPets.innerHTML = petsData.slice(0, 3).map(pet =>
    `<div class="pet-card" onclick="showPetProfile('${pet.cod}')"><div class="pet-avatar">${pet.photoUrl ? `<img src="${escapeHtml(pet.photoUrl)}" alt="">` : '🐾'}</div><div class="pet-name">${escapeHtml(pet.nome)}</div><div class="pet-breed">${escapeHtml(pet.raca || pet.especie || '')}</div></div>`
  ).join('') + (currentRole === 'tutor' ? '<div class="add-pet-card" onclick="openAddPetModal()"><div class="add-icon">➕</div><span>Adicionar novo pet</span></div>' : '');
  const alerts = document.getElementById('dashboard-alerts');
  if (alerts) alerts.innerHTML = vaccineAlerts.length
    ? vaccineAlerts.map(item => `<div class="notif-item"><div class="notif-icon">💉</div><div class="notif-text"><div class="notif-title">${escapeHtml(item.diagnostico_motivo)}</div><div class="notif-desc">Reforço vencido · ${formatDate(item.data)}</div></div></div>`).join('')
    : '<p class="text-sm text-mid">Nenhum alerta pendente.</p>';
  const recent = document.getElementById('dashboard-activity');
  if (recent) recent.innerHTML = historyData.slice(0, 5).map(item => {
    const pet = petsData.find(candidate => candidate.cod === item.cod_pet);
    return `<div class="timeline-item"><div class="timeline-dot">📋</div><div class="timeline-content"><div class="timeline-date">${formatDate(item.data)}</div><div class="timeline-title">${escapeHtml(item.tipo || 'Registro')} — ${escapeHtml(pet && pet.nome)}</div><div class="timeline-desc">${escapeHtml(item.diagnostico_motivo || '')}</div></div></div>`;
  }).join('') || '<p class="text-sm text-mid">Nenhum registro ainda.</p>';
  renderNotifications();
}

function renderNotifications() {
  const list = document.getElementById('notification-list');
  if (!list) return;
  const today = localDateISO(new Date());
  const future = new Date();
  future.setDate(future.getDate() + 7);
  const endDate = localDateISO(future);
  const reminders = reminderData.filter(item => item.data >= today && item.data <= endDate);
  const vaccines = historyData.filter(item => {
    if (item.tipo !== 'vacina') return false;
    const match = (item.tratamento || '').match(/Reforço:\s*(\d{4}-\d{2}-\d{2})/);
    return match && match[1] <= endDate;
  });
  const entries = [
    ...reminders.map(item => {
      const pet = petsData.find(candidate => candidate.cod === item.cod_pet);
      return { title: item.titulo, detail: `${pet ? pet.nome : ''} · ${formatDate(item.data)} ${String(item.hora || '').slice(0, 5)}` };
    }),
    ...vaccines.map(item => {
      const pet = petsData.find(candidate => candidate.cod === item.cod_pet);
      return { title: `Reforço de vacina: ${item.diagnostico_motivo}`, detail: `${pet ? pet.nome : ''} · ${item.tratamento || ''}` };
    }),
  ];
  list.innerHTML = entries.map(item => `<div class="notif-item"><div class="notif-icon">🔔</div><div class="notif-text"><div class="notif-title">${escapeHtml(item.title)}</div><div class="notif-desc">${escapeHtml(item.detail)}</div></div></div>`).join('') ||
    '<p class="text-sm text-mid">Nenhum lembrete para os próximos 7 dias.</p>';
}

function appointmentHtml(item) {
  const pet = petsData.find(candidate => candidate.cod === item.cod_pet);
  const date = item.data || '';
  const parts = date.split('-');
  const day = parts.length === 3 ? parts[2] : '—';
  const month = parts.length === 3 ? new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }) : '';
  const time = String(item.hora || '').slice(0, 5);
  return `<div class="appointment-item"><div class="appt-date"><div class="day">${day}</div><div class="month">${month}</div></div><div class="appt-info"><div class="appt-title">${escapeHtml(item.titulo)}</div><div class="appt-details">${escapeHtml(item.detalhe || item.tipo || '')}</div></div><div class="appt-time">${time}<span class="pet-name-small">${escapeHtml(pet && pet.nome)}</span><button class="btn-sm btn-outline" onclick="removeReminder('${item.cod}')">Excluir</button></div></div>`;
}

function renderAppointments() {
  const today = localDateISO(new Date());
  const upcoming = reminderData.filter(item => item.data >= today).sort((a, b) => a.data.localeCompare(b.data));
  const past = reminderData.filter(item => item.data < today).sort((a, b) => b.data.localeCompare(a.data));
  const upcomingHtml = upcoming.map(appointmentHtml).join('') || '<p class="text-sm text-mid">Nenhuma consulta futura.</p>';
  const pastHtml = past.map(appointmentHtml).join('') || '<p class="text-sm text-mid">Nenhuma consulta anterior.</p>';
  ['upcoming-appointments', 'dashboard-appointments'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.innerHTML = upcomingHtml;
  });
  const pastElement = document.getElementById('past-appointments');
  if (pastElement) pastElement.innerHTML = pastHtml;
  const clinicAppointments = document.getElementById('clinic-appointments');
  if (clinicAppointments) clinicAppointments.innerHTML = upcoming.map(appointmentHtml).join('') || '<p class="text-sm text-mid">Nenhuma consulta agendada.</p>';
}

async function scheduleAppointment() {
  const petId = Number(document.getElementById('appointment-pet').value);
  const date = document.getElementById('appointment-date').value;
  const title = document.getElementById('appointment-type').value;
  const pet = petsData.find(item => item.cod === petId);
  if (!pet || !date) { showToast('Selecione um pet e informe a data.'); return; }
  try {
    const vetId = Number(document.getElementById('appointment-vet').value) || null;
    const detail = [
      document.getElementById('appointment-details').value.trim(),
      document.getElementById('appointment-owner').value.trim(),
      document.getElementById('appointment-phone').value.trim(),
    ].filter(Boolean).join(' · ');
    await ItapetDB.insertReminder({
      cod_pet: petId,
      cod_veterinario: vetId,
      titulo: title,
      tipo: 'consulta',
      detalhe: detail || null,
      data: date,
      hora: document.getElementById('appointment-time').value || null,
      agendado_por_clinica: currentRole === 'clinica',
    });
    await refreshAppData();
    showToast('Consulta salva na agenda.');
  } catch (error) {
    authError(error);
  }
}

async function removeReminder(cod) {
  if (!window.confirm('Excluir esta consulta/lembrete?')) return;
  try {
    await ItapetDB.deleteReminder(cod);
    await refreshAppData();
    showToast('Consulta removida.');
  } catch (error) {
    authError(error);
  }
}

function renderHistory() {
  const pet = petsData.find(item => String(item.cod) === String(activePetId)) || petsData[0];
  if (!pet) return;
  activePetId = pet.cod;
  const title = document.querySelector('#view-prontuario .profile-info h2');
  const subtitle = document.querySelector('#view-prontuario .profile-info p');
  if (title) title.textContent = pet.nome;
  if (subtitle) subtitle.textContent = [pet.raca, pet.sexo, pet.nascimento && formatDate(pet.nascimento)].filter(Boolean).join(' · ');
  const chips = document.getElementById('pet-profile-chips');
  if (chips) chips.innerHTML = [
    pet.codigo && `🔖 ${escapeHtml(pet.codigo)}`,
    pet.microchip && `Microchip: ${escapeHtml(pet.microchip)}`,
    currentRole === 'tutor' && `👤 Tutor: ${escapeHtml(currentProfile.nome || '')}`,
  ].filter(Boolean).map(text => `<span class="profile-chip">${text}</span>`).join('');
  const timeline = document.querySelector('#view-prontuario .timeline');
  if (!timeline) return;
  const records = historyData.filter(item => item.cod_pet === pet.cod && item.tipo !== 'documento');
  timeline.innerHTML = records.map(item => `<div class="timeline-item"><div class="timeline-dot">📋</div><div class="timeline-content"><div class="timeline-date">${formatDate(item.data)} · ${escapeHtml(item.tipo || '')}</div><div class="timeline-title">${escapeHtml(item.diagnostico_motivo || item.tipo || 'Registro')}</div><div class="timeline-desc">${escapeHtml([item.sintomas, item.tratamento, item.nome_clinica && `Clínica: ${item.nome_clinica}`].filter(Boolean).join(' · '))}</div><button class="btn-sm btn-outline" onclick="removeHistory('${item.cod}')">Excluir</button></div></div>`).join('') || '<p class="text-sm text-mid">Nenhum registro clínico.</p>';
  const diagnoses = document.getElementById('diagnostic-list');
  if (diagnoses) diagnoses.innerHTML = records.filter(item => ['consulta', 'diagnostico'].includes((item.tipo || '').toLowerCase())).map(item => `<div class="vaccine-item"><div class="vax-icon">🩺</div><div class="vax-info"><div class="vax-name">${escapeHtml(item.diagnostico_motivo || item.tipo)}</div><div class="vax-date">${formatDate(item.data)}</div></div></div>`).join('') || '<p class="text-sm text-mid">Nenhum diagnóstico registrado.</p>';
  const procedures = document.getElementById('procedure-list');
  if (procedures) procedures.innerHTML = records.filter(item => ['exame', 'procedimento', 'tratamento'].includes((item.tipo || '').toLowerCase())).map(item => `<div class="vaccine-item"><div class="vax-icon">${item.tipo === 'tratamento' ? '🩹' : '🔬'}</div><div class="vax-info"><div class="vax-name">${escapeHtml(item.diagnostico_motivo || item.tipo)}</div><div class="vax-date">${formatDate(item.data)} · ${escapeHtml(item.tipo)}</div></div></div>`).join('') || '<p class="text-sm text-mid">Nenhum procedimento ou tratamento registrado.</p>';
}

function renderVaccines() {
  const list = document.getElementById('vaccine-list');
  if (!list) return;
  const filter = document.getElementById('vaccine-filter');
  const petId = filter ? Number(filter.value) || null : activePetId;
  const pet = petsData.find(item => item.cod === petId);
  const title = document.getElementById('vaccine-title');
  if (title) title.textContent = `Carteira de Vacinação${pet ? ` — ${pet.nome}` : ''}`;
  const records = historyData.filter(item => item.tipo === 'vacina' && (!petId || item.cod_pet === petId));
  list.innerHTML = records.map(item => `<div class="vaccine-item"><div class="vax-icon">💉</div><div class="vax-info"><div class="vax-name">${escapeHtml(item.diagnostico_motivo)}</div><div class="vax-date">Aplicada: ${formatDate(item.data)} · ${escapeHtml(item.tratamento || '')}</div></div><button class="btn-sm btn-outline" onclick="removeHistory('${item.cod}')">Excluir</button></div>`).join('') || '<p class="text-sm text-mid">Nenhuma vacina registrada.</p>';
}

function selectVaccinePet() {
  renderVaccines();
}

function renderMedications() {
  const list = document.getElementById('medication-list');
  if (!list) return;
  list.innerHTML = historyData.filter(item => item.tipo === 'medicamento').map(item => `<div class="prescription-card"><div class="rx-name">${escapeHtml(item.diagnostico_motivo)}</div><div class="rx-dose">${escapeHtml(item.sintomas || '')}</div><div class="rx-schedule"><span class="rx-pill">${formatDate(item.data)}</span></div><button class="btn-sm btn-outline" onclick="removeHistory('${item.cod}')">Excluir</button></div>`).join('') || '<p class="text-sm text-mid">Nenhuma medicação registrada.</p>';
}

function renderDocuments() {
  const list = document.getElementById('document-list');
  if (!list) return;
  const count = document.getElementById('document-count');
  if (count) count.textContent = `${documentData.length} arquivo(s)`;
  list.innerHTML = documentData.map(doc => `<div class="file-item"><div class="file-icon">📄</div><div class="file-info"><div class="file-name">${escapeHtml(doc.documento.split('/').pop())}</div><div class="file-meta">${formatDate(doc.data)}</div></div>${doc.signedUrl ? `<a class="btn-sm btn-outline" href="${escapeHtml(doc.signedUrl)}" target="_blank" rel="noopener">Ver</a>` : ''}<button class="btn-sm btn-outline" onclick="removeDocument('${doc.cod}')">Excluir</button></div>`).join('') || '<p class="text-sm text-mid">Nenhum documento enviado.</p>';
}

function renderLoadedView(name) {
  if (!currentProfile) return;
  if (name === 'dashboard') renderDashboard();
  if (name === 'pets') renderPets();
  if (name === 'prontuario') renderHistory();
  if (name === 'vacinas') renderVaccines();
  if (name === 'consultas') renderAppointments();
  if (name === 'exames') { renderDocuments(); setupDropArea(); }
  if (name === 'medicamentos') renderMedications();
  if (name === 'relatorios') { renderWeightChart(); renderReports(); }
  if (name === 'clinica-vets') renderVeterinarians();
  if (name === 'clinica-perfil') renderClinicProfile();
  fillPetSelectors();
}

function renderWeightChart() {
  const container = document.getElementById('weight-chart');
  if (!container) return;
  const records = weightData.filter(item => !activePetId || item.pet_cod === activePetId);
  if (!records.length) {
    container.innerHTML = '<p class="text-sm text-mid">Sem registros de peso.</p>';
    return;
  }
  const maxVal = Math.max(...records.map(item => Number(item.peso)));
  container.innerHTML = records.slice(-12).map(item => {
    const value = Number(item.peso);
    const height = Math.max(4, Math.round((value / maxVal) * 100));
    return `<div class="bar-group"><div class="bar-value">${value} kg</div><div class="bar" style="height:${height}%;background:linear-gradient(to top,var(--green-dark),var(--green-light))"></div><div class="bar-label">${formatDate(item.data).slice(0, 5)}</div></div>`;
  }).join('');
}

function selectReportPet() {
  activePetId = Number(document.getElementById('report-pet').value) || null;
  renderWeightChart();
  renderReports();
  renderHistory();
}

function renderReports() {
  const pet = petsData.find(item => String(item.cod) === String(activePetId)) || petsData[0];
  if (!pet) return;
  activePetId = pet.cod;
  const selector = document.getElementById('report-pet');
  if (selector) selector.value = String(pet.cod);
  const name = document.getElementById('report-pet-name');
  const weightTitle = document.getElementById('report-weight-title');
  if (name) name.textContent = `Resumo clínico de ${pet.nome}`;
  if (weightTitle) weightTitle.textContent = `Evolução de Peso — ${pet.nome}`;
  const consultations = historyData.filter(item => item.cod_pet === pet.cod && item.tipo === 'consulta');
  const counts = {};
  consultations.forEach(item => {
    const year = String(item.data || '').slice(0, 4);
    if (year) counts[year] = (counts[year] || 0) + 1;
  });
  const years = Object.keys(counts).sort().reverse().slice(0, 3);
  const maxCount = Math.max(1, ...years.map(year => counts[year]));
  const frequency = document.getElementById('report-frequency');
  if (frequency) frequency.innerHTML = years.map((year, index) => `<div style="display:flex;align-items:center;gap:12px"><span style="font-size:13px;min-width:70px;color:var(--text-mid)">${year}</span><div style="flex:1;height:20px;background:var(--border);border-radius:10px;overflow:hidden"><div style="height:100%;width:${Math.round(counts[year] / maxCount * 100)}%;background:${index === 0 ? 'var(--green-mid)' : 'var(--sky)'};border-radius:10px"></div></div><span style="font-size:12px;font-weight:600">${counts[year]}</span></div>`).join('') || '<p class="text-sm text-mid">Sem consultas registradas.</p>';
  const weights = weightData.filter(item => item.pet_cod === pet.cod);
  const lastWeight = weights.length ? `${weights[weights.length - 1].peso} kg (${formatDate(weights[weights.length - 1].data)})` : 'Sem registros';
  const insights = document.getElementById('report-insights');
  if (insights) insights.innerHTML = [
    ['📋', 'Consultas', String(consultations.length)],
    ['💉', 'Vacinas', String(historyData.filter(item => item.cod_pet === pet.cod && item.tipo === 'vacina').length)],
    ['⚖️', 'Último peso', lastWeight],
  ].map(([icon, label, value]) => `<div style="background:var(--surface);border-radius:var(--radius-sm);padding:16px;border:1px solid var(--border);text-align:center"><div style="font-size:28px;margin-bottom:6px">${icon}</div><div style="font-size:13px;font-weight:500;color:var(--green-dark)">${label}</div><div style="font-size:16px;margin-top:4px">${escapeHtml(value)}</div></div>`).join('');
}

function renderVeterinarians() {
  const list = document.getElementById('veterinarian-list');
  if (!list) return;
  list.innerHTML = veterinarianData.map(vet => `<div class="file-item"><div class="file-icon">🩺</div><div class="file-info"><div class="file-name">${escapeHtml(vet.nome)}</div><div class="file-meta">${escapeHtml(vet.crmv)} · ${escapeHtml(vet.especialidade || '')}</div></div></div>`).join('') || '<p class="text-sm text-mid">Nenhum veterinário cadastrado.</p>';
}

function renderClinicProfile() {
  if (currentRole !== 'clinica') return;
  [['clinic-name', 'nome'], ['clinic-cnpj', 'cnpj'], ['clinic-phone', 'telefone'], ['clinic-email', 'email'], ['clinic-address', 'endereco'], ['clinic-cep', 'cep']].forEach(([id, field]) => {
    const input = document.getElementById(id);
    if (input && document.activeElement !== input) input.value = currentProfile[field] || '';
  });
}

async function saveClinicProfile() {
  try {
    currentProfile = await ItapetDB.updateClinic(currentProfile.cod, {
      nome: document.getElementById('clinic-name').value.trim(),
      cnpj: document.getElementById('clinic-cnpj').value.trim() || null,
      telefone: document.getElementById('clinic-phone').value.trim() || null,
      endereco: document.getElementById('clinic-address').value.trim() || null,
      cep: document.getElementById('clinic-cep').value.trim() || null,
    });
    currentProfile.role = 'clinica';
    await refreshAppData();
    showToast('Dados da clínica atualizados.');
  } catch (error) {
    authError(error);
  }
}

async function saveVet() {
  const name = document.getElementById('vet-name').value.trim();
  const crmv = document.getElementById('vet-crmv').value.trim();
  const email = document.getElementById('vet-email').value.trim();
  if (!name || !crmv || !email) { showToast('Informe nome, CRMV e e-mail do veterinário.'); return; }
  try {
    await ItapetDB.saveVeterinarian({
      cod_clinica: currentProfile.cod,
      nome: name,
      crmv,
      email,
      especialidade: document.getElementById('vet-specialty').value.trim() || null,
    });
    closeModal('modal-vet');
    ['vet-name', 'vet-crmv', 'vet-email', 'vet-specialty'].forEach(id => { document.getElementById(id).value = ''; });
    await refreshAppData();
    showToast('Veterinário cadastrado.');
  } catch (error) {
    authError(error);
  }
}

async function saveVaccine() {
  const petId = Number(document.getElementById('vaccine-pet').value);
  const name = document.getElementById('vaccine-name').value.trim();
  const date = document.getElementById('vaccine-date').value;
  if (!petId || !name || !date) { showToast('Selecione o pet e informe vacina e data.'); return; }
  const nextDate = document.getElementById('vaccine-next-date').value;
  const details = [
    nextDate ? `Reforço: ${nextDate}` : '',
    document.getElementById('vaccine-vet').value.trim(),
    document.getElementById('vaccine-lot').value.trim() ? `Lote: ${document.getElementById('vaccine-lot').value.trim()}` : '',
  ].filter(Boolean).join(' · ');
  try {
    await ItapetDB.insertHistory({
      cod_pet: petId,
      tipo: 'vacina',
      diagnostico_motivo: name,
      sintomas: document.getElementById('vaccine-notes').value.trim() || null,
      tratamento: details || null,
      data: date,
    });
    if (nextDate) {
      await ItapetDB.insertReminder({
        cod_pet: petId,
        titulo: `Reforço da vacina: ${name}`,
        tipo: 'vacina',
        detalhe: document.getElementById('vaccine-vet').value.trim() || null,
        data: nextDate,
        agendado_por_clinica: currentRole === 'clinica',
      });
    }
    closeModal('modal-vaccine');
    await refreshAppData();
    showToast('Vacina registrada no prontuário.');
  } catch (error) {
    authError(error);
  }
}

async function saveConsulta() {
  const petId = Number(document.getElementById('consulta-pet').value);
  const reason = document.getElementById('consulta-reason').value.trim();
  const date = document.getElementById('consulta-date').value;
  const weight = Number(document.getElementById('consulta-weight').value);
  if (!petId || !reason || !date) { showToast('Selecione o pet, informe o motivo e a data.'); return; }
  const type = document.getElementById('consulta-type').value;
  try {
    const clinicName = currentRole === 'clinica'
      ? await ItapetDB.getClinicName(currentUser.id)
      : document.getElementById('consulta-clinic').value.trim();
    const details = [
      document.getElementById('consulta-vet').value.trim(),
    ].filter(Boolean).join(' · ');
    await ItapetDB.insertHistory({
      cod_pet: petId,
      tipo: type,
      diagnostico_motivo: reason,
      sintomas: document.getElementById('consulta-symptoms').value.trim() || null,
      tratamento: [document.getElementById('consulta-treatment').value.trim(), details].filter(Boolean).join(' · ') || null,
      nome_clinica: clinicName || null,
      peso: weight > 0 ? weight : null,
      data: date,
    });
    if (weight > 0) await ItapetDB.insertWeight({ pet_cod: petId, peso: weight, data: date });
    closeModal('modal-consulta');
    await refreshAppData();
    showToast(`${type.charAt(0).toUpperCase()}${type.slice(1)} registrado no prontuário.`);
  } catch (error) {
    authError(error);
  }
}

async function saveMedication() {
  const petId = Number(document.getElementById('medication-pet').value);
  const name = document.getElementById('medication-name').value.trim();
  const date = document.getElementById('medication-date').value || localDateISO(new Date());
  if (!petId || !name) { showToast('Selecione o pet e informe o medicamento.'); return; }
  const details = [
    document.getElementById('medication-dose').value.trim(),
    document.getElementById('medication-frequency').value,
    document.getElementById('medication-duration').value ? `${document.getElementById('medication-duration').value} dias` : '',
    document.getElementById('medication-notes').value.trim(),
  ].filter(Boolean).join(' · ');
  try {
    await ItapetDB.insertHistory({ cod_pet: petId, tipo: 'medicamento', diagnostico_motivo: name, sintomas: details || null, data: date });
    await refreshAppData();
    showToast('Medicação registrada no prontuário.');
  } catch (error) {
    authError(error);
  }
}

async function removeHistory(cod) {
  if (!window.confirm('Excluir este registro clínico?')) return;
  try {
    await ItapetDB.deleteHistory(cod);
    await refreshAppData();
    showToast('Registro excluído.');
  } catch (error) {
    authError(error);
  }
}

// ===== UPLOAD =====
function triggerUpload() { document.getElementById('file-input').click(); }

function handleFileUpload(event) {
  const files = Array.from(event.target.files || []);
  if (files.length) showToast(`${files.length} arquivo(s) pronto(s) para envio.`);
}

async function uploadDocuments() {
  const files = Array.from(document.getElementById('file-input').files || []);
  const pet = petsData.find(item => String(item.cod) === document.getElementById('document-pet').value);
  if (!files.length || !pet) { showToast('Selecione um pet e pelo menos um arquivo.'); return; }
  if (files.some(file => file.size > 20 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type))) {
    showToast('Envie arquivos PDF, JPG ou PNG de até 20 MB.');
    return;
  }
  try {
    const type = document.getElementById('document-type').value;
    for (const file of files) await ItapetDB.uploadDocument(file, pet, currentProfile, currentRole, type);
    document.getElementById('file-input').value = '';
    await refreshAppData();
    showToast('Documento(s) enviado(s) com sucesso.');
  } catch (error) {
    authError(error);
  }
}

async function removeDocument(cod) {
  if (!window.confirm('Excluir este documento?')) return;
  const documentRecord = documentData.find(item => String(item.cod) === String(cod));
  if (!documentRecord) return;
  try {
    await ItapetDB.deleteDocument(documentRecord);
    await refreshAppData();
    showToast('Documento excluído.');
  } catch (error) {
    authError(error);
  }
}

function exportMyData() {
  if (!currentProfile) { showToast('Entre para exportar seus dados.'); return; }
  const contents = {
    profile: currentProfile,
    pets: petsData,
    history: historyData,
    appointments: reminderData,
    weights: weightData,
    exportedAt: new Date().toISOString(),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(contents, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'itapet-meus-dados.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function generateReportPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) { showToast('Não foi possível gerar o PDF.'); return; }
  const pet = petsData.find(item => String(item.cod) === String(activePetId)) || petsData[0];
  if (!pet) { showToast('Cadastre um pet antes de gerar o relatório.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const records = historyData.filter(item => item.cod_pet === pet.cod);
  const weights = weightData.filter(item => item.pet_cod === pet.cod);
  doc.setProperties({ title: `Relatório de saúde — ${pet.nome}`, subject: 'Resumo clínico Itapet', author: 'Itapet' });
  doc.setTextColor(27, 67, 50);
  doc.setFontSize(22);
  doc.text('Itapet', 20, 24);
  doc.setFontSize(16);
  doc.text(`Relatório de saúde — ${pet.nome}`, 20, 36);
  doc.setDrawColor(64, 145, 108);
  doc.line(20, 42, 190, 42);
  doc.setTextColor(26, 46, 34);
  doc.setFontSize(12);
  const rows = [
    ['Pet', [pet.especie, pet.raca].filter(Boolean).join(' — ')],
    ['Responsável', currentProfile.nome || currentUser.email],
    ['Peso atual', weights.length ? `${weights[weights.length - 1].peso} kg` : 'Sem registros'],
    ['Registros clínicos', String(records.length)],
  ];
  let y = 56;
  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value || '—').slice(0, 60), 62, y);
    y += 12;
  });
  records.slice(0, 10).forEach(item => {
    doc.text(`${formatDate(item.data)} · ${item.tipo}: ${(item.diagnostico_motivo || '').slice(0, 65)}`, 20, y);
    y += 9;
  });
  doc.setFontSize(9);
  doc.setTextColor(100, 110, 105);
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')} pelo Itapet`, 20, 280);
  doc.save(`relatorio-saude-${pet.nome.replace(/[^\w-]/g, '-')}.pdf`);
}

function setupDropArea() {
  const dropArea = document.getElementById('drop-area');
  if (!dropArea || dropArea.dataset.dropReady) return;
  dropArea.dataset.dropReady = 'true';
  dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.style.borderColor = 'var(--green-light)'; dropArea.style.background = 'var(--green-pale)'; });
  dropArea.addEventListener('dragleave', () => { dropArea.style.borderColor = ''; dropArea.style.background = ''; });
  dropArea.addEventListener('drop', e => {
    e.preventDefault();
    dropArea.style.borderColor = ''; dropArea.style.background = '';
    const input = document.getElementById('file-input');
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      handleFileUpload({ target: input });
    }
  });
}

// ===== TOAST =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateY(0)';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
  }, 3000);
}
