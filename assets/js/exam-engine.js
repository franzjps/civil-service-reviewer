import { loadPool, getCategory, questionLimitFor, examDurationMinutes } from './app.js';
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
    options: order.map((o) => o.text),
    correctIndex: order.findIndex((o) => o.originalIndex === q.correctAnswer),
    explanation: q.explanation || '',
    points: q.points
  };
}

export async function buildExam({ category, level }) {
  const cat = getCategory(category);
  if (!cat) throw new Error('Unknown exam category.');
  const lvl = cat.hasLevels ? level : null;
  const pool = await loadPool(category, lvl);
  if (!pool.length) throw new Error('No questions are available for this selection.');
  const questions = shuffle(pool).slice(0, questionLimitFor(category)).map(prepareQuestion);
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
