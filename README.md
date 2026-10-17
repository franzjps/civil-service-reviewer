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
- Practice target score: History & Settings page (default 80%, the CSE passing rate). Mixed exams are drawn by subject weight: Verbal 30%, Analytical (Professional) or Clerical (Subprofessional) 35%, Numerical 30%, General Information 5%.
- Questions per exam / time per question: `MAX_QUESTIONS` and `MINUTES_PER_QUESTION` in `assets/js/app.js`.

## Flashcard review
- Open **Flashcards** from the navigation or dashboard. Incorrect answers are automatically added to **Review My Mistakes** when an exam result is opened.
- Reveal each card and rate it Again (10 minutes), Hard (1 day), Good (3 days), or Easy (7 days). Later intervals adapt to the card's review history.
- Due cards, review history, XP, daily goals, streaks, achievements, and topic mastery are stored in this browser's `localStorage`.

## Limitations
Questions, answers, scoring, and flashcard progress are visible in the browser, and `localStorage` can be edited by the user. Not suitable for secure or high-stakes testing. Question content is from third-party free reviewer PDFs, not official exam content. The subject banks and the Professional (148 items) and Subprofessional (143 items) full mock exams are built from the free CSE Reviewer v1.0 PDFs (csereviewer.com); answers come from the published answer keys, with a few items corrected or excluded where the key was wrong or the question was unanswerable. Ability areas: Verbal, Numerical and General Information apply to both levels, Analytical to Professional only, and Clerical to Subprofessional only. The Professional mock uses a 3-hour-10-minute limit and the Subprofessional mock uses a 2-hour-40-minute limit.
