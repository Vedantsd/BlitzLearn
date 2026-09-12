# BlitzLearn – AI-Enabled Skill Intelligence Platform

BlitzLearn began as an exam-focused study assistant and has grown into a full AI-enabled Skill Intelligence and Learning Platform. It combines Retrieval-Augmented Generation (RAG) over a user's own notes with a persistent, AI-scored competency model — so the same platform that turns a PDF into a graded quiz also tracks what a learner actually knows, identifies their skill gaps against role-based targets, assigns them hands-on labs and trainer-recommended courses to close those gaps, and gives department trainers and admins a live, forecasted view of where the organization's skills are heading.

---

## Overview

Students and working professionals face two related problems: scattered, unstructured study material, and no reliable way to know which of their skills actually need work — or where those gaps are headed next. BlitzLearn addresses both. Uploaded notes are turned into an interactive, Bloom's-Taxonomy-aware chat and into auto-generated MCQ tests or true/false-and-fill-in-the-blank quizzes. Separately, every user's declared skills are assessed through an AI-generated competency test at signup, and every test, quiz, or hands-on Lab they complete afterward continues to update a running per-skill competency score. That score drives a skill radar chart, a gap analysis against a role-appropriate target, a personalized roadmap of iGOT Karmayogi courses and NSSTA TPAC training documents, and a queue of AI-generated Labs targeting exactly the skills furthest from target. Department trainers can see this same competency data for their own department, assign real iGOT courses directly to individual learners, and an admin-facing forecasting engine projects which skills will need the most attention 1, 3, and 6 months out — organization-wide and department by department.

---

## Key Features

**Authentication & Onboarding**
- Firebase Authentication for learner account creation and login
- A separate, session-based authentication layer for department Trainers and platform Admins
- Multi-step signup capturing basic details, education history, self-rated skills, prior work experience, and department/designation
- An auto-generated skill assessment immediately after signup, mixing easy/medium/hard questions across every declared skill, followed by a one-time skill report

**AI Chat & RAG-Based Learning**
- Upload PDFs or reference pre-loaded books, or point to a YouTube lecture
- Responses tuned to a selected Bloom's Taxonomy level and exam topic weightage
- Multiple study modes — Normal, Professor (formal/technical), and regional Vibe modes (Mumbai, Hyderabadi, Punjabi) that answer in casual, slang-inflected Hinglish
- Multilingual support across 15 Indian languages
- AI-driven topic prioritization ranking the most exam-relevant topics in the uploaded material

**AI-Generated Tests & Quizzes**
- Generates tests directly from a user's processed notes, with selectable difficulty and question count, in two selectable formats:
  - **MCQ** — classic four-option multiple choice
  - **Quiz** — true/false statements and fill-in-the-blank questions, for objective-style recall practice
- Strong filtering to keep questions about the actual subject matter — explicitly rejecting questions about the source book's authors, editions, prefaces, or structure
- A persistent, reusable question bank segmented by format: once generated, MCQs and quiz questions can each be pulled again for future users without calling the AI a second time
- Full per-question, per-format answer tracking, so every attempt (MCQ or quiz) can be reviewed later question-by-question

**Hands-On Labs**
- A separate Labs flow generated directly from a learner's current skill gaps — the lowest-competency, highest-priority skills surface first
- Each Lab is auto-categorized (Code, Cloud, Finance, or General) based on the skill, which determines the exercise style:
  - **Code** labs ask for a working code solution in an in-browser editor-style workspace
  - **Cloud** labs ask the learner to describe/paste the steps, commands, or config they used for an infrastructure task
  - **Finance** labs give concrete data and require a worked calculation with a final answer
  - **General** labs ask for an applied, written response
- A LeetCode-style two-stage layout: theory + worked examples first, then the task and workspace side by side
- AI grades the submission for score, mistakes, improvements, and follow-up suggestions, and — like tests — a passing Lab score feeds back into the learner's running skill competency score
- Lab content (theory/examples/task) is generated once per topic+category and cached, so repeat learners on the same skill don't re-trigger generation

**Skill Competency Engine**
- A running, cumulative competency score per skill that updates from every test, quiz, or Lab a user completes — not just the initial onboarding assessment
- Skill radar (spider) chart visualizing current standing across all declared skills
- Skill gap analysis comparing current competency against a designation-aware target level
- Automatic topic prioritization ranking skills by the size of the gap
- A progress-over-time trend showing overall competency evolving across every assessment taken
- An expandable test history reviewing every past test/quiz and every individual answer given
- A GitHub-style contribution heatmap on the learner's profile showing daily activity (tests, quizzes, Labs), current streak, longest streak, and total active days
- Passive learning-hours tracking via periodic activity heartbeats (only counted while the tab is visible and the learner is actively interacting), surfaced on both the learner's profile and the trainer dashboard

