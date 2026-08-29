import os
import io
import json
import re
import sqlite3
from functools import wraps
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, Response, session, redirect, url_for
from PyPDF2 import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.chains.question_answering import load_qa_chain
from langchain.prompts import PromptTemplate

load_dotenv()
app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "blitzlearn-dev-secret-change-me")

# Hardcoded for now, per the current requirement — swap for a real admin
# user store + hashed passwords before deploying this for real.
ADMIN_USERNAME = "Admin"
ADMIN_PASSWORD = "Password"

api_key = os.getenv("GEMINI_API_KEY")

vector_store = None
session_context = {
    "course_outcomes": "",
    "bloom_level": "Understand",
    "weightage": "",
    "language": "",
    "yt_url": "",
    "study_mode": "normal",
    "vibe_type": "default"
}

staged_files = [] 


PREUPLOADED_BOOKS = [
    {
        "id": "os-stallings",
        "title": "Operating Systems: Internals and Design Principles",
        "author": "William Stallings",
        "subject": "Operating Systems",
        "filename": "os_stallings.pdf",
    },
    {
        "id": "dbms-korth",
        "title": "Database System Concepts",
        "author": "Silberschatz, Korth & Sudarshan",
        "subject": "DBMS",
        "filename": "dbms_korth.pdf",
    },
    {
        "id": "cn-forouzan",
        "title": "Data Communications and Networking",
        "author": "Behrouz A. Forouzan",
        "subject": "Computer Networks",
        "filename": "cn_forouzan.pdf",
    },
    {
        "id": "ai-russell",
        "title": "Artificial Intelligence: A Modern Approach",
        "author": "Stuart Russell & Peter Norvig",
        "subject": "Artificial Intelligence",
        "filename": "ai_russell.pdf",
    },
]

BOOKS_DIR = os.path.join(app.root_path, "static", "books")

