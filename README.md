# BlitzLearn – AI-Enabled Skill Intelligence Platform

BlitzLearn began as an exam-focused study assistant and has grown into a full AI-enabled Skill Intelligence and Learning Platform. It combines Retrieval-Augmented Generation (RAG) over a user's own notes with a persistent, AI-scored competency model — so the same platform that turns a PDF into a graded quiz also tracks what a learner actually knows, identifies their skill gaps against role-based targets, and recommends real courses and training documents to close them.

---

## Overview

Students and working professionals face two related problems: scattered, unstructured study material, and no reliable way to know which of their skills actually need work. BlitzLearn addresses both. Uploaded notes are turned into an interactive, Bloom's-Taxonomy-aware chat and into auto-generated MCQ tests. Separately, every user's declared skills are assessed through an AI-generated competency test at signup, and every test they take afterward — practice or formal — continues to update a running per-skill competency score. That score drives a skill radar chart, a gap analysis against a role-appropriate target, and a personalized roadmap of iGOT Karmayogi courses and NSSTA TPAC training documents, falling back to AI-generated study topics only when no matching course or document exists.

---

## Key Features

**Authentication & Onboarding**
- Firebase Authentication for account creation and login
- Multi-step signup capturing basic details, education history, self-rated skills, prior work experience, and department/designation
- An auto-generated skill assessment immediately after signup, mixing easy/medium/hard questions across every declared skill, followed by a one-time skill report

**AI Chat & RAG-Based Learning**
- Upload PDFs or reference pre-loaded books, or point to a YouTube lecture
- Responses tuned to a selected Bloom's Taxonomy level and exam topic weightage
- Multiple study modes — Normal, Professor (formal/technical), and regional Vibe modes (Mumbai, Hyderabadi, Punjabi) that answer in casual, slang-inflected Hinglish
- Multilingual support across 15 Indian languages
- AI-driven topic prioritization ranking the most exam-relevant topics in the uploaded material

**AI-Generated Tests & Question Bank**
- Generates MCQ tests directly from a user's processed notes, with selectable difficulty and question count
- Strong filtering to keep questions about the actual subject matter — explicitly rejecting questions about the source book's authors, editions, prefaces, or structure
- A persistent, reusable question bank: once generated, questions can be pulled again for future users without calling the AI a second time
- Full per-question answer tracking, so every attempt can be reviewed later question-by-question

**Skill Competency Engine**
- A running, cumulative competency score per skill that updates from every test a user takes — not just the initial onboarding assessment
- Skill radar (spider) chart visualizing current standing across all declared skills
- Skill gap analysis comparing current competency against a designation-aware target level
- Automatic topic prioritization ranking skills by the size of the gap
- A progress-over-time trend showing overall competency evolving across every assessment taken
- An expandable test history reviewing every past test and every individual answer given

**Personalized Learning Roadmap**
- Matches each identified skill gap against iGOT Karmayogi's course catalogue and NSSTA's TPAC training documents
- Falls back to AI-generated, practical sub-topics only when no matching course or document is found for a skill
- Roadmap entries are prioritized by gap size, so the most urgent skill gaps surface first

**Profile Management**
- A dedicated profile page showing personal details, department/designation, education, and experience
- Add or remove skills directly from the profile, feeding future assessments and the roadmap

**Admin Dashboard**
- Secure, separately authenticated admin area
- Search, filter, and sort the full user base by department, status, or competency score
- Enable, disable, or delete user accounts
- A performance leaderboard highlighting the highest- and lowest-scoring users
- Department-wise reporting, including average competency and per-skill breakdowns across each department

**Landing Page**
- A public-facing marketing page introducing the platform, its pipeline, feature set, and impact metrics ahead of login/signup

**Performance & Data Infrastructure**
- Oracle Database as the primary structured data store for users, skills, questions, tests, competency scores, and reports
- Firebase Firestore for lightweight, per-user session settings, keeping every learner's chat configuration fully isolated from every other learner
- Client-side data preloading and caching so dashboard, evaluation, and roadmap data load near-instantly on repeat visits instead of waiting on fresh database round trips every time

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

**Notes → Test pipeline**
1. The same retrieved, topically diverse chunks are passed to Gemini with strict instructions to test subject knowledge only.
2. Generated questions are filtered against book-metadata and structural trivia before being accepted.
3. Accepted questions are persisted to the question bank and assembled into a test.
4. Submitted answers are scored, and any question whose topic matches a declared skill updates that skill's running competency score.

**Skill assessment → Roadmap pipeline**
1. A signup-time (and any later) skill test is generated purely from a user's declared skills — no notes required.
2. Scoring updates the same running per-skill competency model used by the radar chart and gap analysis.
3. Each skill's current score is compared against a designation-aware target to compute its gap and priority.
4. The gap list is matched against the iGOT and NSSTA/TPAC datasets; unmatched high-priority gaps receive AI-generated fallback topics instead.

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

**Data Storage**
- Oracle Database (users, skills, education, experience, questions, tests, attempts, competency scores, skill reports, progress history)
- Firebase Firestore (per-user session/chat settings)
- Local reference datasets for iGOT Karmayogi courses and NSSTA TPAC training documents

**Authentication & Cloud**
- Firebase Authentication (learner accounts)
- A separately secured, session-based admin authentication layer

---

## Workflow Diagram 

<img width="555" height="883" alt="image" src="https://github.com/user-attachments/assets/5533f777-89fb-47c4-8ef1-8152aaeb01de" />

1. A visitor lands on the public landing page and signs up.
2. Signup collects basic details, education, skills, experience, and department/designation.
3. An AI-generated skill assessment runs immediately, covering every declared skill across mixed difficulty levels.
4. A one-time skill report is shown, then the user reaches their dashboard.
5. From the dashboard, the user can chat with uploaded notes, generate or take practice tests, review their evaluation (radar chart, gap analysis, progress trend, test history), follow their personalized roadmap, and manage their profile.
6. Every test taken — practice or formal — continues to refine the user's skill competency scores, keeping the evaluation and roadmap current.
7. Administrators separately log in to search and manage users, monitor performance leaderboards, and review department-wide competency reporting.

---

## Future Development

- Live API integration with iGOT Karmayogi and NSSTA TPAC, replacing the current Oracle database
- Flashcard generation for spaced-repetition revision
- An AI-based evaluator for open-ended, non-MCQ answers
- Predictive analytics on the admin dashboard for forecasting future organization-wide skill demand
