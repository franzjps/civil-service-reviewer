import { getCategory } from './app.js';

const answerOf = (exam, q) => {
  const a = exam.answers[q.id];
  return Number.isInteger(a) && a >= 0 && a < q.options.length ? a : null;
};

function group(items, keyFn) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return map;
}

function summarize(label, rows) {
  const totalPoints = rows.reduce((s, r) => s + r.points, 0);
  const earned = rows.reduce((s, r) => s + r.earned, 0);
  return {
    label,
    total: rows.length,
    correct: rows.filter((r) => r.status === 'correct').length,
    incorrect: rows.filter((r) => r.status === 'incorrect').length,
    unanswered: rows.filter((r) => r.status === 'unanswered').length,
    totalPoints,
    earnedPoints: earned,
    percentage: totalPoints ? Math.round((earned / totalPoints) * 1000) / 10 : 0
  };
}

export function scoreExam(exam, threshold, { finishedAt = Date.now(), autoSubmitted = false } = {}) {
  const rows = exam.questions.map((q) => {
    const selected = answerOf(exam, q);
    const points = Number(q.points) > 0 ? Number(q.points) : 1;
    const status = selected === null ? 'unanswered' : selected === q.correctIndex ? 'correct' : 'incorrect';
    return { q, selected, points, status, earned: status === 'correct' ? points : 0 };
  });

  const overall = summarize('Overall', rows);
  const bySubject = [...group(rows, (r) => r.q.category)].map(([cat, list]) => ({
    category: cat,
    ...summarize(getCategory(cat)?.name || cat, list)
  }));
  const byTopic = [...group(rows, (r) => r.q.topic || 'General')].map(([t, list]) => summarize(t, list));

  return {
    id: exam.id,
    title: exam.title,
    category: exam.category,
    level: exam.level,
    startedAt: exam.startedAt,
    finishedAt,
    durationSec: exam.durationSec,
    timeSpentSec: Math.min(exam.durationSec, Math.max(0, Math.round((finishedAt - exam.startedAt) / 1000))),
    autoSubmitted,
    threshold,
    totalQuestions: overall.total,
    correct: overall.correct,
    incorrect: overall.incorrect,
    unanswered: overall.unanswered,
    totalPoints: overall.totalPoints,
    earnedPoints: overall.earnedPoints,
    percentage: overall.percentage,
    passed: overall.percentage >= threshold,
    bySubject,
    byTopic,
    marked: exam.marked,
    questions: rows.map((r) => ({ ...r.q, selected: r.selected }))
  };
}