# ---------------------------------------------------------------------------
# Questions database (SQLite). Every AI-generated test question is stored
# here, tagged by topic + difficulty, so it can be reused later to assess
# new users without calling the LLM again ("question bank" mode).
# ---------------------------------------------------------------------------
DB_PATH = os.path.join(app.root_path, "questions.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT,
            difficulty TEXT NOT NULL,
            question_text TEXT NOT NULL,
            option_a TEXT NOT NULL,
            option_b TEXT NOT NULL,
            option_c TEXT NOT NULL,
            option_d TEXT NOT NULL,
            correct_option TEXT NOT NULL,
            explanation TEXT,
            source_title TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            difficulty TEXT NOT NULL,
            num_questions INTEGER NOT NULL,
            source_title TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS test_questions (
            test_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            question_order INTEGER,
            FOREIGN KEY (test_id) REFERENCES tests (id),
            FOREIGN KEY (question_id) REFERENCES questions (id)
        );

        CREATE TABLE IF NOT EXISTS test_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id INTEGER NOT NULL,
            score INTEGER NOT NULL,
            total INTEGER NOT NULL,
            taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (test_id) REFERENCES tests (id)
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            age INTEGER,
            phone TEXT,
            email TEXT NOT NULL,
            department TEXT,
            designation TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_education (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            degree TEXT,
            institution TEXT,
            year TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS user_skills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            skill_name TEXT NOT NULL,
            self_rated_level TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS user_experience (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            role TEXT,
            organization TEXT,
            duration TEXT,
            description TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS skill_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            test_id INTEGER,
            overall_score INTEGER NOT NULL,
            overall_total INTEGER NOT NULL,
            skills_breakdown TEXT,
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (test_id) REFERENCES tests (id)
        );

        CREATE TABLE IF NOT EXISTS user_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            selected_option TEXT,
            answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (test_id) REFERENCES tests (id),
            FOREIGN KEY (question_id) REFERENCES questions (id)
        );

        CREATE TABLE IF NOT EXISTS skill_competency (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            skill_name TEXT NOT NULL,
            correct_count INTEGER NOT NULL DEFAULT 0,
            total_count INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, skill_name),
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS progress_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            test_id INTEGER,
            overall_percent INTEGER NOT NULL,
            taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (test_id) REFERENCES tests (id)
        );
    """)
    conn.commit()

    # Lightweight migration: add columns to tables that already existed
    # before this column was introduced, without touching existing data.
    _ensure_column(conn, "users", "status", "TEXT DEFAULT 'active'")
    _ensure_column(conn, "tests", "user_id", "INTEGER")
    _ensure_column(conn, "test_attempts", "user_id", "INTEGER")
    _ensure_column(conn, "tests", "competency_applied", "INTEGER DEFAULT 0")
    conn.commit()
    conn.close()


def _ensure_column(conn, table, column, coltype_and_default):
    existing_cols = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in existing_cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype_and_default}")


def _update_skill_competency_and_progress(user_id, test_id):
    """Turns ONE submitted test into running skill-competency evidence.

    Any question in the test whose topic matches one of the user's declared
    skills (case-insensitive) updates that skill's running correct/total
    tally in skill_competency — this is what makes the radar chart, gap
    analysis, and progress trend move from EVERY test taken (practice tests
    from notes, the question bank, and the formal skill assessment alike),
    not just the one-time onboarding assessment.

    Idempotent: marks tests.competency_applied = 1 so re-running the
    startup backfill (or being called twice) never double-counts a test.
    """
    conn = get_db()
    cur = conn.cursor()

    already_applied = cur.execute(
        "SELECT competency_applied FROM tests WHERE id = ?", (test_id,)
    ).fetchone()
    if not already_applied or already_applied["competency_applied"]:
        conn.close()
        return

    skill_rows = cur.execute(
        "SELECT skill_name FROM user_skills WHERE user_id = ?", (user_id,)
    ).fetchall()
    declared_skills = {r["skill_name"].strip().lower(): r["skill_name"] for r in skill_rows if r["skill_name"]}

    if not declared_skills:
        cur.execute("UPDATE tests SET competency_applied = 1 WHERE id = ?", (test_id,))
        conn.commit()
        conn.close()
        return

    rows = cur.execute(
        """SELECT q.topic, q.correct_option, ua.selected_option
           FROM test_questions tq
           JOIN questions q ON q.id = tq.question_id
           LEFT JOIN user_answers ua ON ua.test_id = tq.test_id AND ua.question_id = q.id
           WHERE tq.test_id = ?""",
        (test_id,)
    ).fetchall()

    matched_any = False
    for r in rows:
        topic_key = (r["topic"] or "").strip().lower()
        if topic_key not in declared_skills:
            continue  # this question's topic isn't one of the user's declared skills — skip it

        matched_any = True
        skill_name = declared_skills[topic_key]
        is_correct = 1 if r["selected_option"] and r["selected_option"] == r["correct_option"] else 0

        cur.execute(
            """INSERT INTO skill_competency (user_id, skill_name, correct_count, total_count)
               VALUES (?, ?, ?, 1)
               ON CONFLICT(user_id, skill_name) DO UPDATE SET
                 correct_count = correct_count + excluded.correct_count,
                 total_count = total_count + 1,
                 updated_at = CURRENT_TIMESTAMP""",
            (user_id, skill_name, is_correct)
        )

    if matched_any:
        competency_rows = cur.execute(
            "SELECT correct_count, total_count FROM skill_competency WHERE user_id = ?", (user_id,)
        ).fetchall()
        percents = [
            round((c["correct_count"] / c["total_count"]) * 100)
            for c in competency_rows if c["total_count"] > 0
        ]
        overall_percent = round(sum(percents) / len(percents)) if percents else 0

        cur.execute(
            "INSERT INTO progress_snapshots (user_id, test_id, overall_percent) VALUES (?, ?, ?)",
            (user_id, test_id, overall_percent)
        )

    cur.execute("UPDATE tests SET competency_applied = 1 WHERE id = ?", (test_id,))
    conn.commit()
    conn.close()


def _backfill_skill_competency():
    """Runs once at startup: catches any already-submitted tests (like
    tests taken before this feature existed) that never fed into skill
    competency, and applies them now."""
    conn = get_db()
    pending = conn.execute(
        """SELECT DISTINCT t.id, t.user_id FROM tests t
           JOIN test_attempts ta ON ta.test_id = t.id
           WHERE t.user_id IS NOT NULL AND (t.competency_applied IS NULL OR t.competency_applied = 0)"""
    ).fetchall()
    conn.close()

    for row in pending:
        _update_skill_competency_and_progress(row["user_id"], row["id"])


init_db()
_backfill_skill_competency()


def get_pdf_text(pdf_files):
    text = ""
    for pdf in pdf_files:
        pdf_reader = PdfReader(pdf)
        for page in pdf_reader.pages:
            content = page.extract_text()
            if content:
                text += content
    return text


def get_pdf_text_from_staged(staged):
    text = ""
    for item in staged:
        pdf_reader = PdfReader(io.BytesIO(item["bytes"]))
        for page in pdf_reader.pages:
            content = page.extract_text()
            if content:
                text += content
    return text


def get_text_chunks(text):
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    return text_splitter.split_text(text)


def get_vector_store(text_chunks):
    embeddings = HuggingFaceEndpointEmbeddings(
        huggingfacehub_api_token=os.getenv("HUGGINGFACE_API_TOKEN"),
        repo_id="sentence-transformers/all-MiniLM-L6-v2"
    )
    store = FAISS.from_texts(text_chunks, embedding=embeddings)
    return store


def get_conversational_chain(bloom_level, outcomes, weightage, language, study_mode="normal", vibe_type="default"):

    base_instruction = """
    You are an academic tutor. Answer the question based on the provided context, 
    keeping the learner's Goal, Cognitive Level, and Topic Weightage in mind.
    """

    if study_mode == "professor":
        language = "English"
        mode_instruction = """
        PROFESSOR MODE: Provide highly technical, academically rigorous answers. 
        Use formal academic language, include technical terminology, cite concepts precisely, 
        and structure answers as a professor would in an exam setting. 
        Focus on conceptual clarity, theoretical depth, and exam-oriented explanations.
        Include relevant formulas, theorems, or technical details where applicable.
        """
    elif study_mode == "vibe":
        if vibe_type == "mumbai":
            language = "Hinglish (Mumbai slang)"
            mode_instruction = """
            MUMBAI CHA BHAI MODE: Talk like a cool Mumbai friend explaining concepts. 
            Use Mumbai slang naturally - words like 'bhai', 'bhidu', 'ekdum', 'bindaas', 
            'mast', 'apun', 'tapri', 'cutting', 'funda', 'scene', etc.
            Keep it casual but informative. Make learning fun and relatable like a friend 
            teaching another friend. Example: "Arre bhidu, yeh concept ekdum simple hai..."
            """
        elif vibe_type == "hyderabadi":
            language = "Hinglish (Hyderabadi slang)"
            mode_instruction = """
            HYDERABADI MIA MODE: Explain concepts in Hyderabadi style. 
            Use Hyderabadi slang naturally - words like 'mia', 'nakko', 'hau', 'kya baat hai', 
            'baigan', 'potti', 'kiraak', 'scene kya hai', 'dimaag ka dahi', etc.
            Keep it friendly and conversational. Example: "Arre mia, yeh topic toh ekdum kiraak hai..."
            """
        elif vibe_type == "punjabi":
            language = "Hinglish (Punjabi slang)"
            mode_instruction = """
            PUNJAB DA PUTTAR MODE: Explain concepts in energetic Punjabi style. 
            Use Punjabi slang naturally - words like 'veer', 'paaji', 'yaar', 'oye', 'chak de', 
            'kiddan', 'sohneyo', 'balle balle', 'vadiya', 'chakkar', 'fatte chak', 'jhakaas', 
            'ghaint', 'kamaal', 'pappe', etc.
            Keep it enthusiastic and brotherly. Example: "Oye paaji, yeh concept toh bilkul vadiya hai, 
            chak de phatte saari theory..."
            """
        else:
            language = "Hinglish"
            mode_instruction = """
            HINGLISH MODE: Explain in a mix of Hindi and English (Hinglish). 
            Use casual, friendly language that Indians commonly use. 
            Mix Hindi and English naturally like friends talking. 
            Example: "Dekho, yeh concept basically yeh hai ki..."
            """
    else:
        mode_instruction = """
        NORMAL MODE: Provide clear, comprehensive answers in the user's preferred language.
        Balance between being informative and accessible.
        """

    prompt_template = f"""
    {base_instruction}
    
    {mode_instruction}

    Learner's Course Outcomes: {outcomes}
    Target Bloom's Taxonomy Level: {bloom_level}
    Topic Weightage in Exam: {weightage} marks
    Response Language/Style: {language}
    
    Instructions:
    1. Use the provided context to answer.
    2. Adjust your explanation style to match the Bloom's Level (e.g., 'Analyze' should compare/contrast, 'Remember' should define).
    3. For higher weightage topics ({weightage} marks), provide more comprehensive explanations with examples and detailed coverage.
    4. For lower weightage topics, keep explanations concise but complete.
    5. If the answer is not in the context, say: "I can't find the answer in the notes."
    6. It's an Indian College Exam, so be extra careful about the content. Indian professors love detailed content.
    7. Maintain the specified language/style consistently throughout your response.

    Context:
    {{context}}

    Question: 
    {{question}}

    Answer:
    """

    model = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=api_key,
        temperature=0.3
    )
    prompt = PromptTemplate(template=prompt_template, input_variables=["context", "question"])
    return load_qa_chain(model, chain_type="stuff", prompt=prompt)


@app.route('/')
def dashboard():
    """Landing page after login."""
    return render_template('dashboard.html')


@app.route('/dashboard')
def dashboard_alias():
    return render_template('dashboard.html')


@app.route('/chat')
def chat():
    return render_template('chat.html')


@app.route('/tests')
def tests():
    return render_template('tests.html')


@app.route('/evaluate')
def evaluate():
    return render_template('evaluate.html')


@app.route('/roadmap')
def roadmap():
    return render_template('dashboard.html')


def admin_required(view_func):
    """Guards both admin pages and admin/api routes. Pages redirect to the
    admin login screen; API calls get a plain 401 JSON response."""
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not session.get("is_admin"):
            if request.path.startswith("/admin/api/"):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for("admin_login_page"))
        return view_func(*args, **kwargs)
    return wrapped


@app.route('/admin/login')
def admin_login_page():
    if session.get("is_admin"):
        return redirect(url_for("admin_dashboard_page"))
    return render_template('admin-login.html')


@app.route('/admin/api/login', methods=['POST'])
def admin_api_login():
    data = request.json or {}
    username = data.get("username", "")
    password = data.get("password", "")

    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        session["is_admin"] = True
        return jsonify({"message": "Logged in"})

    return jsonify({"error": "Invalid username or password"}), 401


@app.route('/admin/api/logout', methods=['POST'])
def admin_api_logout():
    session.pop("is_admin", None)
    return jsonify({"message": "Logged out"})


@app.route('/admin/dashboard')
@admin_required
def admin_dashboard_page():
    return render_template('admin-dashboard.html')


@app.route('/signup')
def signup():
    return render_template('signup.html')


@app.route('/profile')
def profile_page():
    return render_template('profile.html')


@app.route('/competency-test')
def competency_test_page():
    return render_template('competency-test.html')


@app.route('/report')
def report_page():
    return render_template('report.html')


@app.route('/login')
def login():
    return render_template('login.html')


@app.route('/terms')
def terms():
    return render_template('terms.html')


@app.route("/static/js/firebase-config.js")
def firebase_config_js():
    js = f"""
    const firebaseConfig = {{
        apiKey: "{os.environ.get('FIREBASE_API_KEY', '')}",
        authDomain: "{os.environ.get('FIREBASE_AUTH_DOMAIN', '')}",
        projectId: "{os.environ.get('FIREBASE_PROJECT_ID', '')}",
        storageBucket: "{os.environ.get('FIREBASE_STORAGE_BUCKET', '')}",
        messagingSenderId: "{os.environ.get('FIREBASE_MESSAGING_SENDER_ID', '')}",
        appId: "{os.environ.get('FIREBASE_APP_ID', '')}",
        measurementId: "{os.environ.get('FIREBASE_MEASUREMENT_ID', '')}"
    }};

    let auth;
    try {{
        if (!firebaseConfig.apiKey) {{
            throw new Error("FIREBASE_API_KEY is not configured in the environment.");
        }}
        if (!firebase.apps.length) {{
            firebase.initializeApp(firebaseConfig);
        }}
        auth = firebase.auth();
    }} catch (e) {{
        console.warn("Firebase Auth failed to initialize: " + e.message);
        console.warn("Using mock auth object for local template preview.");
        const mockAuth = {{
            onAuthStateChanged: (cb) => {{
                console.log("Mock onAuthStateChanged registered.");
                setTimeout(() => cb({{
                    email: "developer@blitzlearn.local",
                    uid: "dev-mock-uid",
                    displayName: "Developer User"
                }}), 100);
            }},
            signInWithEmailAndPassword: (email, password) => {{
                console.log("Mock login attempt with:", email);
                return Promise.resolve({{
                    user: {{
                        email: email,
                        uid: "dev-mock-uid"
                    }}
                }});
            }},
            signInWithPopup: (provider) => {{
                console.log("Mock social login attempt");
                return Promise.resolve({{
                    user: {{
                        email: "google-dev@blitzlearn.local",
                        uid: "dev-mock-uid"
                    }}
                }});
            }},
            sendPasswordResetEmail: (email) => {{
                console.log("Mock forgot password for:", email);
                return Promise.resolve();
            }},
            signOut: () => {{
                console.log("Mock signOut");
                return Promise.resolve();
            }}
        }};
        auth = mockAuth;
        const originalAuthObj = firebase.auth;
        firebase.auth = () => mockAuth;
        if (originalAuthObj) {{
            for (let prop in originalAuthObj) {{
                firebase.auth[prop] = originalAuthObj[prop];
            }}
        }}
    }}
    """
    return Response(js, mimetype="application/javascript")


@app.route('/api/books', methods=['GET'])
def api_books():
    return jsonify(PREUPLOADED_BOOKS)


@app.route('/upload_stage', methods=['POST'])
def upload_stage():
    global staged_files

    files = request.files.getlist("pdf_files")
    if not files or files[0].filename == '':
        return jsonify({"error": "No files received"}), 400

    added = []
    for f in files:
        staged_files.append({
            "filename": f.filename,
            "bytes": f.read(),
            "source": "upload",
            "title": f.filename,
        })
        added.append(f.filename)

    return jsonify({"message": f"{len(added)} file(s) added to your notes", "files": added})


@app.route('/select_book', methods=['POST'])
def select_book():
    global staged_files

    data = request.json or {}
    book_id = data.get("book_id")
    book = next((b for b in PREUPLOADED_BOOKS if b["id"] == book_id), None)
    if not book:
        return jsonify({"error": "Book not found"}), 404

    path = os.path.join(BOOKS_DIR, book["filename"])
    if not os.path.exists(path):
        return jsonify({
            "error": f"'{book['title']}' isn't available on the server yet. Please contact your admin."
        }), 404

    with open(path, "rb") as fh:
        data_bytes = fh.read()

    staged_files.append({
        "filename": book["filename"],
        "bytes": data_bytes,
        "source": "book",
        "title": book["title"],
    })

    return jsonify({
        "message": f"'{book['title']}' added to your notes",
        "title": book["title"],
        "filename": book["filename"]  
    })


@app.route('/api/save_profile', methods=['POST'])
def save_profile():
    """Called from signup.html on final submit. Upserts the user's profile
    (basic details, department/designation) and replaces their education,
    skills, and experience child rows."""
    data = request.json or {}
    uid = data.get("uid")
    if not uid:
        return jsonify({"error": "Missing uid"}), 400

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    if not name or not email:
        return jsonify({"error": "Name and email are required"}), 400

    age = data.get("age")
    phone = data.get("phone", "")
    department = data.get("department", "")
    designation = data.get("designation", "")
    education = data.get("education", [])
    skills = data.get("skills", [])
    experience = data.get("experience", [])

    if not skills:
        return jsonify({"error": "Please add at least one skill"}), 400

    conn = get_db()
    cur = conn.cursor()

    existing = cur.execute("SELECT id FROM users WHERE uid = ?", (uid,)).fetchone()
    if existing:
        user_id = existing["id"]
        cur.execute(
            """UPDATE users SET name=?, age=?, phone=?, email=?, department=?, designation=?
               WHERE id=?""",
            (name, age, phone, email, department, designation, user_id)
        )
        cur.execute("DELETE FROM user_education WHERE user_id=?", (user_id,))
        cur.execute("DELETE FROM user_skills WHERE user_id=?", (user_id,))
        cur.execute("DELETE FROM user_experience WHERE user_id=?", (user_id,))
    else:
        cur.execute(
            """INSERT INTO users (uid, name, age, phone, email, department, designation)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (uid, name, age, phone, email, department, designation)
        )
        user_id = cur.lastrowid

    for edu in education:
        if not (edu.get("degree") or edu.get("institution")):
            continue
        cur.execute(
            "INSERT INTO user_education (user_id, degree, institution, year) VALUES (?, ?, ?, ?)",
            (user_id, edu.get("degree", ""), edu.get("institution", ""), edu.get("year", ""))
        )

    for skill in skills:
        if not skill.get("name"):
            continue
        cur.execute(
            "INSERT INTO user_skills (user_id, skill_name, self_rated_level) VALUES (?, ?, ?)",
            (user_id, skill["name"], skill.get("level", "Beginner"))
        )

    for exp in experience:
        if not (exp.get("role") or exp.get("organization")):
            continue
        cur.execute(
            """INSERT INTO user_experience (user_id, role, organization, duration, description)
               VALUES (?, ?, ?, ?, ?)""",
            (user_id, exp.get("role", ""), exp.get("organization", ""), exp.get("duration", ""), exp.get("description", ""))
        )

    conn.commit()
    conn.close()

    return jsonify({"message": "Profile saved!", "user_id": user_id})


