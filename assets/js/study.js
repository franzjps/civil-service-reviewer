import { esc, explanationHtml, levelLabel, LEVELS, params } from './app.js';
import {
  TIERS, SESSION_SIZE, ADVANCE_WINDOW, ADVANCE_ACCURACY, MASTERED_BOX,
  normalizeState, skillsOf, skillAccuracy, shuffle, record, tierAccuracy, diagnosticSet,
  applyDiagnostic, counts, nextDueAt, buildSession, similarTo, dueLabel
} from './study-engine.js';

const $root = () => document.getElementById('study');
const LEVEL_KEY = 'csr.study.level';

const AREAS = [
  { id: 'verbal', name: 'Verbal Ability', icon: 'bi-chat-quote' },
  { id: 'numerical', name: 'Numerical Ability', icon: 'bi-calculator' },
  { id: 'clerical', name: 'Clerical Ability', icon: 'bi-folder2-open' }
];
const MODULES = [
  { area: 'verbal', id: 'word-meaning', name: 'Word Meaning', icon: 'bi-book', file: 'review-word-meaning.json',
    blurb: 'Vocabulary, synonyms, antonyms, context clues, English and Filipino expressions' },
  { area: 'verbal', id: 'sentence-completion', name: 'Sentence Completion', icon: 'bi-input-cursor-text', file: 'review-sentence-completion.json', blurb: 'Context, transitions, logical relationships, grammar' },
  { area: 'verbal', id: 'error-recognition', name: 'Error Recognition', icon: 'bi-bug', file: 'review-error-recognition.json', blurb: 'Subject–verb agreement, tenses, pronouns, ng/nang, daw/raw' },
  { area: 'verbal', id: 'sentence-structure', name: 'Sentence Structure', icon: 'bi-diagram-3', file: 'review-sentence-structure.json', blurb: 'Clauses, parallelism, modifiers, sentence construction' },
  { area: 'verbal', id: 'paragraph-organization', name: 'Paragraph Organization', icon: 'bi-list-ol', file: 'review-paragraph-organization.json', blurb: 'Sentence sequencing, main ideas, transitions, conclusions' },
  { area: 'verbal', id: 'reading-comprehension', name: 'Reading Comprehension', icon: 'bi-journal-text', file: 'review-reading-comprehension.json', blurb: 'Main idea, details, inference, tone, purpose, vocabulary in context' },
  { area: 'numerical', id: 'number-operations', name: 'Number Operations', icon: 'bi-plus-slash-minus', file: 'review-number-operations.json', blurb: 'Order of operations, signed numbers, exponents and roots, GCF and LCM' },
  { area: 'numerical', id: 'fractions-decimals-percent', name: 'Fractions, Decimals & Percent', icon: 'bi-percent', file: 'review-fractions-decimals-percent.json', blurb: 'Fraction and decimal arithmetic, percent, discount, markup, simple interest' },
  { area: 'numerical', id: 'ratio-proportion-average', name: 'Ratio, Proportion & Average', icon: 'bi-bar-chart-line', file: 'review-ratio-proportion-average.json', blurb: 'Ratios, direct and inverse proportion, mean, median, mode, range' },
  { area: 'numerical', id: 'word-problems', name: 'Word Problems', icon: 'bi-chat-left-text', file: 'review-word-problems.json', blurb: 'Age, speed-distance-time, work, number and money problems' },
  { area: 'numerical', id: 'number-series', name: 'Number Series', icon: 'bi-graph-up-arrow', file: 'review-number-series.json', blurb: 'Arithmetic, geometric, alternating and special sequences' },
  { area: 'numerical', id: 'measurement-geometry', name: 'Measurement & Geometry', icon: 'bi-rulers', file: 'review-measurement-geometry.json',   blurb: 'Perimeter, area, circles, volume, unit conversion' },
    { area: 'clerical', id: 'alphabetical-filing', name: 'Alphabetical Filing', icon: 'bi-sort-alpha-down', file: 'review-alphabetical-filing.json', blurb: 'Word order, surnames, file drawer ranges, business names' },
    { area: 'clerical', id: 'spelling', name: 'Spelling', icon: 'bi-spellcheck', file: 'review-spelling.json', blurb: 'Double letters, ie/ei, vowels, silent and tricky letters' },
    { area: 'clerical', id: 'checking-comparing', name: 'Checking & Comparing', icon: 'bi-check2-square', file: 'review-checking-comparing.json', blurb: 'Spot differences in letters, numbers, names, addresses and codes' },
    { area: 'clerical', id: 'alphabet-number-skills', name: 'Alphabet & Number Skills', icon: 'bi-sort-numeric-down', file: 'review-alphabet-number-skills.json', blurb: 'Letter positions, counting in strings, ordering numbers, letter codes' },
    { area: 'clerical', id: 'filing-systems', name: 'Filing Systems', icon: 'bi-folder-check', file: 'review-filing-systems.json', blurb: 'Numeric, terminal-digit, chronological, alphanumeric and indexing rules' }
  ];
