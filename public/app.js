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

  // FAQ question card : question + metadata (no answer)
  const pill = (label, val) => `<span class="pill"><span class="pill-l">${label} ·</span> ${val}</span>`;
  $('item-card').innerHTML = `
    <div class="qhead">
      <span class="qbadge">Question</span>
      <span class="qid">#${item.id}</span>
    </div>
    <div class="qtext">${mdLink(item.question)}</div>
    <div class="qchips">
      ${item.department ? pill('Dept', item.department) : ''}
      ${item.persona ? pill('Persona', item.persona) : ''}
      ${item.intent ? pill('Intent', item.intent) : ''}
      ${item.url ? `<a class="qurl" href="${item.url}" target="_blank" rel="noopener">URL ↗</a>` : ''}
    </div>`;

  // the answer being annotated, shown in the annotation panel
  $('answer-quote').innerHTML = mdLink(item.answer);

  // candidate options (blind, shuffled)
  $('options').innerHTML = (item.options || []).map((o) =>
    `<label class="opt ${answers.bestIdx === o.idx ? 'sel' : ''}" data-idx="${o.idx}">
       <span class="radio"><span class="dot"></span></span><span class="text">${mdLink(o.text)}</span>
     </label>`).join('');
  $('options').querySelectorAll('.opt').forEach((el) =>
    el.addEventListener('click', () => { cur().answers.bestIdx = Number(el.dataset.idx); render(); }));

  renderMetrics();

  // Back: only when an earlier loaded item exists. Save: only when the item is
  // fully answered. Next: only when a later loaded item exists, or the current
  // item is saved (so a new pool item can be pulled).
  $('back').disabled = idx <= 0;
  $('save').disabled = !isComplete();
  $('next').disabled = !(idx < session.length - 1 || cur().saved);
  $('ct-done').textContent = completedCount;
  $('a-status').textContent = cur().saved ? '✓ Saved — edit and Save to update' : '';
}

function scaleMetric(key, title, help) {
  const v = cur().answers[key];
  const btns = [1, 2, 3, 4, 5].map((n) =>
    `<button data-key="${key}" data-val="${n}"${v === n ? ' style="background:#2f6f8f;border-color:#2f6f8f;color:#fff;font-weight:700;"' : ''}>${n}</button>`
  ).join('');
  return `<div class="metric">
    <span class="m-title">${title}</span>
    <span class="m-help">${help}</span>
    <div class="m-btns">${btns}</div>
    <div class="m-ends"><span>Low</span><span>High</span></div>
  </div>`;
}

function ynMetric(key, title, help, invertGoodNo, bottomSpacer) {
  const v = cur().answers[key];
  const opts = [
    { val: 1, label: 'Yes', color: invertGoodNo ? '#b3543f' : '#2f8f5b' },
    { val: 0, label: 'No', color: invertGoodNo ? '#2f8f5b' : '#b3543f' },
  ];
  const btns = opts.map((o) =>
    `<button data-key="${key}" data-val="${o.val}"${v === o.val ? ` style="background:${o.color};border-color:${o.color};color:#fff;font-weight:700;"` : ''}>${o.label}</button>`
  ).join('');
  // when shown beside the 1–5 scales, an invisible end-label row keeps the
  // Yes/No buttons on the same baseline as the scale buttons
  const spacer = bottomSpacer ? '<div class="m-ends" style="visibility:hidden;"><span>·</span></div>' : '';
  return `<div class="metric">
    <span class="m-title">${title}</span>
    <span class="m-help">${help}</span>
    <div class="m-btns">${btns}</div>
    ${spacer}
  </div>`;
}

function renderMetrics() {
  const item = cur().item;
  const showLink = hasLink(item.answer);
  const showYesNo = yesno(item.intent);

  let grid = scaleMetric('accuracy', 'Answer accuracy',
    'Is the answer factually correct and complete? <strong>1</strong> = wrong · <strong>5</strong> = fully correct.');
  grid += scaleMetric('source_relevance', 'Source relevance',
    'Does the linked source support the answer? <strong>1</strong> = unrelated · <strong>5</strong> = directly backs it.');
  if (showLink) {
    grid += ynMetric('valid_link', 'Valid link in answer',
      'Is the URL a valid GMU (<strong>gmu.edu</strong>) address that currently loads?', false, true);
  }

  const cols = showLink ? '1fr 1fr 1fr' : '1fr 1fr';
  let html = `<div class="m-grid" style="grid-template-columns:${cols};">${grid}</div>`;

  if (showYesNo) {
    html += `<div class="yn-group">
      <span class="yn-group-h">If intent &nbsp;·&nbsp; Yes / No</span>
      <div class="yn-grid">
        ${ynMetric('exact_matching', 'Exact Matching', "Does the answer exactly match the question's intent?", false)}
        ${ynMetric('risk_of_harm', 'Risk of harm', 'Could acting on this response lead to a harmful or undesired outcome?', true)}
      </div>
    </div>`;
  }

  $('metrics').innerHTML = html;
  $('metrics').querySelectorAll('button[data-key]').forEach((b) =>
    b.addEventListener('click', () => { cur().answers[b.dataset.key] = Number(b.dataset.val); render(); }));
}

function requiredKeys(item) {
  const keys = ['accuracy', 'source_relevance'];
  if (hasLink(item.answer)) keys.push('valid_link');
  if (yesno(item.intent)) keys.push('exact_matching', 'risk_of_harm');
  return keys;
}

// the current item is ready to save once a best option and every applicable
// metric is answered
function isComplete() {
  const { item, answers } = cur();
  if (answers.bestIdx === undefined) return false;
  return requiredKeys(item).every((k) => answers[k] !== undefined);
}

async function onSave() {
  const { item, answers } = cur();
  if (answers.bestIdx === undefined) { $('a-status').textContent = 'Pick the best option first.'; return; }
  for (const k of requiredKeys(item)) if (answers[k] === undefined) { $('a-status').textContent = 'Please answer all metrics.'; return; }
  const payload = { annotator_id: Number(annotatorId), item_id: item.id, best_option_idx: answers.bestIdx };
  for (const k of requiredKeys(item)) payload[k] = answers[k];
  const firstSave = !cur().saved;
  $('save').disabled = true;
  let res;
  try {
    res = await fetch('/annotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) { $('save').disabled = false; $('a-status').textContent = 'Save failed — try again.'; return; }
  $('save').disabled = false;
  if (!res.ok) { $('a-status').textContent = 'Save failed — try again.'; return; }
  if (firstSave) { cur().saved = true; completedCount += 1; }
  render();
  $('a-status').textContent = firstSave ? '✓ Annotation saved' : '↻ Annotation updated';
}

// Save records the current item in place; Next advances (pulling a new pool
// item once the frontier item is saved); Back revisits earlier loaded items.
function onNext() {
  if (idx < session.length - 1) { idx += 1; render(); return; }
  if (!cur().saved) { $('a-status').textContent = 'Save this item before moving on.'; return; }
  loadFrontier();
}

$('save').addEventListener('click', onSave);
$('back').addEventListener('click', () => { if (idx > 0) { idx -= 1; render(); } });
$('next').addEventListener('click', onNext);

// ---------- boot ----------
if (annotatorId) startAnnotating(); else show('view-email');