@app.route('/api/profile/<uid>', methods=['GET'])
def get_profile(uid):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE uid = ?", (uid,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "Profile not found"}), 404

    skills = conn.execute(
        "SELECT id, skill_name, self_rated_level FROM user_skills WHERE user_id = ?", (user["id"],)
    ).fetchall()
    education = conn.execute(
        "SELECT degree, institution, year FROM user_education WHERE user_id = ?", (user["id"],)
    ).fetchall()
    experience = conn.execute(
        "SELECT role, organization, duration, description FROM user_experience WHERE user_id = ?", (user["id"],)
    ).fetchall()
    conn.close()

    return jsonify({
        "name": user["name"], "age": user["age"], "phone": user["phone"], "email": user["email"],
        "department": user["department"], "designation": user["designation"],
        "skills": [dict(r) for r in skills],
        "education": [dict(r) for r in education],
        "experience": [dict(r) for r in experience],
    })


@app.route('/api/profile/<uid>/skills', methods=['POST'])
def add_profile_skill(uid):
    data = request.json or {}
    name = (data.get("name") or "").strip()
    level = data.get("level", "Beginner")

    if not name:
        return jsonify({"error": "Skill name is required"}), 400

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE uid = ?", (uid,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "Profile not found"}), 404

    existing = conn.execute(
        "SELECT id FROM user_skills WHERE user_id = ? AND LOWER(skill_name) = LOWER(?)",
        (user["id"], name)
    ).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "That skill is already on your profile"}), 400

    cur = conn.cursor()
    cur.execute(
        "INSERT INTO user_skills (user_id, skill_name, self_rated_level) VALUES (?, ?, ?)",
        (user["id"], name, level)
    )
    skill_id = cur.lastrowid
    conn.commit()
    conn.close()

    return jsonify({"id": skill_id, "skill_name": name, "self_rated_level": level})


@app.route('/api/profile/<uid>/skills/<int:skill_id>', methods=['DELETE'])
def remove_profile_skill(uid, skill_id):
    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE uid = ?", (uid,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "Profile not found"}), 404

    cur = conn.cursor()
    cur.execute("DELETE FROM user_skills WHERE id = ? AND user_id = ?", (skill_id, user["id"]))
    deleted = cur.rowcount
    conn.commit()
    conn.close()

    if not deleted:
        return jsonify({"error": "Skill not found"}), 404

    return jsonify({"message": "Skill removed"})


@app.route('/processed_status', methods=['GET'])
def processed_status():
    """Tells the Dashboard whether notes have been processed yet, so the
    Chat/Tests/Evaluate/Roadmap tiles can be locked until they are."""
    return jsonify({"processed": vector_store is not None})


@app.route('/staged_files', methods=['GET'])
def get_staged_files():
    return jsonify([
        {"filename": f["filename"], "source": f["source"], "title": f.get("title", f["filename"])}
        for f in staged_files
    ])


@app.route('/staged_files', methods=['DELETE'])
def clear_staged_files():
    global staged_files
    staged_files = []
    return jsonify({"message": "cleared"})

@app.route('/staged_files/<path:filename>', methods=['DELETE'])
def remove_staged_file(filename):
    global staged_files
    before = len(staged_files)
    staged_files = [f for f in staged_files if f["filename"] != filename]
    removed = before - len(staged_files)
    return jsonify({"message": "removed" if removed else "not found", "removed": removed > 0})

