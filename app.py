import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from PyPDF2 import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
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
    "yt_url": ""
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
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    store = FAISS.from_texts(text_chunks, embedding=embeddings)
    return store

def get_conversational_chain(bloom_level, outcomes, weightage, language):
    prompt_template = f"""
    You are an academic tutor. Answer the question based on the provided context, 
    keeping the learner's Goal, Cognitive Level, and Topic Weightage in mind.

    Learner's Course Outcomes: {outcomes}
    Target Bloom's Taxonomy Level: {bloom_level}
    Topic Weightage in Exam: {weightage} marks
    Preferred output language: {language}
    ** Strictly give the text output in the preferred language

    Instructions:
    1. Use the provided context to answer.
    2. Adjust your explanation style to match the Bloom's Level (e.g., 'Analyze' should compare/contrast, 'Remember' should define).
    3. For higher weightage topics ({weightage} marks), provide more comprehensive explanations with examples and detailed coverage.
    4. For lower weightage topics, keep explanations concise but complete.
    5. If the answer is not in the context, say: "I can't find the answer in the notes.
    6. Its an Indian College Exam, so be extra careful about the content. Indian professors love huge contents"

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

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/process', methods=['POST'])
def process_content():
    global vector_store, session_context
    
    pdf_files = request.files.getlist("pdf_files")
    yt_url = request.form.get("yt_url", "")
    outcomes = request.form.get("course_outcomes", "")
    bloom_index = request.form.get("bloom_level", "2")
    weightage = request.form.get('weightage', "4")
    language = request.form.get('language', "English")
    
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
        session_context["language"]
    )
    
    response = chain({"input_documents": docs, "question": user_question}, return_only_outputs=True)
    return jsonify({"answer": response["output_text"]})

if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, port=5000, host='0.0.0.0')