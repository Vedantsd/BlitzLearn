let currentUid = null;
let labTopic = null;
let labCategory = null;
let labData = null;

const params = new URLSearchParams(window.location.search);
labTopic = params.get('topic') || '';
labCategory = (params.get('category') || 'general').toLowerCase();
if (!['code', 'cloud', 'finance', 'general'].includes(labCategory)) {
    labCategory = 'general';
}

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

        if (!labTopic) {
            switchView('error-view');
            document.getElementById('error-text').textContent = 'No lab topic was specified.';
            document.querySelector('#error-view .lab-btn-primary').style.display = 'none';
            return;
        }

        renderTopicBadge();
        fetchLabContent();
    }
});

function logout() {
    firebase.auth().signOut().then(() => {
        window.location.href = '/login';
    }).catch(err => alert("Error logging out"));
}

function goToProfile() {
    window.location.href = '/profile';
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

function parseMarkdown(text) {
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

    text = text.replace(/`(.+?)`/g, '<code>$1</code>');

    text = text.replace(/\n/g, '<br>');

    text = text.replace(/^(\d+)\.\s(.+)$/gm, '<div class="list-item">$1. $2</div>');

    text = text.replace(/^[-*]\s(.+)$/gm, '<div class="list-item">• $1</div>');

    text = text.replace(/^##\s(.+)$/gm, '<h4>$1</h4>');

    return text;
}

function renderTopicBadge() {
    const badge = document.getElementById('lab-topic-badge');
    const categoryLabels = { code: 'Code', cloud: 'Cloud', finance: 'Finance', general: 'General' };
    badge.innerHTML = `
        <span class="lab-topic-name">${escapeHtml(labTopic)}</span>
        <span class="lab-category-pill">${categoryLabels[labCategory]}</span>
    `;
}

function setProgress(percent) {
    document.getElementById('lab-progress-fill').style.width = `${percent}%`;
}

function switchView(viewId) {
    document.querySelectorAll('.lab-view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

async function fetchLabContent() {
    switchView('loading-view');
    document.getElementById('loading-text').textContent = `Building your ${labTopic} lab...`;
    setProgress(15);

    try {
        const response = await fetch('/api/lab_content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: labTopic, category: labCategory })
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to load this lab.');

        labData = data;
        renderTheoryView();
        switchView('theory-view');
        setProgress(45);
    } catch (error) {
        document.getElementById('error-text').textContent = error.message || 'Something went wrong loading this lab.';
        switchView('error-view');
    }
}

function renderTheoryView() {
    document.getElementById('theory-body').innerHTML = `<p>${parseMarkdown(labData.theory || '')}</p>`;

    const examplesBody = document.getElementById('examples-body');
    const examples = labData.examples || [];

    if (examples.length === 0) {
        examplesBody.innerHTML = '<p style="opacity:0.6;">No examples for this topic.</p>';
        return;
    }

    examplesBody.innerHTML = examples.map(ex => {
        const title = escapeHtml(ex.title || 'Example');
        const content = ex.content || '';

        const body = labCategory === 'code'
            ? `<pre><code>${escapeHtml(content)}</code></pre>`
            : `<div class="example-content"><p>${parseMarkdown(content)}</p></div>`;

        return `
            <div class="example-card">
                <div class="example-title">${title}</div>
                ${body}
            </div>
        `;
    }).join('');
}

let proctor = null;

function goToTaskView() {

    if (typeof BlitzProctor !== 'undefined' && BlitzProctor.requestFullscreen) {
        BlitzProctor.requestFullscreen();
    }

    renderTaskView();
    switchView('task-view');
    setProgress(70);

    if (!proctor) {
        proctor = new BlitzProctor({
            maxViolations: 3,
            testType: 'lab',
            badgeContainer: document.getElementById('lab-proctor-container'),
            onDisqualify: async (violations) => {
                await autoSubmitDisqualifiedLab();
            }
        });
    }
    proctor.start();
}

function goToTheoryView() {
    if (proctor) proctor.stop();
    switchView('theory-view');
    setProgress(45);
}

const WORKSPACE_LABELS = {
    code: 'Your code',
    cloud: 'Describe the steps you performed (commands, config, screenshots described)',
    finance: 'Show your working & final answer',
    general: 'Your response',
};

const WORKSPACE_PLACEHOLDERS = {
    code: '// Write your code here',
    cloud: 'Describe what you did, step by step, and paste any commands or config...',
    finance: 'Show your calculation steps, then state your final answer clearly...',
    general: 'Write your response here...',
};

function renderTaskView() {
    const task = labData.task || {};
    document.getElementById('task-body').innerHTML = `
        <div class="lab-task-prompt"><p>${parseMarkdown(task.prompt || '')}</p></div>
    `;

    document.getElementById('workspace-label').textContent = WORKSPACE_LABELS[labCategory];

    const input = document.getElementById('workspace-input');
    input.placeholder = WORKSPACE_PLACEHOLDERS[labCategory];
    if (!input.value) {
        input.value = task.starter || '';
    }

    const feedbackPanel = document.getElementById('feedback-panel');
    feedbackPanel.classList.remove('visible');
    feedbackPanel.innerHTML = '';

    const evalBtn = document.getElementById('evaluate-btn');
    evalBtn.disabled = false;
    evalBtn.textContent = 'Evaluate my work';
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('workspace-input');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.value = input.value.substring(0, start) + '    ' + input.value.substring(end);
            input.selectionStart = input.selectionEnd = start + 4;
        }
    });
});

async function evaluateLab() {
    if (proctor) proctor.stop();

    const evalBtn = document.getElementById('evaluate-btn');
    const submission = document.getElementById('workspace-input').value;

    evalBtn.disabled = true;
    evalBtn.textContent = 'Evaluating...';

    try {
        const response = await fetch('/api/evaluate_lab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid: currentUid,
                topic: labTopic,
                category: labCategory,
                submission: submission,
                task: labData.task
            })
        });
        const result = await response.json();

        if (!response.ok) throw new Error(result.error || 'Failed to evaluate your submission.');

        renderFeedback(result);
        setProgress(100);
        evalBtn.textContent = 'Re-evaluate';
    } catch (error) {
        alert(error.message || 'Something went wrong while evaluating. Please try again.');
        evalBtn.textContent = 'Evaluate my work';
    } finally {
        evalBtn.disabled = false;
    }
}

