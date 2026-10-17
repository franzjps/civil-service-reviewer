import { contextHtml, esc, formatDate, formatDuration, levelLabel, params, getCategory } from './app.js';
import { getResult, loadHistory, clearHistory, loadPrefs, savePrefs, loadActive } from './storage.js';
import { startExam } from './exam-engine.js';
import { historyTable } from './dashboard.js';
import { addMistakeCards, getFlashcardStats } from './flashcard-storage.js';

const $ = (id) => document.getElementById(id);
const WEAK_BELOW = 60;

function resolveResult() {
  const id = params().get('id');
  return id ? getResult(id) : loadHistory()[0] || null;
}

const missing = (root) => {
  root.innerHTML = `<div class="alert alert-warning">That result could not be found in this browser.
    <a class="alert-link" href="history.html">Open history</a> or <a class="alert-link" href="exams.html">start an exam</a>.</div>`;
};

const bar = (pct) => `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
  <div class="progress-bar ${pct >= WEAK_BELOW ? '' : 'bg-danger'}" style="width:${pct}%"></div></div>`;

export function initResultPage() {
  const root = $('result');
  const r = resolveResult();
  if (!r) return missing(root);
  const syncedMistakes = addMistakeCards(r);
  const flashcardStats = getFlashcardStats();
  const q = encodeURIComponent(r.id);
  root.innerHTML = `
    ${r.autoSubmitted ? '<div class="alert alert-info"><i class="bi bi-alarm"></i> Time expired — your exam was submitted automatically.</div>' : ''}
    <div class="card mb-3"><div class="card-body">
      <div class="row align-items-center g-4">
        <div class="col-12 col-md-auto text-center"><div class="score-ring" style="--p:${r.percentage}"><span>${r.percentage}%</span></div></div>
        <div class="col">
          <h2 class="h4 mb-1">${esc(r.title)}${r.level ? ` · ${esc(levelLabel(r.level))}` : ''}</h2>
          <p class="text-muted mb-2">${esc(formatDate(r.finishedAt))} · ${esc(formatDuration(r.timeSpentSec))} used of ${Math.round(r.durationSec / 60)} min</p>
          <p class="mb-1 fs-5">Score: <strong>${r.earnedPoints} / ${r.totalPoints}</strong> points</p>
          <span class="badge ${r.passed ? 'text-bg-success' : 'text-bg-danger'} fs-6">${r.passed ? 'Met' : 'Did not meet'} practice target (${r.threshold}%)</span>
          <p class="small text-muted mt-2 mb-0">The practice target is configurable and is <strong>not</strong> an official Civil Service Commission result or passing standard.</p>
        </div>
      </div></div></div>
    <div class="row g-3 mb-3">
      ${[['Correct', r.correct, 'success'], ['Incorrect', r.incorrect, 'danger'], ['Unanswered', r.unanswered, 'secondary']].map(([l, v, c]) =>
        `<div class="col-4"><div class="card text-center"><div class="card-body py-3"><div class="stat-value text-${c}">${v}</div><div class="small text-muted">${l}</div></div></div></div>`).join('')}
    </div>
    <div class="card mb-3"><div class="card-body">
      <h3 class="h5">Performance by subject</h3>
      ${r.weighted ? '<p class="small text-muted">Each subject counts toward the total by its exam weight. Your weighted total is the sum of the points you earn per subject (maximum 100%).</p>' : ''}
      ${r.bySubject.map((s) => `<div class="mb-3"><div class="d-flex justify-content-between small mb-1">
        <span>${esc(s.label)} <span class="text-muted">(${s.correct}/${s.total} correct${r.weighted ? ` · ${s.percentage}% of subject` : ''})</span></span>
        <strong>${r.weighted ? `${s.weightedScore}% of ${s.weight}%` : `${s.percentage}%`}</strong></div>${bar(r.weighted && s.weight ? (s.weightedScore / s.weight) * 100 : s.percentage)}</div>`).join('')}
      ${r.weighted ? `<div class="d-flex justify-content-between border-top pt-2"><strong>Weighted total</strong><strong>${r.percentage}% / 100%</strong></div>` : ''}
    </div></div>
    <div class="d-flex flex-wrap gap-2">
      <a class="btn btn-primary" href="review.html?id=${q}"><i class="bi bi-search"></i> Review answers</a>
      ${flashcardStats.mistakes ? `<a class="btn btn-outline-danger" href="flashcards.html?deck=mistakes"><i class="bi bi-arrow-repeat"></i> Review My Mistakes (${flashcardStats.mistakes})</a>` : ''}
      <button class="btn btn-outline-primary" id="retakeBtn" type="button"><i class="bi bi-arrow-repeat"></i> Retake exam</button>
      <a class="btn btn-outline-secondary" href="index.html">Dashboard</a>
    </div>
    ${syncedMistakes.ok
      ? syncedMistakes.added ? `<p class="small text-success mt-3"><i class="bi bi-check-circle"></i> ${syncedMistakes.added} incorrect ${syncedMistakes.added === 1 ? 'answer is' : 'answers are'} now in your flashcard deck.</p>` : ''
      : '<div class="alert alert-danger mt-3" role="alert">Your result was saved, but incorrect answers could not be added to flashcards. Check browser storage and reload this page to retry.</div>'}`;

  $('retakeBtn').addEventListener('click', async () => {
    if (loadActive() && !confirm('An exam is in progress. Starting a retake will discard it. Continue?')) return;
    try {
      await startExam({ category: r.category, level: r.level });
      location.href = 'exam.html';
    } catch (err) {
      root.insertAdjacentHTML('afterbegin', `<div class="alert alert-danger">${esc(err.message)}</div>`);
    }
  });
}