@app.route('/update_settings', methods=['POST'])
def update_settings():
    """Called from chat.html's 'Update Settings' button. Only updates
    session_context (language, weightage, bloom level, course outcomes,
    YouTube URL) — does NOT touch staged_files or vector_store."""
    global session_context

    data = request.json or {}
    yt_url = data.get("yt_url", "")
    outcomes = data.get("course_outcomes", "")
    bloom_index = data.get("bloom_level", "2")
    weightage = data.get("weightage", "4")
    language = data.get("language", "")

    bloom_map = {
        "1": "Remember (Define, list, memorize)",
        "2": "Understand (Explain, classify, discuss)",
        "3": "Apply (Solve, use, implement)",
        "4": "Analyze (Compare, contrast, examine)",
        "5": "Evaluate (Argue, judge, critique)",
        "6": "Create (Design, construct, develop)"
    }

    session_context["course_outcomes"] = outcomes
    session_context["bloom_level"] = bloom_map.get(bloom_index, "Understand")
    session_context["weightage"] = weightage
    session_context["language"] = language
    session_context["yt_url"] = yt_url

    return jsonify({"message": "Settings updated!"})


@app.route('/process', methods=['POST'])
def process_content():
    """Called from dashboard.html's 'Process Content' button. Builds the
    vector store from staged files, using whatever settings were last
    saved via /update_settings (defaults apply if none were set yet)."""
    global vector_store, session_context, staged_files

    if not staged_files:
        return jsonify({
            "error": "No notes to process yet. Upload notes or pick a book first."
        }), 400

    raw_text = get_pdf_text_from_staged(staged_files)

    yt_url = session_context.get("yt_url", "")
    if yt_url:
        raw_text += f"\nNote: User also provided a YouTube lecture at {yt_url}."

    text_chunks = get_text_chunks(raw_text)
    vector_store = get_vector_store(text_chunks)

    return jsonify({"message": f"Content processed at {session_context['bloom_level']} level!"})


# ---------------------------------------------------------------------------
# Tests: AI-generated MCQ tests from the processed notes, backed by the
# questions.db question bank.
# ---------------------------------------------------------------------------

VALID_DIFFICULTIES = ("easy", "medium", "hard")
VALID_QUESTION_COUNTS = (10, 20, 30, 40, 50)

DIFFICULTY_GUIDES = {
    "easy": "Basic recall and definition-level questions (Bloom's Remember/Understand level). Keep wording simple and direct.",
    "medium": "Applied, comparison, and scenario-based questions (Bloom's Apply/Analyze level).",
    "hard": "Deep analytical, evaluative, multi-concept questions that require connecting ideas (Bloom's Analyze/Evaluate/Create level)."
}


def _clean_json_response(raw_text):
    """Strip markdown code fences etc. so json.loads() succeeds."""
    cleaned = raw_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.MULTILINE)
    return cleaned.strip()


def _looks_like_front_matter(text):
    """Filters out chunks that are ABOUT the book itself — title page,
    copyright, author bio, preface, table of contents, or the book's own
    pedagogical apparatus (practice sets, review questions, exercises,
    edition-to-edition changes) — rather than actual subject content, so
    they never end up in the LLM's context."""
    lowered = text.lower()

    # Strong markers: content that is unambiguously about the book's
    # structure/history rather than the subject. A single hit is enough
    # to exclude the chunk.
    strong_markers = [
        "new to this edition", "changes in this edition", "changes to this edition",
        "what's new in this edition", "revised in this edition",
        "fourth edition", "third edition", "second edition", "fifth edition",
        "sixth edition", "seventh edition", "eighth edition", "ninth edition",
        "how to use this book", "organization of this book", "organization of the book",
        "practice set", "review questions", "review question",
        "end-of-chapter", "end of chapter", "supplementary material",
        "instructor's manual", "instructor resources", "companion website",
        "solutions manual", "study guide", "learning objectives for this chapter",
        "chapter summary", "chapter outline", "about this book",
    ]
    if any(marker in lowered for marker in strong_markers):
        return True

    # Weak markers: things like "published" or "www." can appear once in
    # ordinary subject content, so only exclude when several appear together
    # (a strong sign of a genuine copyright/imprint page).
    weak_markers = [
        "isbn", "copyright ©", "all rights reserved", "printed in",
        "library of congress", "about the author", "acknowledgments",
        "acknowledgements", "preface", "table of contents",
        "publisher", "published by", "www.",
        "trademark", "no part of this publication"
    ]
    hits = sum(1 for marker in weak_markers if marker in lowered)
    return hits >= 2


