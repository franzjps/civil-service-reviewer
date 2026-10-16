import { esc, params, getCategory } from './app.js';
import { getFlashcards, getFlashcardStats, rateFlashcard, saveDailyGoal } from './flashcard-storage.js';

const $ = (id) => document.getElementById(id);
const ACHIEVEMENTS = [
  ['first-review', 'First steps', 'Review your first card.'],
  ['ten-reviews', 'Getting consistent', 'Review 10 flashcards.'],
  ['first-master', 'Topic mastered', 'Master a card with spaced repetition.'],
  ['three-day-streak', 'Three-day streak', 'Review on three consecutive days.'],
  ['hundred-xp', 'Century club', 'Earn 100 XP.'],
  ['daily-goal', 'Daily goal', 'Reach your daily review goal.']
];
const RATING_LABELS = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };
const RATING_DELAYS = { again: '10 min', hard: '1 day', good: '3 days', easy: '7 days' };

function topicAnalytics(stats) {
  if (!stats.topics.length) return '<p class="text-muted mb-0">Review some cards to see mastery and weak-topic analytics.</p>';
  return stats.topics.map((topic) => `
    <div class="topic-row mb-2">
      <span class="small text-truncate" title="${esc(topic.topic)}">${esc(topic.topic)}</span>
      <div class="progress" role="progressbar" aria-label="${esc(topic.topic)} mastery" aria-valuenow="${topic.mastery}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-bar ${topic.mastery < 60 ? 'bg-danger' : topic.mastery < 80 ? 'bg-warning' : 'bg-success'}" style="width:${topic.mastery}%"></div>
      </div>
      <span class="small text-end">${topic.reviewed ? `${topic.mastery}%` : 'New'}</span>
    </div>`).join('');
}

function renderStats(stats) {
  const deckSelect = $('deckSelect');
  if (deckSelect) {
    deckSelect.options[0].textContent = `Due today (${stats.due})`;
    deckSelect.options[1].textContent = `Review My Mistakes (${stats.mistakes})`;
    deckSelect.options[2].textContent = `All cards (${stats.total})`;
  }
  $('reviewStats').innerHTML = [
    ['Due today', stats.due, 'bi-calendar-check'],
    ['Mastered', `${stats.mastered}/${stats.total}`, 'bi-patch-check'],
    ['XP', stats.xp, 'bi-stars'],
    ['Day streak', stats.streak, 'bi-fire']
  ].map(([label, value, icon]) => `
    <div class="col-6 col-lg-3"><div class="card h-100"><div class="card-body d-flex align-items-center gap-3">
      <div class="stat-icon"><i class="bi ${icon}"></i></div><div><div class="stat-value">${value}</div><div class="small text-muted">${label}</div></div>
          </div></div></div>`).join('');
  $('goalText').textContent = `${Math.min(stats.reviewedToday, stats.goal)} / ${stats.goal} cards today`;
  $('goalBar').style.width = `${Math.min(100, (stats.reviewedToday / stats.goal) * 100)}%`;
  $('goalBar').parentElement.setAttribute('aria-valuenow', String(Math.min(stats.reviewedToday, stats.goal)));
  $('goalInput').value = stats.goal;
  $('weakTopics').innerHTML = topicAnalytics(stats);
  $('achievementList').innerHTML = ACHIEVEMENTS.map(([id, title, description]) => {
    const unlocked = stats.achievements.includes(id);
    return `<div class="col-6 col-md-4"><div class="achievement-item ${unlocked ? '' : 'locked'}">
      <div class="fw-semibold"><i class="bi ${unlocked ? 'bi-award-fill text-warning' : 'bi-lock'}"></i> ${title}</div>
      <div class="small text-muted">${description}</div>${unlocked ? '<span class="badge text-bg-success mt-2">Unlocked</span>' : ''}</div></div>`;
  }).join('');
}

