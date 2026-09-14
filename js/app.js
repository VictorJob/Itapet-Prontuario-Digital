// ===== AUTH =====
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
}

function selectRole(el) {
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
}

// ===== POPUP NOTIFICATION SYSTEM =====
const POPUP_NOTIFS = {
  tutor: [
    { type:'alert', icon:'💉', bg:'var(--coral-light)', title:'Vacina vencida — Luna', desc:'V10 Polivalente venceu há 7 dias. Agende agora!', delay:800 },
    { type:'warn',  icon:'📅', bg:'var(--amber-light)', title:'Consulta amanhã — Thor', desc:'Dr. Pedro Alves · ClínicaPet · 14:00h', delay:2400 },
    { type:'ok',    icon:'💊', bg:'var(--green-pale)',  title:'Lembrete de medicamento', desc:'Vermífugo do Thor — hoje às 20:00h', delay:4000 },
  ],
  clinica: [
    { type:'alert', icon:'📋', bg:'var(--coral-light)', title:'Nova solicitação de reserva', desc:'Maria Silva — Thor — 25/abr às 14h', delay:800 },
    { type:'warn',  icon:'🩺', bg:'var(--amber-light)', title:'Veterinário pendente de aprovação', desc:'Dr. Carlos Menezes — CRMV-SP 54321', delay:2400 },
    { type:'ok',    icon:'✅', bg:'var(--green-pale)',  title:'Agenda do dia confirmada', desc:'5 consultas agendadas para hoje', delay:4000 },
    { type:'warn',  icon:'💉', bg:'var(--amber-light)', title:'Paciente com vacina vencida', desc:'Luna (SRD) — V10 vencida há 7 dias', delay:7200 },
  ],
};

let notifCount = 0;

function showPopup(notif) {
  const stack = document.getElementById('popup-notif-stack');
  const id = 'pn-' + (++notifCount);
  const duration = 6000;

  const el = document.createElement('div');
  el.id = id;
  el.className = `popup-notif type-${notif.type}`;
  el.innerHTML = `
    <div class="popup-notif-icon" style="background:${notif.bg}">${notif.icon}</div>
    <div class="popup-notif-body">
      <div class="popup-notif-title">${notif.title}</div>
      <div class="popup-notif-desc">${notif.desc}</div>
    </div>
    <button class="popup-notif-close" onclick="dismissPopup('${id}')">✕</button>
    <div class="popup-notif-progress" style="animation-duration:${duration}ms"></div>
  `;
  stack.appendChild(el);

  setTimeout(() => dismissPopup(id), duration);
}

function dismissPopup(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hiding');
  setTimeout(() => el.remove(), 320);
}

function fireNotifications(role) {
  const list = POPUP_NOTIFS[role] || POPUP_NOTIFS.tutor;
  list.forEach(n => setTimeout(() => showPopup(n), n.delay));
  // refresh notif-dot
  document.querySelectorAll('.notif-dot').forEach(d => d.style.display = 'block');
}

let currentRole = 'tutor';

const ROLE_MENUS = {
  tutor: [
    { section: 'Principal' },
    { id:'dashboard', icon:'🏠', label:'Dashboard' },
    { id:'pets', icon:'🐶', label:'Meus Pets' },
    { id:'prontuario', icon:'📋', label:'Prontuário' },
    { id:'vacinas', icon:'💉', label:'Vacinas', badge:'2' },
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
    { id:'clinica-vets', icon:'🩺', label:'Veterinários', badge:'2' },
    { section: 'Operação' },
    { id:'consultas', icon:'📅', label:'Agenda & Reservas' },
    { id:'pets', icon:'🐶', label:'Pacientes' },
    { id:'prontuario', icon:'📋', label:'Prontuário' },
    { id:'vacinas', icon:'💉', label:'Vacinas', badge:'1' },
    { id:'exames', icon:'🧪', label:'Exames' },
    { id:'medicamentos', icon:'💊', label:'Prescrições' },
    { section: 'Gestão' },
    { id:'relatorios', icon:'📊', label:'Relatórios' },
    { id:'planos', icon:'💰', label:'Planos' },
    { id:'seguranca', icon:'🔐', label:'Segurança' },
  ],
};