def _gather_test_context(num_questions):
    """Pulls a topically diverse, content-only sample of chunks from the
    processed notes for question generation."""
    seed_queries = [
        "definitions and key concepts explained",
        "how a process, mechanism, or algorithm works step by step",
        "real-world examples and applications",
        "comparison or difference between two or more types, methods, or approaches",
        "advantages, disadvantages, and limitations",
        "important techniques, models, or structures and their uses",
    ]

    k_per_query = max(4, min(10, (num_questions // len(seed_queries)) + 3))

    seen = set()
    good_docs = []
    for query in seed_queries:
        for doc in vector_store.similarity_search(query, k=k_per_query):
            key = doc.page_content[:120]
            if key in seen:
                continue
            seen.add(key)
            if _looks_like_front_matter(doc.page_content):
                continue
            good_docs.append(doc)

    return "\n\n".join(doc.page_content for doc in good_docs)


def _generate_questions_from_notes(difficulty, num_questions):
    """Uses the processed vector_store + Gemini to write new MCQs, then
    persists them (and the test itself) into questions.db."""
    global vector_store, staged_files

    if vector_store is None:
        return None, ("Please process your notes first from the Dashboard.", 400)

    context = _gather_test_context(num_questions)

    if not context.strip():
        return None, ("Couldn't find enough usable content in your notes to build a test.", 400)

    # Ask for a few extra questions since some will get dropped by the
    # quality filters below — this keeps the final count close to what
    # the user actually asked for.
    generation_target = num_questions + max(3, num_questions // 3)

    prompt = f"""
    You are an exam-setter creating a multiple choice question (MCQ) test for Indian college
    students, based ONLY on the SUBJECT MATTER in the context below.

    Difficulty: {difficulty.upper()} — {DIFFICULTY_GUIDES[difficulty]}
    Number of questions to generate: {generation_target}

    STRICT RULES — read carefully:
    1. Test the SUBJECT CONTENT only — concepts, definitions, processes, comparisons,
       applications, examples, advantages/disadvantages, cause-and-effect, classifications.
    2. NEVER ask about the book itself or how it is packaged/organized/taught from. This
       includes (but is not limited to) questions like:
       - "What is the primary purpose of 'Review questions' in a practice set?"
       - "What do 'Exercises' in a practice set typically require from the student?"
       - "What significant change was made to Chapter 8 in the Fourth Edition?"
       - anything about the author, publisher, title, edition, ISBN, chapter/page numbers,
         table of contents, preface, "review questions", "exercises", "practice sets",
         "learning objectives", or "according to the book/author...".
       If a piece of context is about the book's structure, pedagogy, or publishing history
       rather than the actual subject, IGNORE that piece of context entirely — do not
       write a question from it, even a "quick"/"easy" one.
    3. Write questions the way a professor would ask them in a real subject exam, for example:
       - "Which of the following is NOT a system call?"
       - "Where can ring topology be used?"
       - "Which of the following is not an application of reinforcement learning?"
       - "What is the primary purpose of X?" — where X is a real technical concept
         (e.g. "a semaphore", "a firewall", "normalization"), never a book section.
       - "Which technique is best suited for Y?"
       Mix straightforward "what is / which of these" questions with a good number of
       negative-form questions ("which of the following is NOT...", "all of the following
       EXCEPT...") and applied/scenario questions, matching the {difficulty} difficulty.
    4. All 4 options must be plausible and in the same category as each other (e.g. don't
       mix a real system call with three obviously made-up words) so the question actually
       requires understanding, not guessing by elimination.
    5. For EACH question, also give a short topic tag (2-4 words) naming the specific
       technical concept being tested (e.g. "System Calls", "Ring Topology", "Reinforcement
       Learning Applications") — never use the book title, "General", or "Chapter 1" as
       the topic.
    6. Before finalizing each question, double-check: could this question be answered by
       someone who has never read this material but knows how textbooks are structured?
       If yes, discard it and write a different question about the actual subject instead.

    Return ONLY a valid JSON array (no markdown fences, no commentary) where every item has
    exactly this shape:
    {{
      "topic": "short topic name",
      "question": "the question text",
      "options": {{"a": "...", "b": "...", "c": "...", "d": "..."}},
      "correct_option": "a",
      "explanation": "1-2 sentence explanation of why the correct answer is correct"
    }}

    Context:
    {context}
    """

    try:
        model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=api_key, temperature=0.5)
        response = model.invoke(prompt)
        questions = json.loads(_clean_json_response(response.content))
    except Exception as e:
        print(f"Error generating test: {str(e)}")
        return None, ("Failed to generate the test. Please try again.", 500)

    # Safety net: drop any question that still slipped in book-metadata or
    # book-structure trivia instead of real subject content.
    banned_phrases = (
        "author", "publisher", "isbn", "the book", "this book", "edition",
        "table of contents", "practice set", "review question", "exercises",
        "exercise", "chapter", "preface", "instructor", "workbook",
        "study guide", "companion website", "supplementary material",
        "learning objective", "appendix"
    )
    questions = [
        q for q in questions
        if isinstance(q.get("question"), str)
        and not any(phrase in q["question"].lower() for phrase in banned_phrases)
    ]

    if not questions:
        return None, ("Generated questions didn't pass quality checks. Please try again.", 500)

    # Trim back to what the user actually asked for (we over-generated on
    # purpose to absorb the filtering above).
    questions = questions[:num_questions]

    source_title = ", ".join(sorted({f.get("title", f["filename"]) for f in staged_files})) or "Uploaded Notes"

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO tests (difficulty, num_questions, source_title) VALUES (?, ?, ?)",
        (difficulty, len(questions), source_title)
    )
    test_id = cur.lastrowid

    saved_questions = []
    for i, q in enumerate(questions):
        try:
            options = q["options"]
            cur.execute(
                """INSERT INTO questions
                   (topic, difficulty, question_text, option_a, option_b, option_c, option_d,
                    correct_option, explanation, source_title)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    q.get("topic", "General"), difficulty, q["question"],
                    options["a"], options["b"], options["c"], options["d"],
                    q["correct_option"], q.get("explanation", ""), source_title
                )
            )
            question_id = cur.lastrowid
            cur.execute(
                "INSERT INTO test_questions (test_id, question_id, question_order) VALUES (?, ?, ?)",
                (test_id, question_id, i)
            )
            saved_questions.append({
                "id": question_id,
                "topic": q.get("topic", "General"),
                "question": q["question"],
                "options": options,
                "correct_option": q["correct_option"],
                "explanation": q.get("explanation", "")
            })
        except (KeyError, TypeError):
            continue  # skip malformed items rather than failing the whole test

    conn.commit()
    conn.close()

    return {
        "test_id": test_id,
        "difficulty": difficulty,
        "source_title": source_title,
        "questions": saved_questions
    }, None


def _generate_test_from_bank(difficulty, num_questions):
    """Assembles a test from previously stored questions instead of calling
    the LLM — this is the path used to assess new users."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM questions WHERE difficulty = ? ORDER BY RANDOM() LIMIT ?",
        (difficulty, num_questions)
    ).fetchall()

    if not rows:
        conn.close()
        return None, (
            f"No stored {difficulty} questions in the bank yet. "
            "Generate a test from notes first to build up the bank.", 400
        )

    cur = conn.cursor()
    cur.execute(
        "INSERT INTO tests (difficulty, num_questions, source_title) VALUES (?, ?, ?)",
        (difficulty, len(rows), "Question Bank")
    )
    test_id = cur.lastrowid

    saved_questions = []
    for i, row in enumerate(rows):
        cur.execute(
            "INSERT INTO test_questions (test_id, question_id, question_order) VALUES (?, ?, ?)",
            (test_id, row["id"], i)
        )
        saved_questions.append({
            "id": row["id"],
            "topic": row["topic"],
            "question": row["question_text"],
            "options": {
                "a": row["option_a"], "b": row["option_b"],
                "c": row["option_c"], "d": row["option_d"]
            },
            "correct_option": row["correct_option"],
            "explanation": row["explanation"]
        })

    conn.commit()
    conn.close()

    return {
        "test_id": test_id,
        "difficulty": difficulty,
        "source_title": "Question Bank",
        "questions": saved_questions
    }, None


@app.route('/generate_test', methods=['POST'])
def generate_test():
    data = request.json or {}
    difficulty = data.get("difficulty", "medium")
    num_questions = data.get("num_questions", 10)
    source = data.get("source", "notes")  # "notes" | "bank"
    uid = data.get("uid")  # optional — links this test to a user for their Evaluate history

    if difficulty not in VALID_DIFFICULTIES:
        difficulty = "medium"
    try:
        num_questions = int(num_questions)
    except (TypeError, ValueError):
        num_questions = 10
    if num_questions not in VALID_QUESTION_COUNTS:
        num_questions = 10

    if source == "bank":
        result, error = _generate_test_from_bank(difficulty, num_questions)
    else:
        result, error = _generate_questions_from_notes(difficulty, num_questions)

    if error:
        message, status_code = error
        return jsonify({"error": message}), status_code

    if uid:
        conn = get_db()
        user = conn.execute("SELECT id FROM users WHERE uid = ?", (uid,)).fetchone()
        if user:
            conn.execute("UPDATE tests SET user_id = ? WHERE id = ?", (user["id"], result["test_id"]))
            conn.commit()
        conn.close()

    return jsonify(result)


@app.route('/submit_test', methods=['POST'])
def submit_test():
    data = request.json or {}
    test_id = data.get("test_id")
    score = data.get("score")
    total = data.get("total")
    uid = data.get("uid")
    answers = data.get("answers", {})  # { "<question_id>": "a" }

    if test_id is None or score is None or total is None:
        return jsonify({"error": "Missing test_id, score, or total"}), 400

    conn = get_db()
    cur = conn.cursor()

    user_id = None
    if uid:
        user = cur.execute("SELECT id FROM users WHERE uid = ?", (uid,)).fetchone()
        if user:
            user_id = user["id"]
            cur.execute("UPDATE tests SET user_id = ? WHERE id = ?", (user_id, test_id))

    cur.execute(
        "INSERT INTO test_attempts (test_id, score, total, user_id) VALUES (?, ?, ?, ?)",
        (test_id, score, total, user_id)
    )

    for question_id, selected_option in answers.items():
        cur.execute(
            "INSERT INTO user_answers (test_id, question_id, selected_option) VALUES (?, ?, ?)",
            (test_id, question_id, selected_option)
        )

    conn.commit()
    conn.close()

    if user_id:
        _update_skill_competency_and_progress(user_id, test_id)

    return jsonify({"message": "Result saved!"})


@app.route('/questions_bank', methods=['GET'])
def questions_bank():
    """Lists how many stored questions exist per topic/difficulty — useful
    later for an admin view of the growing question bank."""
    conn = get_db()
    rows = conn.execute(
        "SELECT topic, difficulty, COUNT(*) as count FROM questions GROUP BY topic, difficulty ORDER BY topic"
    ).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


# ---------------------------------------------------------------------------
# Initial skill/competency assessment — generated from the skills a new user
# entered during signup rather than from any uploaded notes.
# ---------------------------------------------------------------------------

# 20 questions is for demonstration only; bump this once deployed (e.g. 50+).
# The 50/25/25 easy/medium/hard split is recalculated automatically for
# whatever total you set here.
SKILL_TEST_TOTAL_QUESTIONS = 20


def _skill_test_distribution(total):
    easy = round(total * 0.5)
    medium = round(total * 0.25)
    hard = total - easy - medium
    return easy, medium, hard


def _generate_skill_questions(skills, easy_count, medium_count, hard_count):
    skill_names = [s["name"].strip() for s in skills if s.get("name", "").strip()]
    if not skill_names:
        return None, ("No skills to test.", 400)

    total = easy_count + medium_count + hard_count
    skills_list_str = ", ".join(skill_names)

    prompt = f"""
    You are an examiner creating an initial competency assessment MCQ test for a new employee,
    covering the following self-declared skills: {skills_list_str}.

    Generate EXACTLY {total} multiple choice questions:
    - {easy_count} EASY questions (basic recall/definition-level, Bloom's Remember/Understand)
    - {medium_count} MEDIUM questions (applied/comparison-level, Bloom's Apply/Analyze)
    - {hard_count} HARD questions (deep analytical/scenario-level, Bloom's Analyze/Evaluate)

    Spread the questions across ALL the listed skills as evenly as possible — don't test only
    one or two skills. Each question must test real, practical knowledge of one of the listed
    skills: concepts, syntax, best practices, real-world usage, common pitfalls, or comparisons
    between tools/techniques within that skill.

    STRICT RULES:
    1. Never ask about this test, this platform, or any meta-topic — only real technical or
       professional knowledge of the named skills.
    2. Write questions the way a real interviewer/examiner would, e.g.:
       - "Which of the following is NOT a valid way to handle exceptions in Python?"
       - "Which SQL clause is used to filter grouped results?"
       - "Which of the following is not a principle of good UX design?"
       Mix straightforward and negative-form ("NOT", "EXCEPT") questions.
    3. All 4 options must be plausible and in the same category, so the question requires real
       understanding rather than guessing by elimination.
    4. The "topic" field for each question MUST be exactly one of these skill names:
       {skill_names}. Pick whichever skill the question actually tests.
    5. Include a "difficulty" field for each question — exactly one of: "easy", "medium", "hard".

    Return ONLY a valid JSON array (no markdown fences, no commentary) where every item has
    exactly this shape:
    {{
      "topic": "one of the exact skill names above",
      "difficulty": "easy" | "medium" | "hard",
      "question": "the question text",
      "options": {{"a": "...", "b": "...", "c": "...", "d": "..."}},
      "correct_option": "a",
      "explanation": "1-2 sentence explanation of why the correct answer is correct"
    }}
    """

    try:
        model = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=api_key, temperature=0.5)
        response = model.invoke(prompt)
        questions = json.loads(_clean_json_response(response.content))
    except Exception as e:
        print(f"Error generating skill test: {str(e)}")
        return None, ("Failed to generate the skill assessment. Please try again.", 500)

    banned_phrases = ("this test", "this platform", "this assessment", "the app", "blitzlearn")
    cleaned = [
        q for q in questions
        if isinstance(q.get("question"), str)
        and not any(p in q["question"].lower() for p in banned_phrases)
        and q.get("difficulty") in ("easy", "medium", "hard")
        and q.get("topic")
    ]

    if not cleaned:
        return None, ("Generated questions didn't pass quality checks. Please try again.", 500)

    return cleaned, None


@app.route('/generate_skill_test', methods=['POST'])
def generate_skill_test():
    data = request.json or {}
    uid = data.get("uid")
    if not uid:
        return jsonify({"error": "Missing uid"}), 400

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE uid = ?", (uid,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "Profile not found. Please complete signup first."}), 404

    skill_rows = conn.execute(
        "SELECT skill_name, self_rated_level FROM user_skills WHERE user_id = ?", (user["id"],)
    ).fetchall()
    skills = [{"name": r["skill_name"], "level": r["self_rated_level"]} for r in skill_rows]

    if not skills:
        conn.close()
        return jsonify({"error": "No skills found on your profile."}), 400

    easy_count, medium_count, hard_count = _skill_test_distribution(SKILL_TEST_TOTAL_QUESTIONS)
    questions, error = _generate_skill_questions(skills, easy_count, medium_count, hard_count)

    if error:
        conn.close()
        message, status_code = error
        return jsonify({"error": message}), status_code

    cur = conn.cursor()
    cur.execute(
        "INSERT INTO tests (difficulty, num_questions, source_title, user_id) VALUES (?, ?, ?, ?)",
        ("mixed", len(questions), "Initial Skill Assessment", user["id"])
    )
    test_id = cur.lastrowid

    saved_questions = []
    for i, q in enumerate(questions):
        try:
            options = q["options"]
            cur.execute(
                """INSERT INTO questions
                   (topic, difficulty, question_text, option_a, option_b, option_c, option_d,
                    correct_option, explanation, source_title)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    q["topic"], q["difficulty"], q["question"],
                    options["a"], options["b"], options["c"], options["d"],
                    q["correct_option"], q.get("explanation", ""), "Initial Skill Assessment"
                )
            )
            question_id = cur.lastrowid
            cur.execute(
                "INSERT INTO test_questions (test_id, question_id, question_order) VALUES (?, ?, ?)",
                (test_id, question_id, i)
            )
            saved_questions.append({
                "id": question_id,
                "topic": q["topic"],
                "difficulty": q["difficulty"],
                "question": q["question"],
                "options": options,
                "correct_option": q["correct_option"],
                "explanation": q.get("explanation", "")
            })
        except (KeyError, TypeError):
            continue

    conn.commit()
    conn.close()

    if not saved_questions:
        return jsonify({"error": "Failed to generate a usable skill assessment. Please try again."}), 500

    return jsonify({
        "test_id": test_id,
        "skills": [s["name"] for s in skills],
        "questions": saved_questions
    })


def _proficiency_label(percent):
    if percent >= 80:
        return "Advanced"
    if percent >= 50:
        return "Intermediate"
    return "Beginner"


@app.route('/submit_skill_test', methods=['POST'])
def submit_skill_test():
    """Scores the assessment SERVER-SIDE (unlike the practice tests, which
    score client-side) since this result feeds a formal competency report."""
    data = request.json or {}
    uid = data.get("uid")
    test_id = data.get("test_id")
    answers = data.get("answers", {})  # { "<question_id>": "a" }

    if not uid or not test_id:
        return jsonify({"error": "Missing uid or test_id"}), 400

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE uid = ?", (uid,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "Profile not found."}), 404

    rows = conn.execute(
        """SELECT q.id, q.topic, q.difficulty, q.correct_option
           FROM test_questions tq
           JOIN questions q ON q.id = tq.question_id
           WHERE tq.test_id = ?
           ORDER BY tq.question_order""",
        (test_id,)
    ).fetchall()

    if not rows:
        conn.close()
        return jsonify({"error": "Test not found."}), 404

    skill_stats = {}
    overall_correct = 0

    for row in rows:
        topic = row["topic"] or "General"
        skill_stats.setdefault(topic, {"correct": 0, "total": 0})
        skill_stats[topic]["total"] += 1

        selected = answers.get(str(row["id"]))
        if selected == row["correct_option"]:
            skill_stats[topic]["correct"] += 1
            overall_correct += 1

    overall_total = len(rows)

    skills_breakdown = []
    for topic, stats in skill_stats.items():
        percent = round((stats["correct"] / stats["total"]) * 100) if stats["total"] else 0
        skills_breakdown.append({
            "skill": topic,
            "correct": stats["correct"],
            "total": stats["total"],
            "percent": percent,
            "level": _proficiency_label(percent)
        })
    skills_breakdown.sort(key=lambda s: s["percent"])

    cur = conn.cursor()
    cur.execute(
        "INSERT INTO test_attempts (test_id, score, total, user_id) VALUES (?, ?, ?, ?)",
        (test_id, overall_correct, overall_total, user["id"])
    )

    for row in rows:
        selected = answers.get(str(row["id"]))
        cur.execute(
            "INSERT INTO user_answers (test_id, question_id, selected_option) VALUES (?, ?, ?)",
            (test_id, row["id"], selected)
        )
    cur.execute(
        """INSERT INTO skill_reports (user_id, test_id, overall_score, overall_total, skills_breakdown)
           VALUES (?, ?, ?, ?, ?)""",
        (user["id"], test_id, overall_correct, overall_total, json.dumps(skills_breakdown))
    )
    report_id = cur.lastrowid
    conn.commit()
    conn.close()

    _update_skill_competency_and_progress(user["id"], test_id)

    return jsonify({
        "report_id": report_id,
        "overall_score": overall_correct,
        "overall_total": overall_total,
        "skills": skills_breakdown
    })


@app.route('/api/skill_report/<uid>', methods=['GET'])
def get_latest_skill_report(uid):
    """Fallback for report.html if sessionStorage is empty (e.g. page refresh)
    — returns the user's most recent skill assessment report."""
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE uid = ?", (uid,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"error": "Profile not found."}), 404

    report = conn.execute(
        "SELECT * FROM skill_reports WHERE user_id = ? ORDER BY generated_at DESC LIMIT 1",
        (user["id"],)
    ).fetchone()
    conn.close()

    if not report:
        return jsonify({"error": "No report found yet."}), 404

    return jsonify({
        "report_id": report["id"],
        "overall_score": report["overall_score"],
        "overall_total": report["overall_total"],
        "skills": json.loads(report["skills_breakdown"]),
        "generated_at": report["generated_at"],
        "name": user["name"]
    })


# ---------------------------------------------------------------------------
# Evaluate page — test history, skill radar, gap analysis, topic
# prioritization, and progress-over-time. All keyed off the same
# tests / test_attempts / user_answers / skill_reports tables the rest of
# the app already writes to.
# ---------------------------------------------------------------------------

# Placeholder competency-target model: since there's no real job-role /
# iGOT competency framework wired in yet, every skill is measured against
# a flat target percentage, lightly adjusted by designation seniority.
# Swap this for real per-role target data once that framework exists.
DEFAULT_SKILL_TARGET_PERCENT = 75


def _target_percent_for_designation(designation):
    designation = (designation or "").lower()
    if any(word in designation for word in ("senior", "lead", "head", "principal", "chief")):
        return 85
    if any(word in designation for word in ("intern", "trainee", "junior", "associate")):
        return 65
    return DEFAULT_SKILL_TARGET_PERCENT


def _get_user_row(uid):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE uid = ?", (uid,)).fetchone()
    conn.close()
    return user


@app.route('/api/my_tests/<uid>', methods=['GET'])
def get_my_tests(uid):
    """All tests (skill assessments + practice tests) this user has taken,
    newest first, each with its latest attempt score if one exists."""
    user = _get_user_row(uid)
    if not user:
        return jsonify({"error": "Profile not found."}), 404

    conn = get_db()
    tests = conn.execute(
        "SELECT * FROM tests WHERE user_id = ? ORDER BY created_at DESC", (user["id"],)
    ).fetchall()

    result = []
    for t in tests:
        attempt = conn.execute(
            "SELECT * FROM test_attempts WHERE test_id = ? ORDER BY taken_at DESC LIMIT 1",
            (t["id"],)
        ).fetchone()

        percent = None
        if attempt and attempt["total"]:
            percent = round((attempt["score"] / attempt["total"]) * 100)

        result.append({
            "test_id": t["id"],
            "difficulty": t["difficulty"],
            "num_questions": t["num_questions"],
            "source_title": t["source_title"],
            "created_at": t["created_at"],
            "score": attempt["score"] if attempt else None,
            "total": attempt["total"] if attempt else None,
            "percent": percent,
            "attempted": attempt is not None,
        })

    conn.close()
    return jsonify(result)


@app.route('/api/test_detail/<int:test_id>', methods=['GET'])
def get_test_detail(test_id):
    """Full question-by-question breakdown for one test, including what the
    user actually selected — powers the expandable row in Evaluate's test
    history list."""
    conn = get_db()
    rows = conn.execute(
        """SELECT q.id, q.topic, q.difficulty, q.question_text, q.option_a, q.option_b,
                  q.option_c, q.option_d, q.correct_option, q.explanation, ua.selected_option
           FROM test_questions tq
           JOIN questions q ON q.id = tq.question_id
           LEFT JOIN user_answers ua ON ua.test_id = tq.test_id AND ua.question_id = q.id
           WHERE tq.test_id = ?
           ORDER BY tq.question_order""",
        (test_id,)
    ).fetchall()
    conn.close()

    if not rows:
        return jsonify({"error": "Test not found."}), 404

    questions = [{
        "id": r["id"],
        "topic": r["topic"],
        "difficulty": r["difficulty"],
        "question": r["question_text"],
        "options": {"a": r["option_a"], "b": r["option_b"], "c": r["option_c"], "d": r["option_d"]},
        "correct_option": r["correct_option"],
        "explanation": r["explanation"],
        "selected_option": r["selected_option"],
    } for r in rows]

    return jsonify({"test_id": test_id, "questions": questions})


@app.route('/api/skill_radar/<uid>', methods=['GET'])
def get_skill_radar(uid):
    """Current competency per declared skill, for the radar/spider chart.
    Reads the running skill_competency tally, which is updated by EVERY
    test taken (practice tests, question bank, and the formal assessment
    alike) — not just a one-time snapshot."""
    user = _get_user_row(uid)
    if not user:
        return jsonify({"error": "Profile not found."}), 404

    conn = get_db()
    skill_rows = conn.execute(
        "SELECT skill_name FROM user_skills WHERE user_id = ?", (user["id"],)
    ).fetchall()
    declared_skills = [r["skill_name"] for r in skill_rows]

    competency_rows = conn.execute(
        "SELECT skill_name, correct_count, total_count FROM skill_competency WHERE user_id = ?",
        (user["id"],)
    ).fetchall()
    conn.close()

    competency_map = {
        r["skill_name"]: round((r["correct_count"] / r["total_count"]) * 100) if r["total_count"] else 0
        for r in competency_rows
    }

    if not competency_map:
        return jsonify({
            "has_data": False, "skills": [],
            "message": "Take a test that covers your skills first."
        })

    skills = [{"skill": name, "percent": competency_map.get(name, 0)} for name in declared_skills]

    return jsonify({"has_data": True, "skills": skills})


@app.route('/api/skill_gap/<uid>', methods=['GET'])
def get_skill_gap(uid):
    """Current vs target percentage per skill, sorted by biggest gap first
    — this list doubles as the Topic Prioritization ranking (largest gap =
    highest priority to study next). Current level comes from the running
    skill_competency tally (same source as the radar chart)."""
    user = _get_user_row(uid)
    if not user:
        return jsonify({"error": "Profile not found."}), 404

    conn = get_db()
    skill_rows = conn.execute(
        "SELECT skill_name FROM user_skills WHERE user_id = ?", (user["id"],)
    ).fetchall()
    declared_skills = [r["skill_name"] for r in skill_rows]

    competency_rows = conn.execute(
        "SELECT skill_name, correct_count, total_count FROM skill_competency WHERE user_id = ?",
        (user["id"],)
    ).fetchall()
    conn.close()

    competency_map = {
        r["skill_name"]: round((r["correct_count"] / r["total_count"]) * 100) if r["total_count"] else 0
        for r in competency_rows
    }

    if not competency_map:
        return jsonify({"has_data": False, "skills": []})

    target = _target_percent_for_designation(user["designation"])

    gaps = []
    for skill_name in declared_skills:
        current_percent = competency_map.get(skill_name, 0)
        gap = max(0, target - current_percent)
        if gap >= 25:
            priority = "High"
        elif gap >= 10:
            priority = "Medium"
        elif gap > 0:
            priority = "Low"
        else:
            priority = "On Target"
        gaps.append({
            "skill": skill_name,
            "current_percent": current_percent,
            "target_percent": target,
            "gap": gap,
            "priority": priority,
        })

    gaps.sort(key=lambda g: g["gap"], reverse=True)

    return jsonify({"has_data": True, "target_percent": target, "skills": gaps})


@app.route('/api/progress_history/<uid>', methods=['GET'])
def get_progress_history(uid):
    """Overall competency percentage over time, with one point per test
    that actually touched a declared skill — this now reflects EVERY test
    taken, not just the formal assessment."""
    user = _get_user_row(uid)
    if not user:
        return jsonify({"error": "Profile not found."}), 404

    conn = get_db()
    rows = conn.execute(
        "SELECT overall_percent, taken_at FROM progress_snapshots WHERE user_id = ? ORDER BY taken_at ASC",
        (user["id"],)
    ).fetchall()
    conn.close()

    history = [{"generated_at": r["taken_at"], "percent": r["overall_percent"]} for r in rows]
    return jsonify(history)


@app.route('/ask', methods=['POST'])
def ask_question():
    global vector_store, session_context
    user_question = request.json.get("question")

    if vector_store is None:
        return jsonify({"answer": "Please process your notes first (Dashboard → upload/pick a book → Process Content)."})

    docs = vector_store.similarity_search(user_question)

    chain = get_conversational_chain(
        session_context["bloom_level"],
        session_context["course_outcomes"],
        session_context["weightage"],
        session_context["language"],
        session_context["study_mode"],
        session_context["vibe_type"]
    )

    response = chain({"input_documents": docs, "question": user_question}, return_only_outputs=True)
    return jsonify({"answer": response["output_text"]})


@app.route('/mode-change', methods=['POST'])
def mode_change():
    global session_context

    data = request.json
    study_mode = data.get("study_mode", "normal")
    vibe_type = data.get("vibe_type", "default")

    session_context["study_mode"] = study_mode
    session_context["vibe_type"] = vibe_type

    return jsonify({
        "message": f"Mode changed to {study_mode}",
        "study_mode": study_mode,
        "vibe_type": vibe_type
    })


@app.route('/prioritize_topics', methods=['POST'])
def prioritize_topics():
    global vector_store, session_context

    if vector_store is None:
        return jsonify({"error": "Please process a PDF first."}), 400

    try:
        prompt = f"""
        Based on the course content provided, identify and list the main topics covered.
        Prioritize them in ascending order of importance for exam preparation, considering:
        - Course outcomes: {session_context.get('course_outcomes', 'Not specified')}
        - Bloom's level: {session_context.get('bloom_level', 'Not specified')}
        - Topic weightage: {session_context.get('weightage', 'Not specified')} marks
        
        Return ONLY a numbered list of topics, one per line, starting with the LEAST important 
        and ending with the MOST important. Format: just the topic names, no explanations.
        Maximum 10-15 topics.
        """

        docs = vector_store.similarity_search("main topics covered in this course", k=10)

        model = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=api_key,
            temperature=0.3
        )

        context = "\n".join([doc.page_content for doc in docs])
        full_prompt = f"Context:\n{context}\n\n{prompt}"

        response = model.invoke(full_prompt)

        topics_text = response.content
        topics = []

        for line in topics_text.split('\n'):
            line = line.strip()
            if line and not line.startswith('#'):
                cleaned = line.lstrip('0123456789.- )')
                if cleaned:
                    topics.append(cleaned)

        topics = topics[:15]

        return jsonify({"topics": topics})

    except Exception as e:
        print(f"Error in prioritize_topics: {str(e)}")
        return jsonify({"error": "Failed to prioritize topics. Please try again."}), 500


# ---------------------------------------------------------------------------
# Admin API — user management, search/sort, and reporting
# ---------------------------------------------------------------------------

def _latest_reports(conn):
    """One row per user: their most recent skill_reports entry, joined with
    the user's name/department/designation."""
    return conn.execute("""
        SELECT sr.*, u.name, u.department, u.designation FROM skill_reports sr
        INNER JOIN (
            SELECT user_id, MAX(generated_at) as max_date
            FROM skill_reports GROUP BY user_id
        ) latest ON sr.user_id = latest.user_id AND sr.generated_at = latest.max_date
        JOIN users u ON u.id = sr.user_id
    """).fetchall()


@app.route('/admin/api/departments', methods=['GET'])
@admin_required
def admin_departments():
    conn = get_db()
    rows = conn.execute(
        "SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department != '' ORDER BY department"
    ).fetchall()
    conn.close()
    return jsonify([r["department"] for r in rows])


@app.route('/admin/api/users', methods=['GET'])
@admin_required
def admin_list_users():
    """Lists all users with search (name/email), department filter, status
    filter, and sorting — all driven by query params so the dashboard can
    hit this one endpoint for every toolbar combination."""
    q = request.args.get("q", "").strip().lower()
    department = request.args.get("department", "").strip()
    status_filter = request.args.get("status", "").strip()
    sort_by = request.args.get("sort_by", "name")  # name | department | score | created_at

    conn = get_db()
    users = conn.execute("SELECT * FROM users").fetchall()

    reports = _latest_reports(conn)
    conn.close()
    report_map = {r["user_id"]: r for r in reports}

    result = []
    for u in users:
        if q and q not in (u["name"] or "").lower() and q not in (u["email"] or "").lower():
            continue
        if department and (u["department"] or "") != department:
            continue
        user_status = u["status"] or "active"
        if status_filter and user_status != status_filter:
            continue

        report = report_map.get(u["id"])
        percent = None
        if report and report["overall_total"]:
            percent = round((report["overall_score"] / report["overall_total"]) * 100)

        result.append({
            "id": u["id"],
            "uid": u["uid"],
            "name": u["name"],
            "email": u["email"],
            "phone": u["phone"],
            "age": u["age"],
            "department": u["department"] or "Unassigned",
            "designation": u["designation"] or "",
            "status": user_status,
            "score_percent": percent,
            "created_at": u["created_at"],
        })

    if sort_by == "department":
        result.sort(key=lambda x: (x["department"] or "").lower())
    elif sort_by == "score":
        result.sort(key=lambda x: (x["score_percent"] is not None, x["score_percent"] or 0), reverse=True)
    elif sort_by == "created_at":
        result.sort(key=lambda x: x["created_at"] or "", reverse=True)
    else:
        result.sort(key=lambda x: (x["name"] or "").lower())

    return jsonify(result)


@app.route('/admin/api/users/<int:user_id>/status', methods=['POST'])
@admin_required
def admin_update_user_status(user_id):
    data = request.json or {}
    new_status = data.get("status")
    if new_status not in ("active", "disabled"):
        return jsonify({"error": "Status must be 'active' or 'disabled'"}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET status = ? WHERE id = ?", (new_status, user_id))
    updated = cur.rowcount
    conn.commit()
    conn.close()

    if not updated:
        return jsonify({"error": "User not found"}), 404

    verb = "enabled" if new_status == "active" else "disabled"
    return jsonify({"message": f"Account {verb}."})


@app.route('/admin/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def admin_delete_user(user_id):
    """Deletes the user and all their child records from BlitzLearn's own
    database. Does NOT delete their Firebase Auth account — that requires
    the Firebase Admin SDK (a service account), which isn't wired up here."""
    conn = get_db()
    cur = conn.cursor()

    existing = cur.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "User not found"}), 404

    cur.execute("DELETE FROM user_education WHERE user_id = ?", (user_id,))
    cur.execute("DELETE FROM user_skills WHERE user_id = ?", (user_id,))
    cur.execute("DELETE FROM user_experience WHERE user_id = ?", (user_id,))
    cur.execute("DELETE FROM skill_reports WHERE user_id = ?", (user_id,))
    cur.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

    return jsonify({
        "message": "User deleted from BlitzLearn's records. Their login account (Firebase) "
                    "was not removed — that needs to be done separately via Firebase console/Admin SDK."
    })


@app.route('/admin/api/performance', methods=['GET'])
@admin_required
def admin_performance():
    """Ranks every user who has at least one skill report, by their latest
    overall score percentage — powers the top/bottom performer cards and
    the full leaderboard."""
    conn = get_db()
    reports = _latest_reports(conn)
    conn.close()

    ranked = []
    for r in reports:
        percent = round((r["overall_score"] / r["overall_total"]) * 100) if r["overall_total"] else 0
        ranked.append({
            "user_id": r["user_id"],
            "name": r["name"],
            "department": r["department"] or "Unassigned",
            "designation": r["designation"] or "",
            "score_percent": percent,
            "score": r["overall_score"],
            "total": r["overall_total"],
        })

    if not ranked:
        return jsonify({"top": None, "bottom": None, "all": []})

    ranked.sort(key=lambda x: x["score_percent"], reverse=True)

    return jsonify({
        "top": ranked[0],
        "bottom": ranked[-1] if len(ranked) > 1 else None,
        "all": ranked,
    })


@app.route('/admin/api/department_report', methods=['GET'])
@admin_required
def admin_department_report():
    """Per-department rollup: headcount, how many have taken the skill
    assessment, average overall score, and average per-skill score across
    everyone assessed in that department."""
    conn = get_db()
    users = conn.execute("SELECT * FROM users").fetchall()
    reports = _latest_reports(conn)
    conn.close()

    dept_data = {}
    for u in users:
        dept = u["department"] or "Unassigned"
        dept_data.setdefault(dept, {"user_count": 0, "assessed_count": 0, "scores": [], "skills": {}})
        dept_data[dept]["user_count"] += 1

    for r in reports:
        dept = r["department"] or "Unassigned"
        dept_data.setdefault(dept, {"user_count": 0, "assessed_count": 0, "scores": [], "skills": {}})
        percent = round((r["overall_score"] / r["overall_total"]) * 100) if r["overall_total"] else 0
        dept_data[dept]["assessed_count"] += 1
        dept_data[dept]["scores"].append(percent)

        skills_breakdown = json.loads(r["skills_breakdown"]) if r["skills_breakdown"] else []
        for s in skills_breakdown:
            dept_data[dept]["skills"].setdefault(s["skill"], []).append(s["percent"])

    report = []
    for dept, data in dept_data.items():
        avg_score = round(sum(data["scores"]) / len(data["scores"])) if data["scores"] else None
        skills_avg = [
            {"skill": name, "avg_percent": round(sum(vals) / len(vals))}
            for name, vals in data["skills"].items()
        ]
        skills_avg.sort(key=lambda s: s["avg_percent"])

        report.append({
            "department": dept,
            "user_count": data["user_count"],
            "assessed_count": data["assessed_count"],
            "avg_score_percent": avg_score,
            "skills": skills_avg,
        })

    report.sort(key=lambda d: d["department"])
    return jsonify(report)


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, port=5000, host='0.0.0.0')