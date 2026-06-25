const CONSENT_TEXT =
  "I agree to participate in this FAQ annotation task. I understand my full name and email are collected only to track my annotation progress, will be used solely for this task, and will not be shared. Participation is voluntary.";

const $ = (id) => document.getElementById(id);
const show = (id) => {
  for (const v of ['view-email', 'view-consent', 'view-annotate', 'view-done']) $(v).classList.toggle('hidden', v !== id);
};
const hasLink = (s) => /\[[^\]]*\]\([^)]*\)/.test(s || '');
const yesno = (intent) => intent === 'yes/no eligibility';
function mdLink(s) {
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return esc(s || '').replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
}

let annotatorId = localStorage.getItem('annotator_id');
let session = [];      // [{ item, answers, saved }]
let idx = -1;          // index into session
let completedCount = 0;

// ---------- session lifecycle ----------
function startAnnotating() {
  $('exit').classList.remove('hidden');
  loadFrontier();
}

function exitSession() {
  localStorage.removeItem('annotator_id');
  localStorage.removeItem('annotator_name');
  annotatorId = null; session = []; idx = -1; completedCount = 0;
  $('who').textContent = '';
  $('exit').classList.add('hidden');
  $('e-email').value = ''; $('e-status').textContent = '';
  show('view-email');
}
$('exit').addEventListener('click', exitSession);

// ---------- email entry (resume if known, else consent) ----------
async function onContinue() {
  const email = $('e-email').value.trim();
  if (!email) { $('e-status').textContent = 'Please enter your email.'; return; }
  $('e-status').textContent = 'Checking…';
  let res;
  try {
    res = await fetch('/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  } catch (e) { $('e-status').textContent = 'Network error.'; return; }
  if (!res.ok) { $('e-status').textContent = 'Error — try again.'; return; }
  const data = await res.json();
  if (data.exists) {
    annotatorId = String(data.id);
    localStorage.setItem('annotator_id', annotatorId);
    localStorage.setItem('annotator_name', `${data.first_name} ${data.last_name}`);
    session = []; idx = -1; completedCount = 0;
    startAnnotating();
  } else {
    $('c-email').value = email;
    $('c-first').value = ''; $('c-last').value = ''; $('c-agree').checked = false;
    $('c-status').textContent = '';
    refreshBtn();
    show('view-consent');
  }
}
$('e-btn').addEventListener('click', onContinue);
$('e-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') onContinue(); });

// ---------- consent (new users) ----------
$('consent-text').textContent = CONSENT_TEXT;
const refreshBtn = () => {
  $('c-btn').disabled = !($('c-first').value.trim() && $('c-last').value.trim() && $('c-agree').checked);
};
['c-first', 'c-last'].forEach((id) => $(id).addEventListener('input', refreshBtn));
$('c-agree').addEventListener('change', refreshBtn);
$('c-btn').addEventListener('click', async () => {
  $('c-status').textContent = 'Saving…';
  const res = await fetch('/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: $('c-first').value, last_name: $('c-last').value, email: $('c-email').value, agreed: $('c-agree').checked }),
  });
  if (!res.ok) { $('c-status').textContent = 'Could not save — check your details.'; return; }
  const { id } = await res.json();
  annotatorId = String(id);
  localStorage.setItem('annotator_id', annotatorId);
  localStorage.setItem('annotator_name', `${$('c-first').value} ${$('c-last').value}`);
  startAnnotating();
});

// ---------- annotate ----------
function cur() { return session[idx]; }

async function loadFrontier() {
  const res = await fetch('/next?annotator_id=' + encodeURIComponent(annotatorId));
  const data = await res.json();
  $('who').textContent = localStorage.getItem('annotator_name') || '';
  if (typeof data.completed === 'number') completedCount = data.completed;
  if (data.status === 'item') {
    session.push({ item: data.item, answers: {}, saved: false });
    idx = session.length - 1;
    show('view-annotate');
    render();
  } else {
    show('view-done');
  }
}

