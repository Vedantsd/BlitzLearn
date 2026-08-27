let currentUid = null;
let redirectTimer = null;
let redirectSeconds = 8;

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

        loadReport();
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


async function loadReport() {
    const stored = sessionStorage.getItem('skillReport');

    if (stored) {
        renderReport(JSON.parse(stored));
        sessionStorage.removeItem('skillReport');
        return;
    }

    try {
        const response = await fetch(`/api/skill_report/${currentUid}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'No report found.');

        renderReport(data);
    } catch (error) {
        document.getElementById('report-heading').textContent = 'No report available yet';
        document.getElementById('report-subheading').textContent = 'Take the initial skill assessment first.';
        document.querySelector('.overall-card').style.display = 'none';
        document.querySelector('.section-title').style.display = 'none';
        switchView('report-view');
    }
}

function switchView(viewId) {
    document.querySelectorAll('.report-view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}


function renderReport(report) {
    const percent = report.overall_total > 0
        ? Math.round((report.overall_score / report.overall_total) * 100)
        : 0;

    document.getElementById('score-percent').textContent = `${percent}%`;
    document.getElementById('overall-score-text').textContent = `${report.overall_score} / ${report.overall_total} correct`;
    document.getElementById('overall-message').textContent = overallMessage(percent);

    const container = document.getElementById('skills-breakdown');
    container.innerHTML = report.skills.map(skill => {
        const levelClass = skill.level.toLowerCase();
        return `
            <div class="skill-report-card">
                <div class="skill-report-header">
                    <span class="skill-report-name">${escapeHtml(skill.skill)}</span>
                    <div class="skill-report-right">
                        <span class="skill-report-score">${skill.correct} / ${skill.total} · ${skill.percent}%</span>
                        <span class="level-badge ${levelClass}">${escapeHtml(skill.level)}</span>
                    </div>
                </div>
                <div class="skill-progress-track">
                    <div class="skill-progress-fill ${levelClass}" style="width: ${skill.percent}%;"></div>
                </div>
            </div>
        `;
    }).join('');

    switchView('report-view');
    startRedirectCountdown();
}

function overallMessage(percent) {
    if (percent >= 80) return "Excellent baseline! You're well-positioned across your declared skills.";
    if (percent >= 50) return "Solid starting point — a few areas below stand out as good places to focus first.";
    return "This gives us a clear picture of where to start — check the breakdown below for the biggest opportunities.";
}


function startRedirectCountdown() {
    const countdownEl = document.getElementById('redirect-countdown');
    redirectTimer = setInterval(() => {
        redirectSeconds -= 1;
        countdownEl.textContent = redirectSeconds;
        if (redirectSeconds <= 0) {
            clearInterval(redirectTimer);
            goToDashboard();
        }
    }, 1000);
}

function goToDashboard() {
    if (redirectTimer) clearInterval(redirectTimer);
    window.location.href = '/dashboard';
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
        const isInteractive = target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button');

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