// ===== DYNAMIC PAGE ROUTER =====
// Loads each view's markup on demand from pages/<name>.html and caches it,
// then delegates to the original showView() defined in app.js.

const _pageCache = {};
const _contentEl = document.querySelector('.content');

async function loadPage(name) {
  if (_pageCache[name]) return;
  if (document.getElementById('view-' + name)) { _pageCache[name] = true; return; }
  const res = await fetch('pages/' + name + '.html');
  if (!res.ok) throw new Error('Página não encontrada: ' + name);
  const html = await res.text();
  _contentEl.insertAdjacentHTML('beforeend', html);
  _pageCache[name] = true;
  // Re-apply role visibility to the freshly injected markup
  if (typeof applyRoleVisibility === 'function' && typeof currentRole !== 'undefined') {
    applyRoleVisibility();
  }
  // Dashboard chart needs its canvas to exist
  if (name === 'dashboard' && typeof buildWeightChart === 'function') {
    buildWeightChart();
  }
}

const _activateView = showView;

showView = function (name, navEl) {
  if (document.getElementById('view-' + name)) {
    _activateView(name, navEl);
    return;
  }
  loadPage(name)
    .then(() => _activateView(name, navEl))
    .catch((err) => {
      console.error(err);
      if (typeof showToast === 'function') showToast('Não foi possível abrir esta página 😕');
    });
};

// Preload the dashboard so it's ready right after login
loadPage('dashboard').catch(console.error);