**Personalized Learning Roadmap**
- Matches each identified skill gap against iGOT Karmayogi's course catalogue and NSSTA's TPAC training documents
- Falls back to AI-generated, practical sub-topics only when no matching course or document is found for a skill
- Roadmap entries are prioritized by gap size, so the most urgent skill gaps surface first

**Trainer Portal**
- A separately authenticated Trainer login, independent of both learner (Firebase) and Admin sessions
- Each trainer is scoped to exactly one department — an IT trainer only ever sees and manages IT learners, enforced server-side on every request, not just in the UI
- A searchable roster of department learners with assessment score, learning hours, and designation at a glance
- A per-learner detail view: skill competency bars, recent test history, and total learning hours
- A live iGOT course search with a horizontally scrollable browsing pane, instant client-side filtering as you type, and full server-side search on Enter — trainers can assign any matching course directly to a selected learner, and remove assignments later
- Assigned courses appear back on the learner's own dashboard in a dedicated "Assigned Courses" view

**Assigned Courses (Learner-Facing)**
- A dedicated dashboard section showing every course a department trainer has assigned, with organisation, duration, and a direct link to the course

**Admin Dashboard**
- Secure, separately authenticated admin area
- Search, filter, and sort the full user base by department, status, or competency score
- Enable, disable, or delete user accounts
- A performance leaderboard highlighting the highest- and lowest-scoring users
- Department-wise reporting, including average competency and per-skill breakdowns across each department
- Trainer management: create trainer accounts (with duplicate-username and duplicate-name+department checks), reset trainer passwords, and remove trainers
- A department consistency audit flagging department names that differ only in casing/spacing (e.g. "IT" vs "It") and departments with active learners but no assigned trainer
- **Skill Demand Forecasting**: a time-series model (scikit-learn linear regression) trained on historical department-level competency/requirement/gap data forecasts the top 5 skills to prioritize per department, selectable across 1-, 3-, and 6-month horizons — ranking is driven entirely by the forecast trend, while the competency numbers shown alongside each skill are pulled live from the real, current database rather than the historical dataset

**Landing Page**
- A public-facing marketing page introducing the platform, its pipeline, feature set, and impact metrics ahead of login/signup
- A "Demo Access" panel with one-click-copy demo credentials for both the learner and admin experience

**Universal Notifications**
- A shared toast-notification system used across every page in place of native browser `alert()` popups, with success/error/warning/info styles

**Performance & Data Infrastructure**
- PostgreSQL as the primary structured data store for users, skills, questions, tests, competency scores, skill reports, Labs, trainers, assigned courses, and learning-time logs
- Firebase Firestore for lightweight, per-user session settings, keeping every learner's chat configuration fully isolated from every other learner
- Client-side data preloading and caching (including Labs and Roadmap data) so dashboard, evaluation, and roadmap views load near-instantly on repeat visits instead of waiting on fresh database round trips every time

---

## Architecture Diagram

<img width="780" height="854" alt="image" src="https://github.com/user-attachments/assets/22620f2e-b9a1-45b3-8e31-64cf38f552bb" />

## Architecture Summary

**Notes → Chat pipeline (RAG)**
1. Users authenticate via Firebase Authentication.
2. Uploaded PDFs (or selected pre-loaded books) are parsed and split into text chunks.
3. Chunks are embedded and stored in a per-user FAISS vector index.
4. A chat question triggers semantic retrieval of the most relevant chunks.
5. Retrieved context is combined with the user's Bloom's level, topic weightage, language, and study mode.
6. Google Gemini generates the final, exam-oriented response.

**Notes → Test/Quiz pipeline**
1. The same retrieved, topically diverse chunks are passed to Gemini with strict, format-specific instructions — either MCQ generation or true/false + fill-in-the-blank quiz generation — and told to test subject knowledge only.
2. Generated questions are filtered against book-metadata and structural trivia before being accepted.
3. Accepted questions are persisted to the format-segmented question bank and assembled into a test.
4. Submitted answers are scored (MCQ by option match, quiz by case-insensitive text/boolean match), and any question whose topic matches a declared skill updates that skill's running competency score.