const METHOD = [
  ['Diagnostic assessment', 'A short test finds your weakest topics so you know what to study first.'],
  ['Active recall', 'Answer from memory before the choices appear. Mistakes trigger an explanation and a similar question.'],
  ['Spaced repetition', 'Items you struggle with come back after growing intervals.'],
  ['Adaptive learning', 'Weak skills get more practice; mastered ones show up less often.'],
  ['Mastery-based progression', `Advance from Foundation to Challenge after ${Math.round(ADVANCE_ACCURACY * 100)}% accuracy over your last ${ADVANCE_WINDOW} answers.`]
];

let mod = null;
let level = 'professional';
let pool = [];
let state = normalizeState();
let run = null;

const storeKey = () => `csr.study.${mod.id}.${level}.v1`;
function loadState() {
  try { state = normalizeState(JSON.parse(localStorage.getItem(storeKey()))); } catch { state = normalizeState(); }
}
function saveState() {
  try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch { /* storage unavailable */ }
}
function loadLevel() {
  try {
    const l = localStorage.getItem(LEVEL_KEY);
    if (l in LEVELS) level = l;
  } catch { /* storage unavailable */ }
}

async function loadModulePool() {
  const res = await fetch(`data/${mod.file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${mod.file} (HTTP ${res.status}).`);
  const data = await res.json();
  let all = Array.isArray(data) ? data : data.questions || [];
  // The optional "-more" bank adds extra questions so learners cannot memorise a small set.
  try {
    const more = await fetch(`data/${mod.file.replace('.json', '-more.json')}`, { cache: 'no-cache' });
    if (more.ok) {
      const extra = await more.json();
      all = all.concat(Array.isArray(extra) ? extra : extra.questions || []);
    }
  } catch { /* optional bank */ }
  all = all.filter((q) => Array.isArray(q.options) && Number.isInteger(q.correctAnswer));
  pool = all.filter((q) => q.level === level || q.level === 'both');
}

const tierName = (n) => TIERS.find((t) => t.n === n)?.name || '';
const pct = (x) => `${Math.round(x * 100)}%`;
const barClass = (p) => (p < 0.6 ? 'bg-danger' : p < 0.8 ? 'bg-warning' : 'bg-success');

