import { contextHtml, esc, levelLabel } from './app.js';
import { loadActive, saveActive } from './storage.js';
import { createTimer, formatClock } from './timer.js';
import { setAnswer, toggleMark, progress, finishExam } from './exam-engine.js';

const $ = (id) => document.getElementById(id);

export function initExamPage() {
  const exam = loadActive();
  if (!exam) { location.replace('exams.html'); return; }

  const modal = new bootstrap.Modal($('submitModal'));
  let timer = null;
  let submitting = false;

  const persist = () => saveActive(exam);
  const current = () => exam.questions[exam.current];

  function submit(autoSubmitted) {
    if (submitting) return;
    submitting = true;
    timer?.stop();
    const { id, saved } = finishExam(exam, { autoSubmitted });
    if (!saved) {
      submitting = false;
      modal.hide();
      $('saveError').classList.remove('d-none');
      return;
    }
    location.replace(`result.html?id=${encodeURIComponent(id)}`);
  }

  function renderNavigator() {
    $('navigator').innerHTML = exam.questions.map((q, i) => {
      const answered = Number.isInteger(exam.answers[q.id]);
      const marked = exam.marked.includes(q.id);
      const cls = [answered ? 'answered' : 'unanswered', marked ? 'marked' : '', i === exam.current ? 'current' : ''].join(' ');
      const label = `Question ${i + 1}, ${answered ? 'answered' : 'unanswered'}${marked ? ', marked for review' : ''}`;
      return `<button type="button" class="nav-q ${cls}" data-i="${i}" aria-label="${label}" ${i === exam.current ? 'aria-current="true"' : ''}>${i + 1}</button>`;
    }).join('');
    const p = progress(exam);
    $('progressText').textContent = `${p.answered} of ${p.total} answered`;
    $('progressBar').style.width = `${(p.answered / p.total) * 100}%`;
    $('progressBar').parentElement.setAttribute('aria-valuenow', String(p.answered));
    $('progressBar').parentElement.setAttribute('aria-valuemax', String(p.total));
  }

  function renderQuestion() {
    const q = current();
    $('qCounter').textContent = `Question ${exam.current + 1} of ${exam.questions.length}`;
    $('qMeta').textContent = `${q.topic || ''}${q.difficulty ? ' · ' + q.difficulty : ''}`;
    $('qContext').innerHTML = contextHtml(q);
    $('qText').textContent = q.question;
    const selected = exam.answers[q.id];
    $('options').innerHTML = q.options.map((opt, i) => `
      <label class="option-item" for="opt-${i}">
        <input class="form-check-input" type="radio" name="answer" id="opt-${i}" value="${i}" ${selected === i ? 'checked' : ''}>
        <span class="option-letter">${String.fromCharCode(65 + i)}</span>
        <span class="option-text">${esc(opt)}</span>
      </label>`).join('');
    const marked = exam.marked.includes(q.id);
    $('markBtn').classList.toggle('active', marked);
    $('markBtn').setAttribute('aria-pressed', String(marked));
    $('markBtn').innerHTML = `<i class="bi ${marked ? 'bi-flag-fill' : 'bi-flag'}"></i> ${marked ? 'Marked for review' : 'Mark for review'}`;
    $('prevBtn').disabled = exam.current === 0;
    $('nextBtn').disabled = exam.current === exam.questions.length - 1;
    renderNavigator();
  }

  function go(i) {
    if (i < 0 || i >= exam.questions.length) return;
    exam.current = i;
    persist();
    renderQuestion();
  }

  $('examTitle').textContent = `${exam.title}${exam.level ? ' · ' + levelLabel(exam.level) : ''}`;

  $('options').addEventListener('change', (e) => {
    if (e.target.name !== 'answer') return;
    setAnswer(exam, current().id, Number(e.target.value));
    persist();
    renderNavigator();
  });
  $('clearBtn').addEventListener('click', () => {
    setAnswer(exam, current().id, null);
    persist();
    renderQuestion();
  });
  $('markBtn').addEventListener('click', () => { toggleMark(exam, current().id); persist(); renderQuestion(); });
  $('prevBtn').addEventListener('click', () => go(exam.current - 1));
  $('nextBtn').addEventListener('click', () => go(exam.current + 1));
  $('navigator').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-i]');
    if (btn) go(Number(btn.dataset.i));
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('.modal') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') go(exam.current - 1);
    if (e.key === 'ArrowRight') go(exam.current + 1);
  });

  $('submitBtn').addEventListener('click', () => {
    const p = progress(exam);
    $('submitSummary').innerHTML = `
      <ul class="list-unstyled mb-0">
        <li><strong>${p.answered}</strong> answered</li>
        <li class="${p.unanswered ? 'text-danger fw-semibold' : ''}"><strong>${p.unanswered}</strong> unanswered</li>
        <li><strong>${p.marked}</strong> marked for review</li>
      </ul>`;
    modal.show();
  });
  $('confirmSubmit').addEventListener('click', () => submit(false));

  timer = createTimer({
    deadline: exam.deadline,
    onTick: (ms) => {
      const el = $('timer');
      el.textContent = formatClock(ms);
      el.classList.toggle('timer-warning', ms < 5 * 60 * 1000);
      el.classList.toggle('timer-danger', ms < 60 * 1000);
    },
    onExpire: () => submit(true)
  });

  if (!submitting) renderQuestion();
}
