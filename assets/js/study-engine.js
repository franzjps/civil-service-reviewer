// Learning logic for the Review tab: diagnostic, spaced repetition, adaptive picking, mastery tiers.
const MIN = 60000;
const DAY = 24 * 60 * MIN;

export const TIERS = [
  { n: 1, name: 'Foundation' },
  { n: 2, name: 'Intermediate' },
  { n: 3, name: 'Advanced' },
  { n: 4, name: 'Challenge' }
];
// Leitner boxes: index = box. Box 0 is unseen, box 6 is the longest interval.
export const INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
export const MASTERED_BOX = 5;
export const ADVANCE_WINDOW = 6;
export const ADVANCE_ACCURACY = 0.8;
export const SESSION_SIZE = 10;
export const DIAGNOSTIC_PER_SKILL = 3;

export const emptyState = () => ({ v: 1, diagnostic: null, items: {}, skills: {}, tier: 1, tierHist: [], answered: 0 });

export function normalizeState(s) {
  const base = emptyState();
  if (!s || typeof s !== 'object') return base;
  return {
    ...base, ...s,
    items: s.items && typeof s.items === 'object' ? s.items : {},
    skills: s.skills && typeof s.skills === 'object' ? s.skills : {},
    tierHist: Array.isArray(s.tierHist) ? s.tierHist : [],
    tier: Number.isInteger(s.tier) && s.tier >= 1 && s.tier <= TIERS.length ? s.tier : 1
  };
}

export const skillsOf = (pool) => [...new Set(pool.map((q) => q.skill))];

// Smoothed so one lucky or unlucky answer doesn't swing a skill from 0 to 100%.
export function skillAccuracy(state, skill) {
  const s = state.skills[skill];
  return ((s?.c || 0) + 1) / ((s?.t || 0) + 2);
}

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function record(state, q, correct, now = Date.now()) {
  const it = state.items[q.id] || { box: 0, seen: 0, right: 0, wrong: 0, due: now };
  it.seen += 1;
  if (correct) {
    it.right += 1;
    it.box = it.box === 0 ? 2 : Math.min(INTERVALS.length - 1, it.box + 1);
  } else {
    it.wrong += 1;
    it.box = 1;
  }
  it.due = now + INTERVALS[it.box];
  it.last = now;
  state.items[q.id] = it;

  const sk = state.skills[q.skill] || { c: 0, t: 0 };
  sk.t += 1;
  if (correct) sk.c += 1;
  state.skills[q.skill] = sk;
  state.answered += 1;

  let advanced = false;
  if (q.tier === state.tier) {
    state.tierHist.push(correct ? 1 : 0);
    state.tierHist = state.tierHist.slice(-ADVANCE_WINDOW);
    if (state.tier < TIERS.length && tierAccuracy(state) >= ADVANCE_ACCURACY && state.tierHist.length >= ADVANCE_WINDOW) {
      state.tier += 1;
      state.tierHist = [];
      advanced = true;
    }
  }
  return { advanced, box: it.box };
}

export function tierAccuracy(state) {
  const h = state.tierHist;
  return h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
}

// Up to DIAGNOSTIC_PER_SKILL questions per skill, spread across the difficulty tiers.
export function diagnosticSet(pool, rng = Math.random) {
  const picked = [];
  for (const skill of skillsOf(pool)) {
    const items = pool.filter((q) => q.skill === skill).sort((a, b) => a.tier - b.tier || rng() - 0.5);
    const n = Math.min(DIAGNOSTIC_PER_SKILL, items.length);
    const idx = new Set();
    for (let i = 0; i < n; i++) idx.add(n === 1 ? 0 : Math.round((i * (items.length - 1)) / (n - 1)));
    for (let i = 0; idx.size < n; i++) idx.add(i);
    idx.forEach((i) => picked.push(items[i]));
  }
  return shuffle(picked, rng);
}