const ROLE_PROFILE = {
  tutor:   { name:'Maria Silva',     role:'Tutora',       avatar:'M', bg:'' },
  clinica: { name:'ClínicaPet Centro', role:'Clínica Veterinária', avatar:'🏥', bg:'linear-gradient(135deg,#7B5EA7,#E07A5F)' },
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

function enterApp(role) {
  currentRole = role || 'tutor';
  document.body.classList.toggle('role-tutor', currentRole === 'tutor');
  document.body.classList.toggle('role-clinica', currentRole === 'clinica');
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  const prof = ROLE_PROFILE[currentRole] || ROLE_PROFILE.tutor;
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
  buildWeightChart();
  // fire popup notifications after short delay
  setTimeout(() => fireNotifications(currentRole), 600);
}

function openVetModal() { document.getElementById('modal-vet').classList.add('open'); }
function saveVet() { closeModal('modal-vet'); showToast('Veterinário cadastrado! 🩺'); }

function logout() {
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
    prontuario: ['Prontuário Digital', 'Histórico clínico completo — Thor'],
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

function showPetProfile(name) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  showView('prontuario', null);
  showToast(`Abrindo prontuário de ${name} 🐾`);
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
function openAddPetModal() { document.getElementById('modal-add-pet').classList.add('open'); }
function openVaccineModal() { document.getElementById('modal-vaccine').classList.add('open'); }
function openConsultaModal() { document.getElementById('modal-consulta').classList.add('open'); }
function openNotifModal() { document.getElementById('modal-notif').classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

const petEmojis = ['🐕','🐩','🐈','🐱','🐰','🐹','🦜','🐾','🐇','🦮'];
let emojiIdx = 0;
let pendingPetPhoto = '';
function changePetEmoji(el) {
  emojiIdx = (emojiIdx + 1) % petEmojis.length;
  el.textContent = petEmojis[emojiIdx];
}

function previewPetPhoto(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Selecione uma imagem válida ⚠️'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    pendingPetPhoto = String(reader.result || '');
    const image = document.getElementById('pet-photo-image');
    const emoji = document.getElementById('pet-emoji');
    if (image && emoji) {
      image.src = pendingPetPhoto;
      image.style.display = 'block';
      emoji.style.display = 'none';
    }
  };
  reader.readAsDataURL(file);
}

// ===== PETS REGISTRY =====
const PETS_KEY = 'itapet:pets';
function loadPets() {
  try { return JSON.parse(localStorage.getItem(PETS_KEY)) || {}; }
  catch(e) { return {}; }
}
function savePetsRegistry(pets) {
  localStorage.setItem(PETS_KEY, JSON.stringify(pets));
}
function normalizeCode(c) { return (c || '').trim().toUpperCase(); }

function generatePetCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PET-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random()*chars.length)];
  code += '-';
  for (let i = 0; i < 2; i++) code += chars[Math.floor(Math.random()*chars.length)];
  const pets = loadPets();
  if (pets[code]) return generatePetCode();
  document.getElementById('pet-code').value = code;
  checkPetCode();
}

function checkPetCode() {
  const codeInput = document.getElementById('pet-code');
  const hint = document.getElementById('pet-code-hint');
  const btn = document.getElementById('pet-save-btn');
  const code = normalizeCode(codeInput.value);
  codeInput.value = code;
  const pets = loadPets();
  if (code && pets[code]) {
    hint.textContent = `⚠ Código já existe (${pets[code].name}). Os dados serão atualizados (recadastro).`;
    hint.style.color = 'var(--amber)';
    btn.textContent = 'Recadastrar pet ♻️';
  } else {
    hint.textContent = 'Informe um código único. Se já existir, o pet será recadastrado.';
    hint.style.color = 'var(--text-light)';
    btn.textContent = 'Cadastrar pet 🐾';
  }
}

