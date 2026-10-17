import { loadActive } from './storage.js';

export const CATEGORIES = [
  { id: 'verbal', name: 'Verbal Ability', file: 'verbal.json', icon: 'bi-chat-square-text', hasLevels: true,
    description: 'Vocabulary, grammar, paragraph organization and reading comprehension.' },
  { id: 'numerical', name: 'Numerical Ability', file: 'numerical.json', icon: 'bi-calculator', hasLevels: true,
    description: 'Numerical reasoning, arithmetic, percentages, fractions and number series.' },
  { id: 'analytical', name: 'Analytical Ability', file: 'analytical.json',   icon: 'bi-diagram-3', hasLevels: true, levels: ['professional'],
      description: 'Analogy and logical reasoning. Professional level only.' },
    { id: 'clerical', name: 'Clerical Ability', file: 'clerical.json', icon: 'bi-folder2-open', hasLevels: true, levels: ['subprofessional'],
      description: 'Spelling, alphabetizing, filing and clerical operations. Subprofessional level only.' },
  { id: 'general-information', name: 'General Information', file: 'general-information.json', icon: 'bi-globe-asia-australia', hasLevels: true,
    description: 'Constitution, government, laws, history and geography.' }
];
export const MIXED = { id: 'mixed', name: 'Mixed (All Subjects)', icon: 'bi-collection', hasLevels: true,
  description: 'A combined mock exam drawing from every subject.' };
export const FULL_MOCK = { id: 'full-mock', name: 'Full Professional Mock Exam', file: 'full-mock.json',
  icon: 'bi-journal-check', hasLevels: false,   questionLimit: 148, durationMinutes: 190,
    description: 'A complete 148-question Professional mock exam covering verbal, analytical, numerical and general information.' };
export const FULL_SUBPROFESSIONAL_MOCK = { id: 'full-subprofessional-mock', name: 'Full Subprofessional Mock Exam', file: 'full-subprofessional-mock.json',
  icon: 'bi-journal-check', hasLevels: false,   questionLimit: 143, durationMinutes: 160,
    description: 'A complete 143-question Subprofessional mock exam covering verbal, clerical, numerical and general information.' };
export const levelsFor = (cat) => cat?.levels || Object.keys(LEVELS);
export const SUBJECT_WEIGHTS = {
  professional: { verbal: 30, analytical: 35, numerical: 30, 'general-information': 5 },
  subprofessional: { verbal: 30, clerical: 35, numerical: 30, 'general-information': 5 }
};
export const FULL_MOCK_LEVELS = { 'full-mock': 'professional', 'full-subprofessional-mock': 'subprofessional' };
export const LEVELS = { professional: 'Professional', subprofessional: 'Subprofessional' };
export const MAX_QUESTIONS = 20;
const MINUTES_PER_QUESTION = 1.5;

export const getCategory = (id) => {
  if (id === MIXED.id) return MIXED;
  if (id === FULL_MOCK.id) return FULL_MOCK;
  if (id === FULL_SUBPROFESSIONAL_MOCK.id) return FULL_SUBPROFESSIONAL_MOCK;
  return CATEGORIES.find((c) => c.id === id) || null;
};
export const questionLimitFor = (id) => getCategory(id)?.questionLimit || MAX_QUESTIONS;
export const levelLabel = (l) => LEVELS[l] || 'All levels';
export const minutesFor = (n) => Math.ceil(n * MINUTES_PER_QUESTION);
export const examDurationMinutes = (id, questionCount) => getCategory(id)?.durationMinutes || minutesFor(questionCount);

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const formatDate = (ts) => new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
export function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
// Shared markup for a question's directions, reading passage and image.
export function contextHtml(q) {
  const img = typeof q.image === 'string' && /^assets\/img\/[\w.-]+$/.test(q.image) ? q.image : '';
  return `${q.passage ? `<div class="q-passage border rounded p-3 mb-3 bg-body-tertiary small">${esc(q.passage)}</div>` : ''}` +
    `${img ? `<img class="img-fluid rounded border mb-3" src="${img}" alt="Graph for this question">` : ''}`;
}
export const params = () => new URLSearchParams(location.search);

