import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from PyPDF2 import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
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

def get_pdf_text(pdf_files):
    text = ""
    for pdf in pdf_files:
        pdf_reader = PdfReader(pdf)
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
def index():
    return render_template('index.html')

import os
from flask import Response

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

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/terms')
def terms():
    return render_template('terms.html')

@app.route('/process', methods=['POST'])
def process_content():
    global vector_store, session_context
    
    pdf_files = request.files.getlist("pdf_files")
    yt_url = request.form.get("yt_url", "")
    outcomes = request.form.get("course_outcomes", "")
    bloom_index = request.form.get("bloom_level", "2")
    weightage = request.form.get('weightage', "4")
    language = request.form.get('language', "")
    
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

    if not pdf_files or pdf_files[0].filename == '':
        return jsonify({"error": "No PDF files uploaded"}), 400

    raw_text = get_pdf_text(pdf_files)
    
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
        return jsonify({"answer": "Please process a PDF first."})

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