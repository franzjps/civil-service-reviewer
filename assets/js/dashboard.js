import { CATEGORIES, FULL_MOCK, FULL_SUBPROFESSIONAL_MOCK, MIXED, LEVELS, questionLimitFor, examDurationMinutes, esc, formatDate, loadPool, getCategory, levelLabel, params, showError } from './app.js';
import { loadHistory, loadActive, clearActive } from './storage.js';
import { startExam } from './exam-engine.js';
import { formatClock } from './timer.js';
import { getFlashcardStats } from './flashcard-storage.js';

const $ = (id) => document.getElementById(id);
const badge = (r) => `<span class="badge ${r.passed ? 'text-bg-success' : 'text-bg-danger'}">${r.passed ? 'Above' : 'Below'} target</span>`;

export function historyRows(list) {
  return list.map((r) => `
    <tr>
      <td>${esc(formatDate(r.finishedAt))}</td>
      <td>${esc(r.title)}${r.level ? `<div class="small text-muted">${esc(levelLabel(r.level))}</div>` : ''}</td>
      <td>${Math.round(r.timeSpentSec / 60)} min</td>
      <td>${r.earnedPoints}/${r.totalPoints}</td>
      <td><strong>${r.percentage}%</strong> ${badge(r)}</td>
      <td class="text-end"><a class="btn btn-sm btn-outline-primary" href="result.html?id=${encodeURIComponent(r.id)}">View</a></td>
    </tr>`).join('');
}

export const historyTable = (list, extra = '') => `
  <div class="table-responsive">
    <table class="table align-middle mb-0">
      <thead><tr><th>Date</th><th>Exam</th><th>Time used</th><th>Score</th><th>Percentage</th><th class="text-end">${extra}<span class="visually-hidden">Actions</span></th></tr></thead>
      <tbody>${historyRows(list)}</tbody>
    </table>
  </div>`;

export function initDashboard() {
  const history = loadHistory();
  const flashcards = getFlashcardStats();
  const active = loadActive();
  const avg = history.length ? history.reduce((s, r) => s + r.percentage, 0) / history.length : 0;
  const best = history.length ? Math.max(...history.map((r) => r.percentage)) : 0;

  $('stats').innerHTML = [
    ['Completed exams', history.length, 'bi-check2-circle'],
    ['Average score', history.length ? `${avg.toFixed(1)}%` : '—', 'bi-graph-up'],
    ['Highest score', history.length ? `${best}%` : '—', 'bi-trophy']
  ].map(([label, value, icon]) => `
    <div class="col-12 col-sm-4"><div class="card stat-card h-100"><div class="card-body d-flex align-items-center gap-3">
      <div class="stat-icon"><i class="bi ${icon}"></i></div>
      <div><div class="stat-value">${value}</div><div class="text-muted small">${label}</div></div>
    </div></div></div>`).join('');

  const box = $('activeExam');
  if (active) {
    const remaining = active.deadline - Date.now();
    const p = active.questions.filter((q) => Number.isInteger(active.answers[q.id])).length;
    box.innerHTML = `
      <div class="card border-primary"><div class="card-body d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div><h2 class="h5 mb-1"><i class="bi bi-hourglass-split text-primary"></i> Exam in progress</h2>
          <div class="text-muted">${esc(active.title)} · ${p}/${active.questions.length} answered · ${remaining > 0 ? `${formatClock(remaining)} left` : 'time expired'}</div></div>
        <div class="d-flex gap-2">
          <a class="btn btn-primary" href="exam.html">${remaining > 0 ? 'Continue exam' : 'Submit exam'}</a>
          <button class="btn btn-outline-danger" id="discardBtn" type="button">Discard</button>
        </div></div></div>`;
    $('discardBtn').addEventListener('click', () => {
      if (confirm('Discard the exam in progress? Your answers will be lost.')) { clearActive(); location.reload(); }
    });
  } else {
    box.innerHTML = `
      <div class="card hero-card"><div class="card-body d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div><h2 class="h5 mb-1">Ready for a mock exam?</h2><p class="mb-0">Take a timed, randomized exam drawn from all subjects.</p></div>
        <a class="btn btn-light btn-lg" href="exams.html#mixed">Start mixed exam</a>
      </div></div>`;
  }

  $('recent').innerHTML = history.length
    ? historyTable(history.slice(0, 5))
    : '<p class="text-muted mb-0">No exams completed yet. Your attempts will appear here.</p>';
  if (history.length) $('recentLink').classList.remove('d-none');

  $('flashcardSummary').innerHTML = `
    <div class="card border-primary"><div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
      <div><h2 class="h5 mb-1"><i class="bi bi-card-text text-primary"></i> Flashcard review</h2>
        <p class="mb-0 text-muted">${flashcards.due} due today · ${flashcards.mistakes} exam mistakes · ${flashcards.xp} XP · ${flashcards.streak}-day streak</p>
      </div>
      <a class="btn btn-primary" href="flashcards.html${flashcards.mistakes ? '?deck=mistakes' : ''}">${flashcards.due ? 'Review due cards' : flashcards.mistakes ? 'Review my mistakes' : 'Open flashcards'}</a>
    </div></div>`;

  $('categories').innerHTML = [...CATEGORIES, FULL_MOCK, FULL_SUBPROFESSIONAL_MOCK].map((c) => `
    <div class="col-12 col-sm-6 col-xl-3"><a class="card category-card h-100 text-decoration-none" href="exams.html#${c.id}">
      <div class="card-body"><div class="stat-icon mb-2"><i class="bi ${c.icon}"></i></div>
      <h3 class="h6 text-body">${c.name}</h3><p class="small text-muted mb-0">${c.description}</p></div></a></div>`).join('');
}