**Skill assessment → Roadmap → Labs pipeline**
1. A signup-time (and any later) skill test is generated purely from a user's declared skills — no notes required.
2. Scoring updates the same running per-skill competency model used by the radar chart, gap analysis, and Labs queue.
3. Each skill's current score is compared against a designation-aware target to compute its gap and priority.
4. The gap list is matched against the iGOT and NSSTA/TPAC datasets; unmatched high-priority gaps receive AI-generated fallback topics instead.
5. Skills with an open gap are also surfaced as Labs, categorized by type, with Gemini generating (and caching) theory, examples, and a task per topic+category the first time it's requested.
6. A submitted Lab is graded by Gemini and, on a passing score, feeds back into the same skill competency table as tests and quizzes.

**Trainer oversight pipeline**
1. A trainer authenticates via a separate, department-scoped session (not Firebase).
2. Every learner/course-assignment query is filtered server-side by the trainer's own department — never trusted from the client.
3. Trainers search the shared course catalogue and assign matching courses to individual learners.
4. Assignments appear immediately on the learner's own "Assigned Courses" dashboard view.

**Admin forecasting pipeline**
1. A historical department/skill/month dataset (competency level, requirement, gap) is loaded and grouped by department + skill.
2. A linear regression is fit per department-skill series and used to project competency, requirement, and gap 1, 3, and 6 months forward.
3. Skills are ranked per department by forecasted gap size at the selected horizon — the highest-forecasted-gap skills surface as the department's top priorities.
4. The competency/gap numbers actually displayed alongside each ranked skill are re-fetched live from the current database, so the ranking reflects long-term trend while the numbers reflect the present moment.

---

## Tech Stack

**AI & Retrieval**
- Google Gemini (`gemini-2.5-flash`)
- LangChain (text splitting, RAG orchestration)
- FAISS vector store with HuggingFace sentence-transformer embeddings

**Backend**
- Python, Flask
- Server-rendered HTML templates with vanilla JavaScript on the frontend
- PyPDF2 for PDF text extraction
- pandas, NumPy, and scikit-learn for time-series skill-demand forecasting

**Data Storage**
- PostgreSQL (users, skills, education, experience, questions, tests, attempts, competency scores, skill reports, progress history, Labs, trainers, assigned courses, learning-time logs)
- Firebase Firestore (per-user session/chat settings)
- Local reference datasets for iGOT Karmayogi courses, NSSTA TPAC training documents, and historical skill-forecasting data

**Authentication & Cloud**
- Firebase Authentication (learner accounts)
- A separately secured, session-based authentication layer for Trainers (department-scoped) and Admins (platform-wide)

---

## Workflow Diagram

<img width="555" height="883" alt="image" src="https://github.com/user-attachments/assets/5533f777-89fb-47c4-8ef1-8152aaeb01de" />

1. A visitor lands on the public landing page and signs up.
2. Signup collects basic details, education, skills, experience, and department/designation.
3. An AI-generated skill assessment runs immediately, covering every declared skill across mixed difficulty levels.
4. A one-time skill report is shown, then the user reaches their dashboard.
5. From the dashboard, the user can chat with uploaded notes, generate or take practice tests and quizzes, work through AI-generated hands-on Labs targeting their weakest skills, review their evaluation (radar chart, gap analysis, progress trend, learning streak, test history), follow their personalized roadmap, check courses assigned by their trainer, and manage their profile.
6. Every test, quiz, or Lab completed continues to refine the user's skill competency scores, keeping the evaluation, roadmap, and Labs queue current.
7. Department trainers separately log in to a department-scoped dashboard to monitor their learners' performance and assign real iGOT courses directly to individuals.
8. Administrators separately log in to search and manage users and trainers, monitor performance leaderboards, review department-wide competency reporting, audit department-name consistency, and view forecasted department-wise skill priorities across 1/3/6-month horizons.

---

## Future Development

- Live API integration with iGOT Karmayogi and NSSTA TPAC, replacing the current locally-seeded course/document datasets
- Flashcard generation for spaced-repetition revision
- Course-completion tracking that automatically updates competency scores once a trainer-assigned course is finished, closing the assess → recommend → complete → re-assess loop
- Unified Single Sign-On and more granular role-based access control across the learner, trainer, and admin surfaces
- Multilingual generation for theory, quizzes, roadmap content, and Lab tasks
