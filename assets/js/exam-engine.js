import { SUBJECT_WEIGHTS, loadPool, getCategory, questionLimitFor, examDurationMinutes } from './app.js';
import { saveActive, clearActive, addResult, loadPrefs } from './storage.js';
import { scoreExam } from './scoring.js';

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shuffles options while tracking where the correct answer ends up.
export function prepareQuestion(q) {
  const order = shuffle(q.options.map((text, originalIndex) => ({ text, originalIndex })));
  return {
    id: q.id,
    category: q.category,
    topic: q.topic,
    difficulty: q.difficulty,
    question: q.question,
    instruction: q.instruction,
    passage: q.passage,
    image: q.image,
    options: order.map((o) => o.text),
    correctIndex: order.findIndex((o) => o.originalIndex === q.correctAnswer),
    explanation: q.explanation || '',
    points: q.points
  };
}

// Picks questions per subject by weight (largest-remainder rounding), topping up from leftovers if a subject runs short.
function pickWeighted(pool, level, limit) {
  const weights = SUBJECT_WEIGHTS[level];
  if (!weights) return shuffle(pool).slice(0, limit);
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const shares = Object.entries(weights).map(([cat, w]) => {
    const exact = (limit * w) / total;
    return { cat, n: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let rest = limit - shares.reduce((a, s) => a + s.n, 0);
  [...shares].sort((a, b) => b.frac - a.frac).forEach((s) => { if (rest-- > 0) s.n += 1; });
  const chosen = [];
  const left = [];
  for (const { cat, n } of shares) {
    const items = shuffle(pool.filter((q) => q.category === cat));
    chosen.push(...items.slice(0, n));
    left.push(...items.slice(n));
  }
  chosen.push(...shuffle(left).slice(0, limit - chosen.length));
  return shuffle(chosen);
}

export async function buildExam({ category, level }) {
  const cat = getCategory(category);
  if (!cat) throw new Error('Unknown exam category.');
  const lvl = cat.hasLevels ? level : null;
  const pool = await loadPool(category, lvl);
  if (!pool.length) throw new Error('No questions are available for this selection.');
  const limit = questionLimitFor(category);
  const isFullMock = category === 'full-mock' || category === 'full-subprofessional-mock';
  const picked = isFullMock ? pool.slice(0, limit)
    : category === 'mixed' ? pickWeighted(pool, level, limit) : shuffle(pool).slice(0, limit);
  const questions = picked.map(prepareQuestion);
  const durationSec = examDurationMinutes(category, questions.length) * 60;
  const startedAt = Date.now();
  return {
    id: `exam-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: cat.name,
    category,
    level: lvl,
    startedAt,
    durationSec,
    deadline: startedAt + durationSec * 1000,
    questions,
    answers: {},
    marked: [],
    current: 0
  };
}

export async function startExam(config) {
  const exam = await buildExam(config);
  if (!saveActive(exam)) throw new Error('Could not save the exam in this browser (is local storage disabled or full?).');
  return exam;
}

export function setAnswer(exam, qid, index) {
  const q = exam.questions.find((x) => x.id === qid);
  if (!q) return;
  if (Number.isInteger(index) && index >= 0 && index < q.options.length) exam.answers[qid] = index;
  else delete exam.answers[qid];
}

export function toggleMark(exam, qid) {
  const i = exam.marked.indexOf(qid);
  if (i >= 0) exam.marked.splice(i, 1); else exam.marked.push(qid);
}

export function progress(exam) {
  const answered = exam.questions.filter((q) => Number.isInteger(exam.answers[q.id])).length;
  return { answered, unanswered: exam.questions.length - answered, marked: exam.marked.length, total: exam.questions.length };
}

export function finishExam(exam, { autoSubmitted = false } = {}) {
  const finishedAt = Math.min(Date.now(), exam.deadline);
  const result = scoreExam(exam, loadPrefs().passThreshold, { finishedAt, autoSubmitted });
  const saved = addResult(result);
  if (saved) clearActive();
  return { id: result.id, saved };
}