function savePet() {
  const code = normalizeCode(document.getElementById('pet-code').value);
  const name = document.getElementById('pet-name').value.trim();
  const ownerName = document.getElementById('pet-owner-name').value.trim();
  const ownerPhone = document.getElementById('pet-owner-phone').value.trim();
  if (!name) { showToast('Informe o nome do pet ⚠️'); return; }
  if (!code) { showToast('Informe ou gere um código ⚠️'); return; }
  if (!ownerName || !ownerPhone) { showToast('Informe o nome e o telefone do responsável ⚠️'); return; }

  const pets = loadPets();
  const exists = !!pets[code];
  pets[code] = {
    code,
    name,
    emoji: document.getElementById('pet-emoji').textContent,
    species: document.getElementById('pet-species').value,
    breed: document.getElementById('pet-breed').value,
    sex: document.getElementById('pet-sex').value,
    birth: document.getElementById('pet-birth').value,
    weight: document.getElementById('pet-weight').value,
    microchip: document.getElementById('pet-microchip').value,
    ownerName,
    ownerPhone,
    photo: pendingPetPhoto || (exists ? pets[code].photo : ''),
    cadastrado: document.getElementById('pet-cadastrado').checked,
    updatedAt: new Date().toISOString(),
    createdAt: exists ? pets[code].createdAt : new Date().toISOString(),
  };
  savePetsRegistry(pets);
  closeModal('modal-add-pet');
  showToast(exists ? `Pet recadastrado! ♻️ (${code})` : `Pet cadastrado! 🐾 (${code})`);
  renderSavedPets();

  // reset form
  ['pet-name','pet-breed','pet-birth','pet-weight','pet-microchip','pet-code','pet-owner-name','pet-owner-phone','pet-photo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('pet-cadastrado').checked = true;
  pendingPetPhoto = '';
  const photoImage = document.getElementById('pet-photo-image');
  const petEmoji = document.getElementById('pet-emoji');
  if (photoImage && petEmoji) { photoImage.removeAttribute('src'); photoImage.style.display = 'none'; petEmoji.style.display = ''; }
  checkPetCode();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
}

function renderSavedPets() {
  const container = document.getElementById('registered-pets');
  if (!container) return;
  const pets = Object.values(loadPets());
  container.innerHTML = pets.map(pet => {
    const avatar = pet.photo
      ? `<div class="pet-avatar has-photo" style="width:80px;height:80px"><img src="${escapeHtml(pet.photo)}" alt="Foto de ${escapeHtml(pet.name)}"><div class="status-dot ok"></div></div>`
      : `<div class="pet-avatar" style="background:var(--green-pale);width:80px;height:80px;font-size:40px">${escapeHtml(pet.emoji)}<div class="status-dot ok"></div></div>`;
    const safePetName = encodeURIComponent(String(pet.name || '')).replace(/'/g, '%27');
    return `<div class="pet-card" onclick="showPetProfile(decodeURIComponent('${safePetName}'))" style="padding:28px 20px">
      ${avatar}
      <div class="pet-name" style="font-size:20px;margin-top:4px">${escapeHtml(pet.name)}</div>
      <div class="pet-breed">${escapeHtml(pet.breed || pet.species)}</div>
      <div style="font-size:12px;color:var(--text-light);margin:6px 0 10px">${escapeHtml(pet.sex)}${pet.weight ? ` · ${escapeHtml(pet.weight)}kg` : ''}</div>
      <div class="pet-tags"><span class="tag tag-green">Cadastrado</span></div>
      <div class="pet-owner"><strong>Responsável:</strong> ${escapeHtml(pet.ownerName)}<br>${escapeHtml(pet.ownerPhone)}</div>
    </div>`;
  }).join('');
}

function generateReportPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) { showToast('Não foi possível gerar o PDF 😕'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setProperties({ title: 'Relatório de saúde — Thor', subject: 'Resumo clínico Itapet', author: 'Itapet' });
  doc.setTextColor(27, 67, 50);
  doc.setFontSize(22);
  doc.text('Itapet', 20, 24);
  doc.setFontSize(16);
  doc.text('Relatório de saúde — Thor', 20, 36);
  doc.setDrawColor(64, 145, 108);
  doc.line(20, 42, 190, 42);
  doc.setTextColor(26, 46, 34);
  doc.setFontSize(12);
  const rows = [
    ['Pet', 'Thor — Golden Retriever, 3 anos'],
    ['Responsável', 'Maria Silva'],
    ['Saúde geral', 'Boa'],
    ['Peso atual', '28 kg — estável'],
    ['Consultas', '3 consultas em 2025'],
    ['Atenção', 'Otite recorrente: 2 ocorrências em 12 meses'],
    ['Próxima consulta', '25/04 às 14:00 — Dr. Pedro Alves'],
  ];
  let y = 56;
  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 62, y);
    y += 12;
  });
  doc.setFontSize(9);
  doc.setTextColor(100, 110, 105);
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')} pelo Itapet`, 20, 280);
  doc.save('relatorio-saude-thor.pdf');
  showToast('Relatório PDF gerado! 📄');
}

function saveVaccine() {
  closeModal('modal-vaccine');
  showToast('Vacina registrada! 💉');
}

function saveConsulta() {
  closeModal('modal-consulta');
  showToast('Consulta registrada no prontuário! 📋');
}

// ===== UPLOAD =====
function triggerUpload() { document.getElementById('file-input').click(); }

function handleFileUpload(e) {
  const files = Array.from(e.target.files);
  if (files.length > 0) {
    showToast(`${files.length} arquivo(s) selecionado(s) 📎`);
  }
}

const dropArea = document.getElementById('drop-area');
if (dropArea) {
  dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.style.borderColor = 'var(--green-light)'; dropArea.style.background = 'var(--green-pale)'; });
  dropArea.addEventListener('dragleave', () => { dropArea.style.borderColor = ''; dropArea.style.background = ''; });
  dropArea.addEventListener('drop', e => {
    e.preventDefault();
    dropArea.style.borderColor = ''; dropArea.style.background = '';
    showToast(`${e.dataTransfer.files.length} arquivo(s) recebido(s) 📂`);
  });
}

// ===== WEIGHT CHART =====
function buildWeightChart() {
  const container = document.getElementById('weight-chart');
  if (!container) return;
  const data = [
    { month: 'Jan', val: 26 }, { month: 'Fev', val: 26.5 },
    { month: 'Mar', val: 27 }, { month: 'Abr', val: 27.2 },
    { month: 'Mai', val: 27.8 }, { month: 'Jun', val: 28 },
    { month: 'Jul', val: 28 }, { month: 'Ago', val: 28.2 },
    { month: 'Set', val: 27.9 }, { month: 'Out', val: 28 },
    { month: 'Nov', val: 28.1 }, { month: 'Dez', val: 28 }
  ];
  const maxVal = Math.max(...data.map(d => d.val));
  container.innerHTML = data.map(d => {
    const h = Math.round((d.val / maxVal) * 100);
    return `<div class="bar-group">
      <div class="bar-value">${d.val}</div>
      <div class="bar" style="height:${h}%;background:linear-gradient(to top,var(--green-dark),var(--green-light))"></div>
      <div class="bar-label">${d.month}</div>
    </div>`;
  }).join('');
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

// Init
window.addEventListener('load', buildWeightChart);