export function initFlashcardsPage() {
  const root = $('flashcards');
  const stats = getFlashcardStats();
  const requestedDeck = params().get('deck');
  let deck = ['mistakes', 'all'].includes(requestedDeck) ? requestedDeck : 'due';
  let queue = [];
  let position = 0;

  root.innerHTML = `
    <section class="mb-4">
      <h2 class="h3 mb-1">Review and remember</h2>
      <p class="text-muted mb-0">Flip a card to reveal the answer, then rate how well you knew it. Reviews are saved in this browser.</p>
    </section>
    <section class="row g-3 mb-3" id="reviewStats" aria-label="Flashcard progress"></section>
    <section class="card mb-3"><div class="card-body">
      <div class="d-flex flex-wrap justify-content-between gap-2 align-items-center mb-2">
        <h2 class="h5 mb-0">Daily goal</h2><span id="goalText" class="small text-muted"></span>
      </div>
      <div class="progress mb-3" role="progressbar" aria-label="Daily flashcard goal" aria-valuemin="0" aria-valuemax="${stats.goal}" aria-valuenow="0"><div class="progress-bar" id="goalBar"></div></div>
      <form id="goalForm" class="d-flex flex-wrap align-items-end gap-2">
        <div><label for="goalInput" class="form-label small mb-1">Cards per day</label><input id="goalInput" class="form-control" type="number" min="1" max="100" required></div>
        <button class="btn btn-outline-primary" type="submit">Save goal</button><span id="goalMessage" class="small" role="status"></span>
      </form>
    </div></section>
    <section class="card mb-3"><div class="card-body">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h2 class="h5 mb-0">Flashcard session</h2>
        <label class="d-flex align-items-center gap-2 small">Deck
          <select id="deckSelect" class="form-select form-select-sm" aria-label="Select flashcard deck">
            <option value="due">Due today (${stats.due})</option>
            <option value="mistakes">Review My Mistakes (${stats.mistakes})</option>
            <option value="all">All cards (${stats.total})</option>
          </select>
        </label>
      </div>
      <div id="session"></div>
    </div></section>
    <div class="row g-3">
      <section class="col-12 col-lg-7"><div class="card h-100"><div class="card-body">
        <h2 class="h5">Mastery and weak topics</h2><p class="small text-muted">Based on your review ratings; topics with lower mastery appear first.</p><div id="weakTopics"></div>
      </div></div></section>
      <section class="col-12 col-lg-5"><div class="card h-100"><div class="card-body">
        <h2 class="h5">Achievements</h2><div class="row g-2" id="achievementList"></div>
      </div></div></section>
    </div>`;

  renderStats(stats);
  const select = $('deckSelect');
  select.value = deck;
  const queueFor = () => {
    const currentCards = getFlashcards();
    const now = Date.now();
    if (deck === 'mistakes') return currentCards.filter((card) => card.source === 'mistake');
    if (deck === 'all') return currentCards;
    return currentCards.filter((card) => card.dueAt <= now);
  };

  function renderSession(message = '') {
    const session = $('session');
    if (position >= queue.length) {
      session.innerHTML = `<div class="text-center py-5">
        <div class="display-5 text-success mb-2"><i class="bi bi-check2-circle"></i></div>
        <h3 class="h5">${message || (queue.length ? 'Session complete!' : 'No cards in this deck yet')}</h3>
        <p class="text-muted">${queue.length ? 'Your progress is saved. Come back when more cards are due.' : deck === 'mistakes' ? 'Incorrect answers from completed mock exams appear here automatically.' : 'Finish a mock exam or review its mistakes to build your flashcard deck.'}</p>
        ${deck !== 'all' && getFlashcards().length ? '<button class="btn btn-outline-primary" id="switchAll" type="button">Browse all cards</button>' : '<a class="btn btn-outline-primary" href="exams.html">Choose an exam</a>'}
      </div>`;
      $('switchAll')?.addEventListener('click', () => { deck = 'all'; select.value = deck; resetSession(); });
      return;
    }
    const card = queue[position];
    const category = getCategory(card.category)?.name || card.category;
    const optionRows = (card.options || []).map((option) => {
      const missed = option === card.selectedAnswer;
      return `<div class="flashcard-choice ${missed ? 'missed' : ''}">${missed ? '<i class="bi bi-x-circle text-danger me-1"></i>' : ''}${esc(option)}${missed ? ' <small>(your answer)</small>' : ''}</div>`;
    }).join('');
    session.innerHTML = `
      <div class="d-flex justify-content-between small text-muted mb-2"><span>${esc(category)} · ${esc(card.topic || 'General')}</span><span>Card ${position + 1} of ${queue.length}</span></div>
      <button type="button" id="flipCard" class="flashcard w-100 border-0 bg-transparent p-0 text-start" aria-pressed="false" aria-label="Reveal answer">
        <span class="flashcard-inner d-block">
          <span class="flashcard-face flashcard-front" id="cardFront">
            <span class="badge text-bg-primary align-self-start mb-3">${card.source === 'mistake' ? 'Mock exam mistake' : 'Practice card'}</span>
            <span class="flashcard-prompt">${esc(card.question)}</span>
            ${optionRows ? `<span class="d-grid gap-2 mt-3">${optionRows}</span>` : ''}
            <span class="small text-primary mt-4"><i class="bi bi-arrow-repeat"></i> Tap or press Enter to reveal</span>
          </span>
          <span class="flashcard-face flashcard-back" id="cardBack" hidden>
            <span class="badge text-bg-success align-self-start mb-3">Answer</span>
            <span class="flashcard-prompt fw-semibold">${esc(card.answer)}</span>
            ${card.explanation ? `<span class="explanation mt-3"><strong>Why:</strong> ${esc(card.explanation)}</span>` : ''}
            <span class="small text-muted mt-4">Choose how well you knew it</span>
          </span>
        </span>
      </button>
      <div class="d-flex flex-wrap justify-content-center gap-2 mt-3 d-none" id="ratings">
        ${Object.entries(RATING_LABELS).map(([rating, label]) => `<button type="button" class="btn btn-outline-secondary rating-btn rating-${rating}" data-rating="${rating}">
          ${label}<span class="d-block small">${RATING_DELAYS[rating]}</span>
        </button>`).join('')}
      </div>
      <div class="text-center small text-muted mt-2" id="sessionMessage" role="status">${esc(message)}</div>`;
    const flip = $('flipCard');
    flip.addEventListener('click', () => {
      const revealed = flip.classList.toggle('is-flipped');
      flip.setAttribute('aria-pressed', String(revealed));
      flip.setAttribute('aria-label', revealed ? 'Answer revealed' : 'Reveal answer');
      $('cardFront').hidden = revealed;
      $('cardBack').hidden = !revealed;
      $('ratings').classList.toggle('d-none', !revealed);
    });
    $('ratings').addEventListener('click', (event) => {
      const button = event.target.closest('[data-rating]');
      if (!button) return;
      const result = rateFlashcard(card.id, button.dataset.rating);
      if (!result.ok) {
        $('sessionMessage').textContent = result.error;
        $('sessionMessage').className = 'text-danger small text-center mt-2';
        return;
      }
      const earned = { again: 2, hard: 4, good: 6, easy: 8 }[button.dataset.rating];
      position += 1;
      renderStats(result.stats);
      const achievementText = result.newlyUnlocked.length
        ? ` Achievement unlocked: ${result.newlyUnlocked.map((id) => ACHIEVEMENTS.find(([key]) => key === id)?.[1] || id).join(', ')}.`
        : '';
      renderSession(`${RATING_LABELS[button.dataset.rating]} — +${earned} XP.${achievementText}`);
    });
  }

  function resetSession() {
    queue = queueFor();
    position = 0;
    renderSession();
  }
  select.addEventListener('change', () => { deck = select.value; resetSession(); });
  $('goalForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('goalInput');
    const message = $('goalMessage');
    const ok = saveDailyGoal(Number(input.value));
    message.className = `small ${ok ? 'text-success' : 'text-danger'}`;
    message.textContent = ok ? 'Daily goal saved.' : 'Could not save the goal. Choose a number from 1 to 100.';
    if (ok) renderStats(getFlashcardStats());
  });
  resetSession();
}