export function initExamsPage() {
  const root = $('catalog');
  const all = [...CATEGORIES, FULL_MOCK, FULL_SUBPROFESSIONAL_MOCK, MIXED];
  root.innerHTML = all.map((c) => `
    <div class="col-12 col-md-6 col-xl-4" id="${c.id}"><div class="card category-card h-100"><div class="card-body d-flex flex-column">
      <div class="stat-icon mb-2"><i class="bi ${c.icon}"></i></div>
      <h2 class="h5">${c.name}</h2><p class="text-muted small">${c.description}</p>
      ${c.hasLevels ? `<label class="form-label small mb-1" for="level-${c.id}">Exam level</label>
        <select class="form-select mb-2" id="level-${c.id}" data-cat="${c.id}">
          ${Object.entries(LEVELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>` : `<p class="small mb-2"><span class="badge text-bg-secondary">${c.id === FULL_MOCK.id ? 'Professional' : c.id === FULL_SUBPROFESSIONAL_MOCK.id ? 'Subprofessional' : 'All levels'}</span></p>`}
      <p class="small text-muted mt-auto mb-2" data-count="${c.id}">Counting questions…</p>
      <button type="button" class="btn btn-primary" data-start="${c.id}">Select exam</button>
    </div></div></div>`).join('');

  const levelOf = (id) => root.querySelector(`#level-${id}`)?.value || null;
  async function updateCount(id) {
    const el = root.querySelector(`[data-count="${id}"]`);
    try {
      const n = Math.min((await loadPool(id, levelOf(id))).length, questionLimitFor(id));
      el.textContent = `${n} questions · ${examDurationMinutes(id, n)} minutes`;
    } catch (err) {
      el.textContent = 'Questions unavailable';
      showError($('catalogError'), err);
    }
  }
  all.forEach((c) => updateCount(c.id));
  root.addEventListener('change', (e) => { if (e.target.dataset.cat) updateCount(e.target.dataset.cat); });
  root.addEventListener('click', (e) => {
    const id = e.target.closest('[data-start]')?.dataset.start;
    if (!id) return;
    const q = new URLSearchParams({ cat: id });
    if (levelOf(id)) q.set('level', levelOf(id));
    location.href = `exam-instructions.html?${q}`;
  });
  if (location.hash) $(location.hash.slice(1))?.scrollIntoView();
}

export async function initInstructionsPage() {
  const root = $('instructions');
  const p = params();
  const cat = getCategory(p.get('cat'));
  if (!cat) { root.innerHTML = '<div class="alert alert-warning">No exam selected. <a href="exams.html">Choose an exam</a>.</div>'; return; }
  const level = cat.hasLevels ? (p.get('level') in LEVELS ? p.get('level') : 'subprofessional') : null;
  const pool = await loadPool(cat.id, level);
  const n = Math.min(pool.length, questionLimitFor(cat.id));
  if (!n) { root.innerHTML = '<div class="alert alert-warning">No questions available for this selection.</div>'; return; }
  const minutes = examDurationMinutes(cat.id, n);
  const active = loadActive();

  root.innerHTML = `
    ${active ? `<div class="alert alert-warning">You have an exam in progress. Starting a new one will discard it.
      <a class="alert-link" href="exam.html">Resume it instead</a>.</div>` : ''}
    <div class="card mb-3"><div class="card-body">
      <h2 class="h4">${cat.name}${level ? ` <small class="text-muted">· ${levelLabel(level)}</small>` : ''}</h2>
      <div class="row g-3 my-1">
        <div class="col-6 col-md-4"><div class="info-tile"><i class="bi bi-list-check"></i><strong>${n}</strong><span>Questions</span></div></div>
        <div class="col-6 col-md-4"><div class="info-tile"><i class="bi bi-stopwatch"></i><strong>${minutes} min</strong><span>Time limit</span></div></div>
        <div class="col-12 col-md-4"><div class="info-tile"><i class="bi bi-ui-radios"></i><strong>Multiple choice</strong><span>One correct answer</span></div></div>
      </div></div></div>
    <div class="card mb-3"><div class="card-body">
      <h3 class="h5">Examination rules</h3>
      <ul class="rules mb-0">
        <li>The timer starts when you begin and keeps running even if you refresh or close the page.</li>
        <li>Questions and answer choices are shuffled for every attempt.</li>
        <li>You may move between questions, change answers, and mark questions for review.</li>
        <li>Unanswered questions score zero. There is no penalty for wrong answers.</li>
        <li>The exam is submitted automatically when time runs out.</li>
        <li>Pass/fail is judged against a configurable <em>practice</em> target, not an official passing standard.</li>
      </ul></div></div>
    <div class="d-flex flex-wrap gap-2">
      <button class="btn btn-primary btn-lg" id="startBtn" type="button"><i class="bi bi-play-fill"></i> Start examination</button>
      <a class="btn btn-outline-secondary btn-lg" href="exams.html">Back</a>
    </div>`;

  const modalEl = $('startModal');
  $('startSummary').textContent = `${n} questions in ${minutes} minutes.`;
  const modal = new bootstrap.Modal(modalEl);
  $('startBtn').addEventListener('click', () => modal.show());
  $('confirmStart').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await startExam({ category: cat.id, level });
      location.href = 'exam.html';
    } catch (err) {
      modal.hide();
      e.target.disabled = false;
      showError($('instructions'), err);
    }
  });
}