function isValidQuestion(q) {
  return q && typeof q.id === 'string' && typeof q.question === 'string' && Array.isArray(q.options) &&
    q.options.length >= 2 && Number.isInteger(q.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer < q.options.length;
}

const bankCache = new Map();
export async function loadBank(id) {
  if (bankCache.has(id)) return bankCache.get(id);
  const cat = getCategory(id);
  if (!cat || !cat.file) throw new Error(`Unknown category: ${id}`);
  const res = await fetch(`data/${cat.file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${cat.file} (HTTP ${res.status}).`);
  const data = await res.json();
  const list = (Array.isArray(data) ? data : data.questions || []).filter(isValidQuestion);
  bankCache.set(id, list);
  return list;
}

export async function loadPool(categoryId, level) {
  const ids = categoryId === 'mixed' ? CATEGORIES.map((c) => c.id) : [categoryId];
  const banks = await Promise.all(ids.map(loadBank));
  return banks.flat().filter((q) => q.level === 'all' || !level || q.level === level);
}

export function showError(container, error) {
  const hint = location.protocol === 'file:'
    ? ' This app loads JSON and ES modules, so it must be served over HTTP (e.g. run "python -m http.server" in the project folder).'
    : '';
  container.innerHTML = `<div class="alert alert-danger" role="alert">${esc(error.message || error)}${hint}</div>`;
}

const NAV = [
  { page: 'dashboard', href: 'index.html', label: 'Dashboard', icon: 'bi-speedometer2' },
  { page: 'exams', href: 'exams.html', label: 'Examinations', icon: 'bi-journal-check' },
  { page: 'flashcards', href: 'flashcards.html', label: 'Flashcards', icon: 'bi-card-text' },
  { page: 'history', href: 'history.html', label: 'History & Settings', icon: 'bi-clock-history' }
];

function renderShell() {
  const side = document.getElementById('sidebar');
  if (!side) return;
  const current = document.body.dataset.nav || document.body.dataset.page;
  const active = loadActive();
  side.innerHTML = `
    <a class="brand" href="index.html"><i class="bi bi-mortarboard-fill"></i><span>CSE Reviewer</span></a>
    <nav aria-label="Main navigation" class="nav flex-column gap-1">
      ${NAV.map((n) => `<a class="nav-link ${n.page === current ? 'active' : ''}" ${n.page === current ? 'aria-current="page"' : ''} href="${n.href}"><i class="bi ${n.icon}"></i> ${n.label}</a>`).join('')}
      ${active ? '<a class="nav-link resume" href="exam.html"><i class="bi bi-play-circle-fill"></i> Resume exam</a>' : ''}
    </nav>
    <p class="sidebar-note">Unofficial practice tool. Not affiliated with the Civil Service Commission.</p>`;

  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  document.body.appendChild(backdrop);
  const toggle = document.getElementById('menuToggle');
  const setOpen = (open) => {
    document.body.classList.toggle('sidebar-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
  };
  toggle?.addEventListener('click', () => setOpen(!document.body.classList.contains('sidebar-open')));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
}

const PAGES = {
  dashboard: ['./dashboard.js', 'initDashboard'],
  exams: ['./dashboard.js', 'initExamsPage'],
  flashcards: ['./flashcards.js', 'initFlashcardsPage'],
  instructions: ['./dashboard.js', 'initInstructionsPage'],
  exam: ['./exam-ui.js', 'initExamPage'],
  result: ['./results.js', 'initResultPage'],
  review: ['./results.js', 'initReviewPage'],
  history: ['./results.js', 'initHistoryPage']
};

async function boot() {
  renderShell();
  const entry = PAGES[document.body.dataset.page];
  if (!entry) return;
  try {
    const mod = await import(entry[0]);
    await mod[entry[1]]();
  } catch (err) {
    console.error(err);
    const main = document.getElementById('main') || document.body;
    showError(main, err);
  }
}

boot();