function hubView() {
  document.getElementById('studyTitle').textContent = 'Review';
  $root().innerHTML = `
    <p class="text-muted">Pick a subject card. Each one uses the same five-step method: diagnose, recall, space, adapt, master.</p>
    ${AREAS.map((a) => `
      <h2 class="study-area h5 mt-4 mb-3"><i class="bi ${a.icon} text-primary"></i> ${esc(a.name)}</h2>
      <div class="row g-3 mb-2">
        ${MODULES.filter((m) => m.area === a.id).map((m) => m.file ? `
          <div class="col-md-6 col-xl-4"><a class="study-module card h-100 text-decoration-none" href="study.html?m=${m.id}">
            <div class="card-body"><i class="bi ${m.icon} fs-3 text-primary"></i><h3 class="h5 mt-2">${esc(m.name)}</h3><p class="small text-muted mb-0">${esc(m.blurb)}</p></div>
            <div class="card-footer small text-primary fw-semibold">Start reviewing <i class="bi bi-arrow-right"></i></div></a></div>` : `
          <div class="col-md-6 col-xl-4"><div class="study-module card h-100 disabled" aria-disabled="true">
            <div class="card-body"><i class="bi ${m.icon} fs-3 text-secondary"></i><h3 class="h5 mt-2">${esc(m.name)}</h3><p class="small text-muted mb-0">${esc(m.blurb)}</p></div>
            <div class="card-footer small text-muted">Coming soon</div></div></div>`).join('')}
      </div>`).join('')}
    <div class="card mt-4"><div class="card-body"><h2 class="h6">How it works</h2>
      <ol class="mb-0 small">${METHOD.map(([t, d]) => `<li><strong>${t}.</strong> ${d}</li>`).join('')}</ol></div></div>`;
}

function homeView() {
  run = null;
  document.getElementById('studyTitle').textContent = mod.name;
  const c = counts(state, pool);
  const next = nextDueAt(state, pool);
  const diag = state.diagnostic;
  const skills = skillsOf(pool);
  const tierAcc = tierAccuracy(state);
  const weakest = diag?.ranked?.[0];

  $root().innerHTML = `
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <a class="btn btn-sm btn-outline-secondary" href="study.html"><i class="bi bi-arrow-left"></i> All modules</a>
      <div class="btn-group btn-group-sm ms-auto" role="group" aria-label="Exam level">
        ${Object.entries(LEVELS).map(([k, v]) => `<button type="button" class="btn ${k === level ? 'btn-primary' : 'btn-outline-primary'}" data-level="${k}">${v}</button>`).join('')}
      </div>
    </div>
    ${diag ? '' : `
    <div class="card border-primary mb-3"><div class="card-body">
      <h2 class="h5"><i class="bi bi-clipboard2-pulse"></i> Step 1: Diagnostic assessment</h2>
      <p class="mb-3">Take a quick ${diagnosticSet(pool).length}-question test so we can find your weakest skills and choose where to start.</p>
      <button class="btn btn-primary" id="startDiag">Start diagnostic</button>
    </div></div>`}
    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3"><div class="card stat-card"><div class="card-body"><div class="small text-muted">Level</div><div class="h5 mb-0">${tierName(state.tier)}</div><div class="small text-muted">Tier ${state.tier} of ${TIERS.length}</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="card stat-card"><div class="card-body"><div class="small text-muted">Due now</div><div class="h5 mb-0">${c.due}</div><div class="small text-muted">${next && !c.due ? `Next ${dueLabel(next)}` : 'Ready to review'}</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="card stat-card"><div class="card-body"><div class="small text-muted">Learning</div><div class="h5 mb-0">${c.learning}</div><div class="small text-muted">${c.fresh} new</div></div></div></div>
      <div class="col-6 col-lg-3"><div class="card stat-card"><div class="card-body"><div class="small text-muted">Mastered</div><div class="h5 mb-0">${c.mastered} / ${c.total}</div><div class="small text-muted">Box ${MASTERED_BOX}+ items</div></div></div></div>
    </div>
    <div class="card mb-3"><div class="card-body">
      <h2 class="h6">Skills</h2>
      ${skills.map((s) => {
        const t = state.skills[s]?.t || 0;
        const a = skillAccuracy(state, s);
        return `<div class="topic-row mb-2"><span class="small">${esc(s)}${weakest?.skill === s ? ' <span class="badge text-bg-warning">Weakest</span>' : ''}</span>
          <div class="progress" role="progressbar" aria-label="${esc(s)} accuracy" aria-valuenow="${Math.round(a * 100)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar ${t ? barClass(a) : 'bg-secondary'}" style="width:${t ? Math.round(a * 100) : 0}%"></div></div>
          <span class="small text-end">${t ? pct(a) : 'New'}</span></div>`;
      }).join('')}
      ${diag ? `<p class="small text-muted mt-3 mb-0">Diagnostic: ${diag.right}/${diag.total} correct. Start with <strong>${esc(weakest.skill)}</strong>.</p>` : ''}
    </div></div>
    <div class="card mb-3"><div class="card-body">
      <h2 class="h6">Mastery progress: ${tierName(state.tier)}</h2>
      ${state.tier < TIERS.length
        ? `<div class="progress mb-1" style="height:.6rem"><div class="progress-bar" style="width:${Math.min(100, Math.round((state.tierHist.length / ADVANCE_WINDOW) * 100))}%"></div></div>
           <p class="small text-muted mb-0">${state.tierHist.length}/${ADVANCE_WINDOW} recent answers at this tier, ${state.tierHist.length ? pct(tierAcc) : '0%'} correct. Reach ${Math.round(ADVANCE_ACCURACY * 100)}% to unlock ${tierName(state.tier + 1)}.</p>`
        : '<p class="small text-muted mb-0">You reached the Challenge tier. Keep your accuracy up.</p>'}
    </div></div>
    <div class="d-flex flex-wrap gap-2">
      <button class="btn btn-success" id="startPractice"><i class="bi bi-play-fill"></i> Start practice (${SESSION_SIZE} questions)</button>
      ${diag ? '<button class="btn btn-outline-primary" id="startDiag">Retake diagnostic</button>' : ''}
      <button class="btn btn-outline-danger ms-auto" id="resetProgress">Reset progress</button>
    </div>`;

  $root().querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', async () => {
    level = b.dataset.level;
    try { localStorage.setItem(LEVEL_KEY, level); } catch { /* storage unavailable */ }
    await loadModulePool();
    loadState();
    homeView();
  }));
  document.getElementById('startDiag')?.addEventListener('click', startDiagnostic);
  document.getElementById('startPractice').addEventListener('click', startPractice);
  document.getElementById('resetProgress').addEventListener('click', () => {
    if (!confirm(`Reset all ${mod.name} progress for ${levelLabel(level)}?`)) return;
    state = normalizeState();
    saveState();
    homeView();
  });
}