async function autoSubmitDisqualifiedLab() {
    if (proctor) proctor.stop();

    const evalBtn = document.getElementById('evaluate-btn');
    if (evalBtn) {
        evalBtn.disabled = true;
        evalBtn.textContent = 'Disqualified (0/100)';
    }

    const input = document.getElementById('workspace-input');
    if (input) {
        input.disabled = true;
        input.style.opacity = '0.6';
    }

    const disqualifiedResult = {
        score: 0,
        summary: "Lab test auto-submitted with 0 marks due to exceeding maximum allowed tab switches / fullscreen exits (3/3).",
        mistakes: ["Proctoring violation: Tab changed or fullscreen exited more than 3 times."],
        improvements: ["Maintain active fullscreen test window without switching tabs or losing focus."],
        suggestions: ["Review lab guidelines and retake the exercise in fullscreen mode."]
    };

    renderFeedback(disqualifiedResult);
    setProgress(100);

    try {
        await fetch('/api/evaluate_lab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid: currentUid,
                topic: labTopic,
                category: labCategory,
                submission: (input ? input.value : '') + "\n[Auto-submitted: Disqualified due to exceeding tab switch limit]",
                task: labData.task,
                disqualified: true
            })
        });
    } catch (err) {
        console.error('Failed to record disqualified lab attempt:', err);
    }
}

function renderFeedback(result) {
    const panel = document.getElementById('feedback-panel');
    const score = result.score || 0;
    const scoreClass = score >= 80 ? 'good' : score >= 60 ? 'ok' : 'poor';

    const mistakes = result.mistakes || [];
    const improvements = result.improvements || [];
    const suggestions = result.suggestions || [];

    const listSection = (title, items, className) => {
        if (!items.length) return '';
        return `
            <div class="lab-feedback-section ${className}">
                <div class="lab-feedback-section-title">${title}</div>
                <ul>${items.map(i => `<li>${parseMarkdown(i)}</li>`).join('')}</ul>
            </div>
        `;
    };

    panel.innerHTML = `
        <div class="lab-score-block">
            <div class="lab-score-num ${scoreClass}">${score}<span>/100</span></div>
            <div class="lab-score-summary">${parseMarkdown(result.summary || '')}</div>
        </div>
        ${listSection('Mistakes', mistakes, 'mistakes')}
        ${listSection('Improvements', improvements, 'improvements')}
        ${listSection('Suggestions', suggestions, 'suggestions')}
    `;

    panel.classList.add('visible');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        const isInteractive = target.tagName === 'A' || target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA' || target.closest('a') || target.closest('button') || target.closest('textarea');

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
