import os
import io
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, Response
from PyPDF2 import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.chains.question_answering import load_qa_chain
from langchain.prompts import PromptTemplate

load_dotenv()
app = Flask(__name__)

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
    return render_template('dashboard.html')


@app.route('/evaluate')
def evaluate():
    return render_template('dashboard.html')


@app.route('/roadmap')
def roadmap():
    return render_template('dashboard.html')


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
        apiKey: "{os.environ['FIREBASE_API_KEY']}",
        authDomain: "{os.environ['FIREBASE_AUTH_DOMAIN']}",
        projectId: "{os.environ['FIREBASE_PROJECT_ID']}",
        storageBucket: "{os.environ['FIREBASE_STORAGE_BUCKET']}",
        messagingSenderId: "{os.environ['FIREBASE_MESSAGING_SENDER_ID']}",
        appId: "{os.environ['FIREBASE_APP_ID']}",
        measurementId: "{os.environ.get('FIREBASE_MEASUREMENT_ID', '')}"
    }};

    if (!firebase.apps.length) {{
        firebase.initializeApp(firebaseConfig);
    }}
    const auth = firebase.auth();
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


@app.route('/processed_status', methods=['GET'])
def processed_status():
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


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, port=5000, host='0.0.0.0')