function startDiagnostic() {
  run = { type: 'diagnostic', queue: diagnosticSet(pool), idx: 0, results: [], asked: [] };
  questionView();
}
function startPractice() {
  const queue = buildSession(state, pool);
  if (!queue.length) { alert('No questions are available for this level.'); return; }
  run = { type: 'practice', queue, idx: 0, results: [], asked: queue.map((q) => q.id), advanced: false };
  questionView();
}

const keepOrder = (q) => q.options.some((o) => /above|none of|both|all of|not presented|^no error$|^[A-E]$|^\d+ (pairs?|times?|letters?)$|^(first|second|third|fourth|fifth)$|^between \d|^[A-Z][a-z] – [A-Z][a-z]$/i.test(o));

function questionView() {
  const q = run.queue[run.idx];
  const total = run.queue.length;
  const isDiag = run.type === 'diagnostic';
  const recall = !isDiag && !run.revealed;
  const order = run.order?.id === q.id ? run.order.list : null;
  if (!order) {
    const list = q.options.map((_, i) => i);
    run.order = { id: q.id, list: keepOrder(q) ? list : shuffle(list) };
  }
  document.getElementById('studyTitle').textContent = isDiag ? 'Diagnostic assessment' : mod.name;
  $root().innerHTML = `
    <div class="d-flex align-items-center gap-2 mb-2">
      <span class="small text-muted">Question ${run.idx + 1} of ${total}</span>
      <span class="badge text-bg-light border">${esc(q.skill)}</span>
      <span class="badge text-bg-secondary">${esc(tierName(q.tier))}</span>
      ${run.similar?.has(q.id) ? '<span class="badge text-bg-info">Similar question</span>' : ''}
      <button class="btn btn-sm btn-link text-muted ms-auto" id="quit">Quit</button>
    </div>
    <div class="progress mb-3" style="height:.4rem"><div class="progress-bar" style="width:${Math.round((run.idx / total) * 100)}%"></div></div>
    <div class="card"><div class="card-body">
      ${q.passage ? `<div class="study-passage border rounded p-3 mb-3 bg-body-tertiary">${esc(q.passage)}</div>` : ''}
      <p class="study-question">${esc(q.question)}</p>
      ${recall ? `
        <div class="alert alert-light border mb-3"><i class="bi bi-lightbulb"></i> Think of the answer first, in your own words. Then reveal the choices.</div>
        <button class="btn btn-primary" id="reveal">I have an answer in mind</button>` : `
        <div class="d-grid gap-2" id="choices">
          ${run.order.list.map((i, n) => `<button class="btn btn-outline-secondary text-start choice" data-i="${i}"><strong>${String.fromCharCode(65 + n)}.</strong> ${esc(q.options[i])}</button>`).join('')}
        </div>`}
      <div id="feedback" class="mt-3"></div>
    </div></div>`;

  document.getElementById('quit').addEventListener('click', () => { if (confirm('Quit this session? Answers so far are kept.')) { saveState(); homeView(); } });
  document.getElementById('reveal')?.addEventListener('click', () => { run.revealed = true; questionView(); });
  document.getElementById('choices')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.choice');
    if (btn) answer(q, Number(btn.dataset.i));
  });
}

