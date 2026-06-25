const $ = (id) => document.getElementById(id);
let KEY = '';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isTest = (email) => /@testmail\.com$/i.test(email || '');
const safeName = (s) => String(s).replace(/[^a-z0-9._-]+/gi, '_');

async function unlock() {
  KEY = $('pass').value;
  $('login-msg').textContent = '';
  let res;
  try {
    res = await fetch('/progress/data', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: KEY }),
    });
  } catch (e) { $('login-msg').textContent = 'Network error'; return; }
  if (res.status === 401) { $('login-msg').textContent = 'Incorrect'; return; }
  if (!res.ok) { $('login-msg').textContent = 'Error'; return; }
  const { annotators, modelWins } = await res.json();
  $('login').classList.add('hidden');
  $('dash').classList.remove('hidden');
  renderChart(modelWins);
  render(annotators);
}

function renderChart(wins) {
  if (!wins || !wins.length) { $('chart').innerHTML = '<div class="empty">No picks yet.</div>'; return; }
  const max = Math.max(...wins.map((w) => w.count));
  $('chart').innerHTML = wins.map((w) => `
    <div class="crow">
      <div class="cmodel" title="${esc(w.model)}">${esc(w.model)}</div>
      <div class="ctrack"><div class="cfill" style="width:${max ? Math.round((w.count / max) * 100) : 0}%"></div></div>
      <div class="cval">${w.count}</div>
    </div>`).join('');
}

function render(list) {
  if (!list || !list.length) { $('rows').innerHTML = '<div class="empty">No annotators yet.</div>'; return; }
  $('rows').innerHTML = list.map((a) => `
    <div class="row">
      <div class="label">${esc(a.first_name)} ${esc(a.last_name)}
        <span class="email">${esc(a.email)}</span>${isTest(a.email) ? '<span class="tbadge">test</span>' : ''}</div>
      <div class="bar"><div class="fill" style="width:${Math.min(a.pct, 100)}%"></div></div>
      <div class="count">${a.count} / ${a.cap}</div>
      <button class="btn-mini" data-email="${esc(a.email)}">Export CSV</button>
    </div>`).join('');
  $('rows').querySelectorAll('.btn-mini').forEach((b) =>
    b.addEventListener('click', () => downloadCsv({ email: b.dataset.email }, `annotations-${safeName(b.dataset.email)}.csv`)));
}

async function downloadCsv(body, filename) {
  let res;
  try {
    res = await fetch('/progress/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: KEY, ...body }),
    });
  } catch (e) { alert('Export failed (network).'); return; }
  if (!res.ok) { alert('Export failed.'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

$('unlock').addEventListener('click', unlock);
$('pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
$('export-all').addEventListener('click', () => downloadCsv({}, 'annotations-all.csv'));
