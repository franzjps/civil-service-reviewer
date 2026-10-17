const KEY = 'csr.flashcards.v1';
export const DEFAULT_DAILY_GOAL = 10;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const todayKey = (time = Date.now()) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function emptyState() {
  return {
    cards: [],
    goal: DEFAULT_DAILY_GOAL,
    xp: 0,
    today: todayKey(),
    reviewedToday: 0,
    streak: 0,
    lastReviewDate: '',
    achievements: [],
    totalReviews: 0
  };
}

function readState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    if (!isObject(data) || !Array.isArray(data.cards)) return emptyState();
    const state = emptyState();
    state.cards = data.cards.filter((card) => isObject(card) && typeof card.id === 'string' &&
      typeof card.question === 'string' && typeof card.answer === 'string' &&
      Number.isFinite(card.dueAt) && Number.isFinite(card.easeFactor) &&
      Number.isInteger(card.repetitions) && Array.isArray(card.history));
    state.goal = Number.isInteger(data.goal) && data.goal >= 1 && data.goal <= 100 ? data.goal : state.goal;
    state.xp = Number.isFinite(data.xp) && data.xp >= 0 ? data.xp : 0;
    state.today = typeof data.today === 'string' ? data.today : state.today;
    state.reviewedToday = Number.isInteger(data.reviewedToday) && data.reviewedToday >= 0 ? data.reviewedToday : 0;
    state.streak = Number.isInteger(data.streak) && data.streak >= 0 ? data.streak : 0;
    state.lastReviewDate = typeof data.lastReviewDate === 'string' ? data.lastReviewDate : '';
    state.achievements = Array.isArray(data.achievements) ? data.achievements.filter((id) => typeof id === 'string') : [];
    state.totalReviews = Number.isInteger(data.totalReviews) && data.totalReviews >= 0 ? data.totalReviews : 0;
    const today = todayKey();
    if (state.today !== today) {
      state.today = today;
      state.reviewedToday = 0;
    }
    return state;
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function addMistakeCards(result) {
  const state = readState();
  const existing = new Set(state.cards.map((card) => card.id));
  let added = 0;
  for (const question of result.questions || []) {
    if (question.selected === null || question.selected === question.correctIndex) continue;
    const id = `mistake:${result.id}:${question.id}`;
    if (existing.has(id)) continue;
    const answer = question.options[question.correctIndex];
    if (typeof answer !== 'string') continue;
    state.cards.push({
      id,
      source: 'mistake',
      sourceExamId: result.id,
      questionId: question.id,
      category: question.category || 'general',
      topic: question.topic || 'General',
      question: question.question,
      instruction: question.instruction,
      passage: question.passage,
      image: question.image,
      options: question.options,
      selectedAnswer: typeof question.options[question.selected] === 'string' ? question.options[question.selected] : '',
      answer,
      explanation: question.explanation || '',
      createdAt: result.finishedAt,
      dueAt: Date.now(),
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lapses: 0,
      lastReviewedAt: null,
      history: []
    });
    existing.add(id);
    added += 1;
  }
  return { ok: added === 0 || saveState(state), added };
}

export function getFlashcards() {
  return readState().cards;
}

export function getFlashcardStats(now = Date.now()) {
  const state = readState();
  const due = state.cards.filter((card) => card.dueAt <= now);
  const mastered = state.cards.filter((card) => card.repetitions >= 3 && card.intervalDays >= 7);
  const today = todayKey(now);
  const yesterday = todayKey(now - 86400000);
  const topicMap = new Map();
  for (const card of state.cards) {
    const key = card.topic || 'General';
    const topic = topicMap.get(key) || { topic: key, reviewed: 0, score: 0, due: 0, cards: 0 };
    topic.cards += 1;
    if (card.dueAt <= now) topic.due += 1;
    for (const review of card.history) {
      topic.reviewed += 1;
      topic.score += review.rating === 'again' ? 0 : review.rating === 'hard' ? 0.5 : review.rating === 'good' ? 1 : 1;
    }
    topicMap.set(key, topic);
  }
  const topics = [...topicMap.values()].map((topic) => ({
    ...topic,
    mastery: topic.reviewed ? Math.round((topic.score / topic.reviewed) * 100) : 0
  })).sort((a, b) => a.mastery - b.mastery || b.due - a.due || a.topic.localeCompare(b.topic));
  return {
    due: due.length,
    total: state.cards.length,
    mistakes: state.cards.filter((card) => card.source === 'mistake').length,
    mastered: mastered.length,
    xp: state.xp,
    goal: state.goal,
    reviewedToday: state.today === todayKey(now) ? state.reviewedToday : 0,
    streak: state.lastReviewDate === today || state.lastReviewDate === yesterday ? state.streak : 0,
    achievements: state.achievements,
    totalReviews: state.totalReviews,
    topics
  };
}

export function saveDailyGoal(goal) {
  if (!Number.isInteger(goal) || goal < 1 || goal > 100) return false;
  const state = readState();
  state.goal = goal;
  return saveState(state);
}

function awardAchievements(state) {
  const rules = [
    ['first-review', state.totalReviews >= 1],
    ['ten-reviews', state.totalReviews >= 10],
    ['first-master', state.cards.some((card) => card.repetitions >= 3 && card.intervalDays >= 7)],
    ['three-day-streak', state.streak >= 3],
    ['hundred-xp', state.xp >= 100],
    ['daily-goal', state.reviewedToday >= state.goal]
  ];
  const before = new Set(state.achievements);
  state.achievements = [...new Set([...state.achievements, ...rules.filter(([, unlocked]) => unlocked).map(([id]) => id)])];
  return state.achievements.filter((id) => !before.has(id));
}

export function rateFlashcard(cardId, rating, now = Date.now()) {
  const intervals = { again: 10 / 1440, hard: 1, good: 3, easy: 7 };
  if (!(rating in intervals)) return { ok: false, error: 'Choose Again, Hard, Good, or Easy.' };
  const state = readState();
  const card = state.cards.find((item) => item.id === cardId);
  if (!card) return { ok: false, error: 'This flashcard could not be found.' };

  const today = todayKey(now);
  if (state.today !== today) {
    state.today = today;
    state.reviewedToday = 0;
  }
  const yesterday = todayKey(now - 86400000);
  if (state.lastReviewDate !== today) {
    state.streak = state.lastReviewDate === yesterday ? state.streak + 1 : 1;
    state.lastReviewDate = today;
  }

  if (rating === 'again') {
    card.repetitions = 0;
    card.lapses += 1;
    card.intervalDays = intervals.again;
  } else {
    card.repetitions += 1;
    const base = rating === 'hard' ? 1 : rating === 'easy' ? 7 : 3;
    card.intervalDays = card.repetitions === 1 ? base : Math.max(base, Math.round(card.intervalDays * card.easeFactor * (rating === 'hard' ? 0.8 : rating === 'easy' ? 1.3 : 1)));
  }
  if (rating === 'hard') card.easeFactor = Math.max(1.3, card.easeFactor - 0.15);
  if (rating === 'easy') card.easeFactor += 0.15;
  card.dueAt = now + card.intervalDays * 86400000;
  card.lastReviewedAt = now;
  card.history.push({ rating, at: now });
  card.history = card.history.slice(-30);

  state.reviewedToday += 1;
  state.totalReviews += 1;
  state.xp += { again: 2, hard: 4, good: 6, easy: 8 }[rating];
  const newlyUnlocked = awardAchievements(state);
  if (!saveState(state)) return { ok: false, error: 'Could not save flashcard progress in this browser.' };
  return { ok: true, card, stats: getFlashcardStats(now), newlyUnlocked };
}