function answer(q, picked) {
  const correct = picked === q.correctAnswer;
  const isDiag = run.type === 'diagnostic';
  const outcome = isDiag ? { advanced: false } : record(state, q, correct);
  run.results.push({ q, correct });
  if (outcome.advanced) run.advanced = true;
  if (!isDiag) saveState();

  document.querySelectorAll('#choices .choice').forEach((b) => {
    const i = Number(b.dataset.i);
    b.disabled = true;
    if (isDiag) {
      if (i === picked) b.classList.replace('btn-outline-secondary', 'btn-primary');
    } else if (i === q.correctAnswer) b.classList.replace('btn-outline-secondary', 'btn-success');
    else if (i === picked) b.classList.replace('btn-outline-secondary', 'btn-danger');
  });

  const last = run.idx === run.queue.length - 1;
  const fb = document.getElementById('feedback');
  if (isDiag) {
    fb.innerHTML = `<button class="btn btn-primary" id="next">${last ? 'See results' : 'Next'}</button>`;
  } else if (correct) {
    fb.innerHTML = `<div class="alert alert-success py-2"><i class="bi bi-check-circle-fill"></i> Correct. You'll see this again ${dueLabel(state.items[q.id].due)}.</div>
      ${q.explanation ? explanationHtml({ ...q, category: 'verbal' }, 'Why') : ''}
      <button class="btn btn-primary mt-2" id="next">${last ? 'Finish' : 'Next'}</button>`;
  } else {
    fb.innerHTML = `<div class="alert alert-danger py-2"><i class="bi bi-x-circle-fill"></i> Not quite. The answer is <strong>${esc(q.options[q.correctAnswer])}</strong>. It returns ${dueLabel(state.items[q.id].due)}.</div>
      ${explanationHtml({ ...q, category: 'verbal' }, 'Why') || ''}
      <div class="d-flex flex-wrap gap-2 mt-2"><button class="btn btn-warning" id="similar"><i class="bi bi-arrow-repeat"></i> Try a similar question</button>
      <button class="btn btn-primary" id="next">${last ? 'Finish' : 'Next'}</button></div>`;
  }
  document.getElementById('next').addEventListener('click', advance);
  document.getElementById('similar')?.addEventListener('click', () => {
    const sim = similarTo(state, pool, q, run.asked);
    if (!sim) { alert('No other question for this skill yet.'); return; }
    run.queue.splice(run.idx + 1, 0, sim);
    run.asked.push(sim.id);
    (run.similar ||= new Set()).add(sim.id);
    advance();
  });
}