function render() {
  const { item, answers } = cur();
  // item card
  $('item-card').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:7px;">
        <span class="badge">${item.page_type || 'FAQ'}</span>
        <span class="badge green">Test pair to annotate</span>
      </div>
      <span style="font-size:12px;color:#a4a49c;font-weight:600;">#${item.id}</span>
    </div>
    <div class="q">${mdLink(item.question)}</div>
    <div class="ans">${mdLink(item.answer)}</div>
    <div class="chips">
      ${item.department ? `<div><div class="chip-l">Department</div><span class="chip">${item.department}</span></div>` : ''}
      ${item.persona ? `<div><div class="chip-l">Persona</div><span class="chip">${item.persona}</span></div>` : ''}
      ${item.intent ? `<div><div class="chip-l">Intent</div><span class="chip">${item.intent}</span></div>` : ''}
      ${item.url ? `<a class="link" href="${item.url}" target="_blank" rel="noopener">URL ↗</a>` : ''}
    </div>`;
  // options
  $('options').innerHTML = (item.options || []).map((o) =>
    `<label class="opt ${answers.bestIdx === o.idx ? 'sel' : ''}" data-idx="${o.idx}" style="margin-bottom:7px;">
       <span class="radio"><span class="dot"></span></span><span class="text">${mdLink(o.text)}</span>
     </label>`).join('');
  $('options').querySelectorAll('.opt').forEach((el) =>
    el.addEventListener('click', () => { cur().answers.bestIdx = Number(el.dataset.idx); render(); }));
  // seed card
  const s = item.seed;
  $('seed-card').innerHTML = s ? `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span class="badge">Source · ${s.page_type || 'FAQ'}</span><span style="font-size:12px;color:#a4a49c;font-weight:600;">#${s.id}</span>
    </div>
    <div class="q">${mdLink(s.question)}</div>
    <div class="ans">${mdLink(s.answer)}</div>
    <div class="chips">
      ${s.department ? `<div><div class="chip-l">Department</div><span class="chip">${s.department}</span></div>` : ''}
      ${s.url ? `<a class="link" href="${s.url}" target="_blank" rel="noopener">Source ↗</a>` : ''}
    </div>` : '<div class="ans">No linked source seed.</div>';
  renderMetrics();
  // pager + counter
  $('back').disabled = idx <= 0;
  $('next').disabled = idx >= session.length - 1;
  $('ct-done').textContent = completedCount;
  $('a-status').textContent = cur().saved ? '✓ saved — edit and Save to update' : '';
}

function metricBlock(key, title, help, opts) {
  const answers = cur().answers;
  const buttons = opts.map((o) =>
    `<button data-key="${key}" data-val="${o.val}" class="${answers[key] === o.val ? 'sel' : ''}" style="${answers[key] === o.val ? 'background:' + o.color + ';border-color:' + o.color : ''}">${o.label}</button>`
  ).join('');
  return `<div class="metric" style="margin-bottom:13px;"><span class="title">${title}</span><span class="help">${help}</span><div class="opts">${buttons}</div></div>`;
}

function renderMetrics() {
  const item = cur().item;
  const scaleOpts = (n) => Array.from({ length: n }, (_, i) => ({ val: i + 1, label: String(i + 1), color: '#2f6f8f' }));
  const yn = (invertGoodNo) => [
    { val: 1, label: 'Yes', color: invertGoodNo ? '#b3543f' : '#2f8f5b' },
    { val: 0, label: 'No', color: invertGoodNo ? '#2f8f5b' : '#b3543f' },
  ];
  let html = metricBlock('accuracy', 'Answer accuracy', 'Is the answer factually correct and complete? 1 = wrong · 5 = fully correct.', scaleOpts(5));
  html += metricBlock('source_relevance', 'Source relevance', 'Does the linked source support the answer? 1 = unrelated · 5 = directly backs it.', scaleOpts(5));
  if (hasLink(item.answer)) html += metricBlock('valid_link', 'Valid link', 'Is the link in the answer a valid, live GMU URL?', yn(false));
  if (yesno(item.intent)) {
    html += metricBlock('exact_matching', 'Exact matching', "Does the answer exactly match the question's intent?", yn(false));
    html += metricBlock('risk_of_harm', 'Risk of harm', 'Could acting on this response cause harm?', yn(true));
  }
  $('metrics').innerHTML = html;
  $('metrics').querySelectorAll('.opts button').forEach((b) =>
    b.addEventListener('click', () => { cur().answers[b.dataset.key] = Number(b.dataset.val); render(); }));
}

function requiredKeys(item) {
  const keys = ['accuracy', 'source_relevance'];
  if (hasLink(item.answer)) keys.push('valid_link');
  if (yesno(item.intent)) keys.push('exact_matching', 'risk_of_harm');
  return keys;
}

async function onSave() {
  const { item, answers } = cur();
  if (answers.bestIdx === undefined) { $('a-status').textContent = 'Pick the best option first.'; return; }
  for (const k of requiredKeys(item)) if (answers[k] === undefined) { $('a-status').textContent = 'Please answer all metrics.'; return; }
  const payload = { annotator_id: Number(annotatorId), item_id: item.id, best_option_idx: answers.bestIdx };
  for (const k of requiredKeys(item)) payload[k] = answers[k];
  $('save').disabled = true;
  const res = await fetch('/annotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  $('save').disabled = false;
  if (!res.ok) { $('a-status').textContent = 'Save failed — try again.'; return; }
  if (!cur().saved) { cur().saved = true; completedCount += 1; }
  // advance: forward to a loaded item, else fetch a new one from the pool
  if (idx < session.length - 1) { idx += 1; render(); }
  else loadFrontier();
}

$('save').addEventListener('click', onSave);
$('back').addEventListener('click', () => { if (idx > 0) { idx -= 1; render(); } });
$('next').addEventListener('click', () => { if (idx < session.length - 1) { idx += 1; render(); } });

// ---------- boot ----------
if (annotatorId) startAnnotating(); else show('view-email');