export function applyDiagnostic(state, results, now = Date.now()) {
  const bySkill = {};
  results.forEach(({ q, correct }) => {
    record(state, q, correct, now);
    const b = bySkill[q.skill] || (bySkill[q.skill] = { c: 0, t: 0 });
    b.t += 1;
    if (correct) b.c += 1;
  });
  const total = results.length;
  const right = results.filter((r) => r.correct).length;
  const accuracy = total ? right / total : 0;
  state.tier = accuracy >= 0.85 ? 3 : accuracy >= 0.6 ? 2 : 1;
  state.tierHist = [];
  const ranked = Object.entries(bySkill)
    .map(([skill, v]) => ({ skill, ...v, accuracy: v.c / v.t }))
    .sort((a, b) => a.accuracy - b.accuracy || a.skill.localeCompare(b.skill));
  state.diagnostic = { at: now, total, right, accuracy, ranked, startTier: state.tier };
  return state.diagnostic;
}

export const isDue = (state, q, now = Date.now()) => {
  const it = state.items[q.id];
  return !!it && it.due <= now;
};

export function counts(state, pool, now = Date.now()) {
  let due = 0, fresh = 0, mastered = 0, learning = 0;
  pool.forEach((q) => {
    const it = state.items[q.id];
    if (!it) fresh += 1;
    else if (it.box >= MASTERED_BOX) { mastered += 1; if (it.due <= now) due += 1; }
    else { learning += 1; if (it.due <= now) due += 1; }
  });
  return { due, fresh, mastered, learning, total: pool.length };
}

export function nextDueAt(state, pool) {
  const times = pool.map((q) => state.items[q.id]?.due).filter(Number.isFinite);
  return times.length ? Math.min(...times) : null;
}

// Due items first (most overdue first), then new items weighted toward weak skills at the unlocked tier,
// then extra practice on whatever is closest to being due.
export function buildSession(state, pool, size = SESSION_SIZE, now = Date.now(), rng = Math.random) {
  const chosen = [];
  const taken = new Set();
  const take = (q) => { chosen.push(q); taken.add(q.id); };

  pool.filter((q) => isDue(state, q, now))
    .sort((a, b) => state.items[a.id].due - state.items[b.id].due)
    .slice(0, size)
    .forEach(take);

  while (chosen.length < size) {
    const fresh = pool.filter((q) => !state.items[q.id] && !taken.has(q.id) && q.tier <= state.tier);
    if (!fresh.length) break;
    const bySkill = new Map();
    fresh.forEach((q) => bySkill.set(q.skill, [...(bySkill.get(q.skill) || []), q]));
    const weights = [...bySkill.keys()].map((s) => 0.15 + (1 - skillAccuracy(state, s)));
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    let skill = [...bySkill.keys()].at(-1);
    [...bySkill.keys()].some((s, i) => { r -= weights[i]; if (r <= 0) { skill = s; return true; } return false; });
    const cands = bySkill.get(skill);
    const top = Math.max(...cands.map((q) => q.tier));
    const best = cands.filter((q) => q.tier === top);
    take(best[Math.floor(rng() * best.length)]);
  }

  if (chosen.length < size) {
    pool.filter((q) => !taken.has(q.id) && state.items[q.id] && q.tier <= state.tier)
      .sort((a, b) => (state.items[a.id].box >= MASTERED_BOX) - (state.items[b.id].box >= MASTERED_BOX) || state.items[a.id].due - state.items[b.id].due)
      .slice(0, size - chosen.length)
      .forEach(take);
  }
  return shuffle(chosen, rng);
}

export function similarTo(state, pool, q, excludeIds = [], rng = Math.random) {
  const ex = new Set([q.id, ...excludeIds]);
  const same = pool.filter((x) => x.skill === q.skill && !ex.has(x.id));
  if (!same.length) return null;
  const score = (x) => (state.items[x.id] ? 10 : 0) + Math.abs(x.tier - q.tier) * 2 + rng();
  return same.sort((a, b) => score(a) - score(b))[0];
}

export function dueLabel(ts, now = Date.now()) {
  const d = ts - now;
  if (d <= 0) return 'now';
  if (d < 60 * MIN) return `in ${Math.max(1, Math.round(d / MIN))} min`;
  if (d < DAY) return `in ${Math.round(d / (60 * MIN))} h`;
  return `in ${Math.round(d / DAY)} day${Math.round(d / DAY) === 1 ? '' : 's'}`;
}