function advance() {
  run.idx += 1;
  run.revealed = false;
  if (run.idx >= run.queue.length) return finish();
  questionView();
}

function finish() {
  const r = run;
  if (r.type === 'diagnostic') {
    applyDiagnostic(state, r.results);
    saveState();
    diagnosticResultView(r);
  } else {
    saveState();
    summaryView(r);
  }
}

function diagnosticResultView(r) {
  const d = state.diagnostic;
  const missed = r.results.filter((x) => !x.correct);
  document.getElementById('studyTitle').textContent = 'Diagnostic results';
  $root().innerHTML = `
    <div class="card mb-3"><div class="card-body">
      <h2 class="h4">${d.right} / ${d.total} correct (${pct(d.accuracy)})</h2>
      <p>Your starting level is <strong>${tierName(d.startTier)}</strong>. Study <strong>${esc(d.ranked[0].skill)}</strong> first.</p>
      ${d.ranked.map((s) => `<div class="topic-row mb-2"><span class="small">${esc(s.skill)}</span>
        <div class="progress"><div class="progress-bar ${barClass(s.accuracy)}" style="width:${Math.round(s.accuracy * 100)}%"></div></div>
        <span class="small text-end">${s.c}/${s.t}</span></div>`).join('')}
    </div></div>
    ${missed.length ? `<div class="card mb-3"><div class="card-body"><h2 class="h6">Questions to learn from (queued for review)</h2>
      ${missed.map(({ q }) => `<div class="mb-3"><p class="mb-1 small">${esc(q.question)}</p><div class="small"><strong>Answer:</strong> ${esc(q.options[q.correctAnswer])}</div>${q.explanation ? explanationHtml({ ...q, category: 'verbal' }, 'Why') : ''}</div>`).join('')}
    </div></div>` : ''}
    <button class="btn btn-primary" id="toHome">Continue to practice</button>`;
  document.getElementById('toHome').addEventListener('click', homeView);
}

function summaryView(r) {
  const right = r.results.filter((x) => x.correct).length;
  const total = r.results.length;
  const missed = r.results.filter((x) => !x.correct);
  const next = nextDueAt(state, pool);
  document.getElementById('studyTitle').textContent = 'Session complete';
  $root().innerHTML = `
    <div class="card mb-3"><div class="card-body">
      <h2 class="h4">${right} / ${total} correct (${pct(total ? right / total : 0)})</h2>
      ${r.advanced ? `<div class="alert alert-success"><i class="bi bi-trophy-fill"></i> Level up! You unlocked <strong>${tierName(state.tier)}</strong>.</div>` : ''}
      ${missed.length ? `<p class="mb-1">Missed items will return soon:</p><ul class="small">${missed.map(({ q }) => `<li>${esc(q.question.slice(0, 90))}${q.question.length > 90 ? '…' : ''} <span class="text-muted">(${esc(q.skill)})</span></li>`).join('')}</ul>` : '<p>Perfect session!</p>'}
      ${next ? `<p class="small text-muted mb-0">Next review ${dueLabel(next)}.</p>` : ''}
    </div></div>
    <div class="d-flex gap-2"><button class="btn btn-success" id="again">Practice again</button><button class="btn btn-outline-secondary" id="toHome">Back to overview</button></div>`;
  document.getElementById('again').addEventListener('click', startPractice);
  document.getElementById('toHome').addEventListener('click', homeView);
}

export async function initStudyPage() {
  const id = params().get('m');
  mod = MODULES.find((m) => m.id === id && m.file);
  if (!mod) { hubView(); return; }
  loadLevel();
  await loadModulePool();
  loadState();
  homeView();
}
