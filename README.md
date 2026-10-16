# Civil Service Exam Reviewer

Frontend-only practice site (HTML, Bootstrap 5, vanilla ES modules, JSON question banks, `localStorage`).

## Run locally
ES modules and `fetch` need HTTP, not `file://`:

    python -m http.server 8000

Then open http://localhost:8000.

## Deploy
Static files only. Publish the folder with GitHub Pages (Settings → Pages → deploy from branch) or drag it into Netlify. No build step.

## Adding questions
Edit `data/*.json`. Fields: `id`, `category`, `level` (`professional`, `subprofessional`, or `all`), `topic`, `difficulty`, `question`, `options`, `correctAnswer` (index into `options`), `explanation`, `points`. Options are shuffled per attempt and the correct index is remapped.

## Configuration
- Practice target score: History & Settings page (default 70%). It is a personal practice target, not an official CSC passing rate.
- Questions per exam / time per question: `MAX_QUESTIONS` and `MINUTES_PER_QUESTION` in `assets/js/app.js`.

## Flashcard review
- Open **Flashcards** from the navigation or dashboard. Incorrect answers are automatically added to **Review My Mistakes** when an exam result is opened.
- Reveal each card and rate it Again (10 minutes), Hard (1 day), Good (3 days), or Easy (7 days). Later intervals adapt to the card's review history.
- Due cards, review history, XP, daily goals, streaks, achievements, and topic mastery are stored in this browser's `localStorage`.

## Limitations
Questions, answers, scoring, and flashcard progress are visible in the browser, and `localStorage` can be edited by the user. Not suitable for secure or high-stakes testing. Sample questions are original practice items, not official exam content. The subject banks and 165-item Professional and Subprofessional full mock exams contain newly written practice questions; the Professional mock uses a 3-hour-10-minute limit and the Subprofessional mock uses a 2-hour-40-minute limit.
