let currentUid = null;
let currentTestId = null;
let currentQuestions = [];
let userAnswers = {};

firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        window.location.href = '/login';
    } else {
        currentUid = user.uid;

        const photoEl = document.getElementById('user-photo');
        const initialEl = document.getElementById('user-initial');

        if (user.photoURL) {
            photoEl.src = user.photoURL;
            photoEl.style.display = 'block';
            initialEl.style.display = 'none';
        } else {
            initialEl.textContent = (user.email || '?').charAt(0).toUpperCase();
            photoEl.style.display = 'none';
            initialEl.style.display = 'block';
        }

        generateAssessment();
    }
});


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


function switchView(viewId) {
    document.querySelectorAll('.assessment-view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}


async function generateAssessment() {
    switchView('loading-view');

    try {
        const response = await fetch('/generate_skill_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: currentUid })
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to generate your assessment.');

        currentTestId = data.test_id;
        currentQuestions = data.questions;
        userAnswers = {};

        document.getElementById('quiz-intro-text').textContent =
            `Covering: ${data.skills.join(', ')}. Answer all ${data.questions.length} questions, then submit for your skill report.`;

        renderQuiz(data.questions);
        switchView('quiz-view');
    } catch (error) {
        document.getElementById('error-text').textContent = error.message || 'We couldn\'t generate your assessment. Please try again.';
        switchView('error-view');
    }
}

function renderQuiz(questions) {
    const list = document.getElementById('questions-list');
    list.innerHTML = questions.map((q, index) => `
        <div class="question-card">
            <div class="question-card-header">
                <span class="question-number">Question ${index + 1} of ${questions.length}</span>
                <div class="question-badges">
                    <span class="badge badge-skill">${escapeHtml(q.topic)}</span>
                    <span class="badge badge-difficulty-${q.difficulty}">${escapeHtml(q.difficulty)}</span>
                </div>
            </div>
            <p class="question-text">${escapeHtml(q.question)}</p>
            <div class="options-list" id="options-${q.id}">
                ${['a', 'b', 'c', 'd'].map(letter => `
                    <div class="option-row" onclick="selectAnswer(${q.id}, '${letter}')" id="option-${q.id}-${letter}">
                        <span class="option-letter">${letter.toUpperCase()}</span>
                        <span class="option-text">${escapeHtml(q.options[letter])}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    updateProgress();
}

function selectAnswer(questionId, letter) {
    userAnswers[questionId] = letter;

    document.querySelectorAll(`#options-${questionId} .option-row`).forEach(row => {
        row.classList.remove('selected');
    });
    document.getElementById(`option-${questionId}-${letter}`).classList.add('selected');

    updateProgress();
}

function updateProgress() {
    const answered = Object.keys(userAnswers).length;
    document.getElementById('quiz-progress').textContent = `${answered} / ${currentQuestions.length} answered`;
}


async function submitSkillTest() {
    const unanswered = currentQuestions.length - Object.keys(userAnswers).length;
    if (unanswered > 0) {
        const proceed = confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`);
        if (!proceed) return;
    }

    const submitBtn = document.getElementById('submit-test-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Scoring your assessment...';

    try {
        const response = await fetch('/submit_skill_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid: currentUid,
                test_id: currentTestId,
                answers: userAnswers
            })
        });
        const report = await response.json();

        if (!response.ok) throw new Error(report.error || 'Failed to score your assessment.');

        sessionStorage.setItem('skillReport', JSON.stringify(report));
        BLData.invalidate();
        window.location.href = '/report';
    } catch (error) {
        alert(error.message || 'Something went wrong while scoring your assessment. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Assessment';
    }
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
        const isInteractive = target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button') || target.closest('.option-row');

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