export function initReviewPage() {
  const root = $('review');
  const r = resolveResult();
  if (!r) return missing(root);

  const weak = r.byTopic.filter((t) => t.percentage < WEAK_BELOW).sort((a, b) => a.percentage - b.percentage);
  const FILTERS = [['all', 'All'], ['incorrect', 'Incorrect'], ['unanswered', 'Unanswered'], ['correct', 'Correct'], ['marked', 'Marked']];
  const statusOf = (q) => (q.selected === null ? 'unanswered' : q.selected === q.correctIndex ? 'correct' : 'incorrect');

  root.innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div><h2 class="h4 mb-0">${esc(r.title)} — answer review</h2><div class="text-muted small">${esc(formatDate(r.finishedAt))} · ${r.percentage}%</div></div>
      <a class="btn btn-outline-primary" href="result.html?id=${encodeURIComponent(r.id)}">Back to results</a>
    </div>
    <div class="card mb-3"><div class="card-body">
      <h3 class="h5"><i class="bi bi-bullseye"></i> Weak areas</h3>
      ${weak.length ? weak.map((t) => `<div class="mb-2"><div class="d-flex justify-content-between small mb-1"><span>${esc(t.label)} <span class="text-muted">(${t.correct}/${t.total})</span></span><strong>${t.percentage}%</strong></div>${bar(t.percentage)}</div>`).join('')
        : `<p class="mb-0 text-muted">No topics below ${WEAK_BELOW}% in this attempt. Nice work!</p>`}
      <details class="mt-3"><summary class="small">All topics</summary>
        ${r.byTopic.map((t) => `<div class="small d-flex justify-content-between border-bottom py-1"><span>${esc(t.label)}</span><span>${t.correct}/${t.total} · ${t.percentage}%</span></div>`).join('')}</details>
    </div></div>
    <div class="btn-group mb-3 flex-wrap" role="group" aria-label="Filter questions" id="filters">
      ${FILTERS.map(([v, l], i) => `<button type="button" class="btn btn-outline-primary ${i === 0 ? 'active' : ''}" data-f="${v}" aria-pressed="${i === 0}">${l}</button>`).join('')}
    </div>
    <div id="reviewList"></div>`;

  const isMarked = (q) => r.marked?.includes(q.id);
  function render(filter) {
    const items = r.questions.map((q, i) => ({ q, i })).filter(({ q }) =>
      filter === 'all' || (filter === 'marked' ? isMarked(q) : statusOf(q) === filter));
    $('reviewList').innerHTML = items.length ? items.map(({ q, i }) => {
      const st = statusOf(q);
      return `<article class="card review-card ${st} mb-3"><div class="card-body">
        <div class="d-flex justify-content-between flex-wrap gap-2 mb-2">
          <span class="fw-semibold">Question ${i + 1} <span class="text-muted small">· ${esc(getCategory(q.category)?.name || q.category)} · ${esc(q.topic || '')}</span></span>
          <span>${isMarked(q) ? '<span class="badge text-bg-warning me-1">Marked</span>' : ''}<span class="badge ${st === 'correct' ? 'text-bg-success' : st === 'incorrect' ? 'text-bg-danger' : 'text-bg-secondary'}">${st}</span></span>
        </div>
        ${contextHtml(q)}<p class="q-text">${esc(q.question)}</p>
        <ul class="list-unstyled review-options">
          ${q.options.map((o, k) => {
            const isCorrect = k === q.correctIndex;
            const isPicked = k === q.selected;
            const cls = isCorrect ? 'correct' : isPicked ? 'wrong' : '';
            const tag = isCorrect ? '<span class="visually-hidden">Correct answer. </span><i class="bi bi-check-circle-fill"></i>' : isPicked ? '<span class="visually-hidden">Your answer. </span><i class="bi bi-x-circle-fill"></i>' : '';
            return `<li class="review-option ${cls}"><span class="option-letter">${String.fromCharCode(65 + k)}</span><span class="flex-grow-1">${esc(o)}</span>${isPicked ? '<small class="ms-2">Your answer</small>' : ''} ${tag}</li>`;
          }).join('')}
        </ul>
        ${q.selected === null ? '<p class="small text-muted mb-1">You did not answer this question.</p>' : ''}
        ${q.explanation ? `<div class="explanation"><strong>Explanation:</strong> ${esc(q.explanation)}</div>` : ''}
      </div></article>`;
    }).join('') : '<p class="text-muted">No questions match this filter.</p>';
  }
  render('all');
  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    $('filters').querySelectorAll('button').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    render(b.dataset.f);
  });
}

export function initHistoryPage() {
  const list = loadHistory();
  $('historyBody').innerHTML = list.length ? historyTable(list)
    : '<p class="text-muted mb-0">No completed exams yet. <a href="exams.html">Start one</a>.</p>';
  $('clearHistory').disabled = list.length === 0;
  $('clearHistory').addEventListener('click', () => {
    if (confirm('Clear all saved exam history from this browser? This cannot be undone.')) { clearHistory(); location.reload(); }
  });

  const input = $('threshold');
  input.value = loadPrefs().passThreshold;
  $('prefsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = Number(input.value);
    const msg = $('prefsMsg');
    if (!Number.isFinite(v) || v < 1 || v > 100) {
      msg.className = 'text-danger small'; msg.textContent = 'Enter a value from 1 to 100.'; return;
    }
    const ok = savePrefs({ passThreshold: v });
    msg.className = ok ? 'text-success small' : 'text-danger small';
    msg.textContent = ok ? 'Saved. Applies to exams you submit from now on.' : 'Could not save settings.';
  });
}
