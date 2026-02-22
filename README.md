# BlitzLearn – Exam-Focused Intelligent Learning Assistant

BlitzLearn is an exam-oriented AI learning platform designed to help students prepare efficiently for theory examinations. Unlike generic study tools, BlitzLearn prioritizes exam relevance by structuring responses based on Bloom’s Taxonomy levels, topic weightage, and multilingual learning preferences. The system transforms scattered resources such as PDF notes and YouTube lectures into structured, exam-ready explanations through an interactive chat interface.

---

## Overview

Students often struggle with cluttered notes, unstructured study material, and limited time before exams. BlitzLearn addresses this challenge by enabling users to upload academic resources and interact with them through an intelligent chat system. The platform focuses on helping students understand concepts clearly, prioritize important topics, and generate answers aligned with examination expectations.

---

## Key Features

* Exam-oriented answer generation aligned with Bloom’s Taxonomy levels
* Multisource learning from PDFs, YouTube lecture transcripts, and academic metadata
* Multilingual support for 15 Indian languages
* Adaptive response modes such as Vibe Mode, Default Mode, and Professor Mode
* Topic prioritization based on weightage and exam relevance
* Secure authentication using Firebase

---

## Architecture Summary

BlitzLearn follows a Retrieval-Augmented Generation (RAG) architecture:

1. Users authenticate using Firebase Authentication.
2. Uploaded content is processed and split into smaller text chunks.
3. Embeddings are generated and stored in a vector database.
4. User queries trigger semantic retrieval of relevant content.
5. Retrieved context is combined with Bloom’s levels and topic weightage.
6. Google Gemini generates exam-focused responses.

---

## Tech Stack

AI and Backend

* Google Gemini (Gemini-2.5-Flash-lite)
* LangChain
* Vector Database (Embeddings storage)

Frontend and Deployment

* React / Web Interface
* Vercel (Deployment)
* VS Code

Authentication and Cloud

* Firebase Authentication
* Google Cloud Services

---

## Workflow

1. User logs in through Firebase Authentication.
2. User uploads PDF notes and YouTube lecture links.
3. System processes content and creates vector embeddings.
4. User selects Bloom’s Taxonomy level, language, and learning mode.
5. BlitzLearn retrieves relevant context and generates exam-oriented responses.

---

## Usage

1. Register or log in using Firebase Authentication.
2. Upload study materials or provide lecture links.
3. Select preferred language and Bloom’s Taxonomy level.
4. Ask questions through the chat interface.
5. Receive structured, exam-focused responses.

---

## Future Development

* Integration with Learning Management Systems (LMS)
* Flashcard generation for revision
* AI-based answer evaluator
* Automatic MCQ test generator
* Student weakness indicator dashboard
