const KEYS = {
  active: 'csr.activeExam.v1',
  history: 'csr.history.v1',
  prefs: 'csr.prefs.v1'
};
const MAX_HISTORY = 50;
export const DEFAULT_PREFS = { passThreshold: 80 };

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function isValidQuestion(q) {
  return isObj(q) && typeof q.id === 'string' && typeof q.question === 'string' &&
    Array.isArray(q.options) && q.options.length >= 2 &&
    Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length;
}

function isValidActive(s) {
  return isObj(s) && typeof s.id === 'string' && Number.isFinite(s.deadline) &&
    Array.isArray(s.questions) && s.questions.length > 0 && s.questions.every(isValidQuestion) &&
    isObj(s.answers) && Array.isArray(s.marked);
}

function isValidResult(r) {
  return isObj(r) && typeof r.id === 'string' && Number.isFinite(r.finishedAt) &&
    Number.isFinite(r.percentage) && Array.isArray(r.questions) && r.questions.every(isValidQuestion);
}

export function loadActive() {
  const s = read(KEYS.active, null);
  if (s === null) return null;
  if (!isValidActive(s)) { remove(KEYS.active); return null; }
  s.current = Number.isInteger(s.current) && s.current >= 0 && s.current < s.questions.length ? s.current : 0;
  return s;
}
export const saveActive = (exam) => write(KEYS.active, exam);
export const clearActive = () => remove(KEYS.active);

export function loadHistory() {
  const list = read(KEYS.history, []);
  return Array.isArray(list) ? list.filter(isValidResult).sort((a, b) => b.finishedAt - a.finishedAt) : [];
}

export function addResult(result) {
  const list = loadHistory().filter((r) => r.id !== result.id);
  list.unshift(result);
  return write(KEYS.history, list.slice(0, MAX_HISTORY));
}

export const getResult = (id) => loadHistory().find((r) => r.id === id) || null;
export const clearHistory = () => remove(KEYS.history);

export function loadPrefs() {
  const p = read(KEYS.prefs, {});
  const t = isObj(p) ? Number(p.passThreshold) : NaN;
  return { ...DEFAULT_PREFS, passThreshold: Number.isFinite(t) && t >= 1 && t <= 100 ? t : DEFAULT_PREFS.passThreshold };
}
export const savePrefs = (prefs) => write(KEYS.prefs, prefs);
