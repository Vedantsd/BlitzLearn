let currentUid = null;

firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        window.location.href = '/login';
    } else {
        console.log("Active Session:", user.email);
        currentUid = user.uid;

        const photoEl = document.getElementById('user-photo');
        const initialEl = document.getElementById('user-initial');

        if (user.photoURL) {
            photoEl.src = user.photoURL;
            photoEl.style.display = 'block';
            initialEl.style.display = 'none';
        } else {
            initialEl.textContent = user.email.charAt(0).toUpperCase();
            photoEl.style.display = 'none';
            initialEl.style.display = 'block';
        }
    }
});

function logout() {
    firebase.auth().signOut().then(() => {
        window.location.href = '/login';
    }).catch(err => alert("Error logging out"));
}

if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
    updateHeaderLogo(isDark);
}

function updateHeaderLogo(isDark) {
    const logo = document.getElementById('header-logo');
    if (!logo) return;
    logo.src = !isDark
        ? "/static/logo/blitz-logo-light.png"
        : "/static/logo/blitz-logo-dark.png";
}

function updateThemeIcon(isDark) {
    const iconPath = document.getElementById('moon-icon');
    if (!iconPath) return;
    if (isDark) {
        iconPath.setAttribute('d', 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z');
    } else {
        iconPath.setAttribute('d', 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const isDark = localStorage.getItem('theme') === 'dark';
    document.body.classList.toggle('dark', isDark);
    updateThemeIcon(isDark);
    updateHeaderLogo(isDark);
});

const testSetup = {
    format: 'mcq',
    source: 'notes',
    difficulty: 'easy',
    count: 10
};

const sourceHints = {
    notes: 'Generates new questions from your currently processed notes using AI.',
    bank: 'Pulls previously generated questions from the shared question bank — great for quickly assessing new users.'
};

const formatHints = {
    mcq: 'Multiple choice questions with 4 options each.',
    quiz: 'True/false and fill-in-the-blank questions — no multiple choice.'
};

function selectPill(group, value, buttonEl) {
    testSetup[group] = value;

    const groupIds = { format: 'format-pills', source: 'source-pills', difficulty: 'difficulty-pills', count: 'count-pills' };
    const container = document.getElementById(groupIds[group]);
    container.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    buttonEl.classList.add('active');

    if (group === 'source') {
        document.getElementById('source-hint').textContent = sourceHints[value];
    }
    if (group === 'format') {
        document.getElementById('format-hint').textContent = formatHints[value];
    }
}


let currentTestId = null;
let currentQuestions = [];
let userAnswers = {};
let proctor = null;
let generatedTestData = null;

function switchView(viewId) {
    document.querySelectorAll('.test-view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

async function generateTest() {
    const btn = document.getElementById('generate-test-btn');
    const statusEl = document.getElementById('setup-status');

    btn.disabled = true;
    btn.textContent = 'Generating...';
    statusEl.textContent = testSetup.source === 'bank'
        ? 'Pulling questions from the bank...'
        : 'Reading your notes and writing questions... this can take a moment.';
    statusEl.className = 'setup-status loading';

    try {
        const response = await fetch('/generate_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                difficulty: testSetup.difficulty,
                num_questions: testSetup.count,
                source: testSetup.source,
                test_format: testSetup.format,
                uid: currentUid
            })
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to generate test.');
        if (!data.questions || data.questions.length === 0) throw new Error('No questions were generated. Try again.');

        generatedTestData = data;
        currentTestId = data.test_id;
        currentQuestions = data.questions;
        userAnswers = {};

        const formatLabel = data.test_format === 'quiz' ? 'Quiz' : 'Test';
        document.getElementById('ready-title').textContent = `${capitalize(data.difficulty)} ${formatLabel} Ready`;
        document.getElementById('ready-subtitle').textContent = `Generated from: ${data.source_title || 'Your Notes'}`;
        document.getElementById('ready-question-count').textContent = data.questions.length;
        document.getElementById('ready-difficulty').textContent = capitalize(data.difficulty);

        switchView('ready-view');

    } catch (error) {
        statusEl.textContent = error.message || 'Something went wrong. Please try again.';
        statusEl.className = 'setup-status error';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Test';
    }
}

async function startTestNow() {
    if (!generatedTestData) return;

    if (typeof BlitzProctor !== 'undefined' && BlitzProctor.requestFullscreen) {
        BlitzProctor.requestFullscreen();
    }

    renderQuiz(generatedTestData);
    switchView('quiz-view');

    if (!proctor) {
        proctor = new BlitzProctor({
            maxViolations: 3,
            testType: testSetup.format,
            badgeContainer: document.getElementById('tests-proctor-container') || '#quiz-badge-slot',
            onDisqualify: async (violations) => {
                await autoSubmitDisqualifiedTest();
            }
        });
    }
    await proctor.start();
}

function renderQuiz(data) {
    const formatLabel = data.test_format === 'quiz' ? 'Quiz' : 'Test';
    document.getElementById('quiz-title').textContent =
        `${capitalize(data.difficulty)} ${formatLabel} — ${data.questions.length} Questions`;
    document.getElementById('quiz-subtitle').textContent = `Source: ${data.source_title}`;

    const list = document.getElementById('questions-list');
    list.innerHTML = data.questions.map((q, index) => renderQuestionCard(q, index, data.questions.length)).join('');

    updateProgress();
}

function renderQuestionCard(q, index, total) {
    const type = q.question_type || 'mcq';
    return `
        <div class="question-card" id="question-card-${q.id}">
            <div class="question-card-header">
                <span class="question-number">Question ${index + 1} of ${total}</span>
                <span class="question-topic-badge">${escapeHtml(q.topic || 'General')}</span>
            </div>
            <p class="question-text">${escapeHtml(q.question)}</p>
            ${renderQuestionInput(q, type)}
        </div>
    `;
}

function renderQuestionInput(q, type) {
    if (type === 'true_false') {
        return `
            <div class="tf-options" id="options-${q.id}">
                <button class="tf-option-btn" onclick="selectAnswer(${q.id}, 'True')" id="option-${q.id}-True">True</button>
                <button class="tf-option-btn" onclick="selectAnswer(${q.id}, 'False')" id="option-${q.id}-False">False</button>
            </div>
        `;
    }
    if (type === 'fill_blank') {
        return `
            <input type="text" class="fill-blank-input" id="input-${q.id}" placeholder="Type your answer..."
                   oninput="selectAnswer(${q.id}, this.value)">
        `;
    }
    return `
        <div class="options-list" id="options-${q.id}">
            ${['a', 'b', 'c', 'd'].map(letter => `
                <div class="option-row" onclick="selectAnswer(${q.id}, '${letter}')" id="option-${q.id}-${letter}">
                    <span class="option-letter">${letter.toUpperCase()}</span>
                    <span class="option-text">${escapeHtml(q.options[letter])}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function selectAnswer(questionId, value) {
    if (value === '') {
        delete userAnswers[questionId];
    } else {
        userAnswers[questionId] = value;
    }

    const question = currentQuestions.find(q => q.id === questionId);
    const type = question ? (question.question_type || 'mcq') : 'mcq';

    if (type === 'mcq') {
        document.querySelectorAll(`#options-${questionId} .option-row`).forEach(row => {
            row.classList.remove('selected');
        });
        document.getElementById(`option-${questionId}-${value}`).classList.add('selected');
    } else if (type === 'true_false') {
        document.querySelectorAll(`#options-${questionId} .tf-option-btn`).forEach(btn => {
            btn.classList.remove('selected');
        });
        const btn = document.getElementById(`option-${questionId}-${value}`);
        if (btn) btn.classList.add('selected');
    }

    updateProgress();
}

function updateProgress() {
    const answered = Object.keys(userAnswers).length;
    document.getElementById('quiz-progress').textContent = `${answered} / ${currentQuestions.length} answered`;
}

function cancelTest() {
    if (!confirm('Discard this test and go back to setup?')) return;
    if (proctor) proctor.stop();
    resetToSetup();
}

function isAnswerCorrect(q, userAnswer) {
    const type = q.question_type || 'mcq';
    if (userAnswer == null) return false;

    if (type === 'mcq') {
        return userAnswer === q.correct_option;
    }
    return userAnswer.trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase();
}

async function submitTest() {
    const unanswered = currentQuestions.length - Object.keys(userAnswers).length;
    if (unanswered > 0) {
        const proceed = confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`);
        if (!proceed) return;
    }

    if (proctor) proctor.stop();

    let score = 0;
    currentQuestions.forEach(q => {
        if (isAnswerCorrect(q, userAnswers[q.id])) score += 1;
    });
    const total = currentQuestions.length;

    renderResults(score, total, false);
    switchView('results-view');

    try {
        await fetch('/submit_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test_id: currentTestId, score, total, uid: currentUid, answers: userAnswers })
        });
        if (typeof BLData !== 'undefined') BLData.invalidate();
    } catch (error) {
        console.error('Failed to save test result:', error);
    }
}

async function autoSubmitDisqualifiedTest() {
    if (proctor) proctor.stop();

    const total = currentQuestions.length;
    const score = 0;

    renderResults(score, total, true);
    switchView('results-view');

    try {
        await fetch('/submit_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                test_id: currentTestId,
                score: 0,
                total: total,
                uid: currentUid,
                answers: {},
                disqualified: true
            })
        });
        if (typeof BLData !== 'undefined') BLData.invalidate();
    } catch (error) {
        console.error('Failed to save disqualified test result:', error);
    }
}

function renderResults(score, total, isDisqualified = false) {
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;

    const bannerSlot = document.getElementById('results-disqualified-banner-slot');
    if (bannerSlot) {
        if (isDisqualified) {
            bannerSlot.innerHTML = `
                <div class="proctor-disqualified-banner">
                    <div class="banner-icon">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <div class="banner-content">
                        <h4>Test Terminated & Auto-Submitted (0 Marks)</h4>
                        <p>You have exceeded the limit of 3 tab switches / fullscreen exits. The test was automatically ended with 0 marks.</p>
                    </div>
                </div>
            `;
        } else {
            bannerSlot.innerHTML = '';
        }
    }

    document.getElementById('score-percent').textContent = `${percent}%`;
    document.getElementById('results-heading').textContent = isDisqualified
        ? `Disqualified (0 / ${total})`
        : `You scored ${score} / ${total}`;
    document.getElementById('results-subheading').textContent = isDisqualified
        ? "Exceeded maximum allowed tab changes (3/3). Auto-submitted with 0 marks."
        : resultMessage(percent);

    const list = document.getElementById('results-list');
    list.innerHTML = currentQuestions.map((q, index) => renderResultCard(q, index)).join('');
}

function renderResultCard(q, index) {
    const type = q.question_type || 'mcq';
    const userAnswer = userAnswers[q.id];

    let body;
    if (type === 'mcq') {
        body = `
            <div class="options-list">
                ${['a', 'b', 'c', 'd'].map(letter => {
                    let cls = 'option-row locked';
                    if (letter === q.correct_option) cls += ' correct-answer';
                    else if (letter === userAnswer) cls += ' wrong-answer';
                    return `
                        <div class="${cls}">
                            <span class="option-letter">${letter.toUpperCase()}</span>
                            <span class="option-text">${escapeHtml(q.options[letter])}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } else if (type === 'true_false') {
        body = `
            <div class="tf-options">
                ${['True', 'False'].map(val => {
                    let cls = 'tf-option-btn locked';
                    if (val === q.correct_answer) cls += ' correct-answer';
                    else if (val === userAnswer) cls += ' wrong-answer';
                    return `<button class="${cls}" disabled>${val}</button>`;
                }).join('')}
            </div>
        `;
    } else {
        const correct = isAnswerCorrect(q, userAnswer);
        const cls = correct ? 'correct-answer' : 'wrong-answer';
        body = `
            <div class="fill-blank-review ${cls}">
                <span class="review-label">Your answer:</span>${escapeHtml(userAnswer || '(no answer)')}<br>
                <span class="review-label">Correct answer:</span>${escapeHtml(q.correct_answer)}
            </div>
        `;
    }

    return `
        <div class="question-card">
            <div class="question-card-header">
                <span class="question-number">Question ${index + 1} of ${currentQuestions.length}</span>
                <span class="question-topic-badge">${escapeHtml(q.topic || 'General')}</span>
            </div>
            <p class="question-text">${escapeHtml(q.question)}</p>
            ${body}
            ${q.explanation ? `
                <div class="explanation-box">
                    <strong>Explanation:</strong> ${escapeHtml(q.explanation)}
                </div>
            ` : ''}
        </div>
    `;
}

function resultMessage(percent) {
    if (percent >= 90) return "Outstanding! You've mastered this material.";
    if (percent >= 70) return "Great work — you're in solid shape here.";
    if (percent >= 50) return "Decent start. Review the explanations below to close the gaps.";
    return "Worth another pass through the material before you move on.";
}

function resetToSetup() {
    if (proctor) proctor.stop();
    generatedTestData = null;
    currentTestId = null;
    currentQuestions = [];
    userAnswers = {};
    document.getElementById('setup-status').textContent = '';
    document.getElementById('setup-status').className = 'setup-status';
    switchView('setup-view');
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}


const customCursor = document.getElementById('custom-cursor');
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (!isTouchDevice) {
    document.addEventListener('mousemove', (e) => {
        customCursor.style.left = `${e.clientX}px`;
        customCursor.style.top = `${e.clientY}px`;

        const target = e.target;
        const isInteractive = target.tagName === 'A' || target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.closest('a') || target.closest('button') || target.closest('.option-row') || target.closest('.pill');

        if (isInteractive) {
            customCursor.style.transform = 'translate(-50%, -50%) scale(2.2)';
            customCursor.style.backgroundColor = 'white';
        } else {
            customCursor.style.transform = 'translate(-50%, -50%) scale(1)';
            customCursor.style.backgroundColor = '#10B981';
        }
    });
}

updateThemeIcon();