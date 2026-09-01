let currentUid = null;
let labsData = [];
let activeLabFilter = 'all';

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

        loadLabs();
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

async function loadLabs() {
    const grid = document.getElementById('labs-grid');
    try {
        const data = await BLData.labsReady();

        if (!data || !data.has_data || !data.labs || data.labs.length === 0) {
            grid.innerHTML = '<p class="empty-state">No skill assessment yet. <a href="/competency-test">Take it now</a> to unlock personalized labs.</p>';
            updateLabStats([]);
            return;
        }

        labsData = data.labs;
        updateLabStats(labsData);
        renderLabs();
    } catch (error) {
        grid.innerHTML = `<p class="empty-state">Failed to load your labs.</p>`;
        updateLabStats([]);
    }

    document.addEventListener('bl-labs-updated', e => {
        labsData = (e.detail && e.detail.labs) || [];
        updateLabStats(labsData);
        renderLabs();
    });
}

function updateLabStats(labs) {
    const high = labs.filter(l => l.priority === 'High').length;
    const avgGap = labs.length > 0
        ? Math.round(labs.reduce((sum, l) => sum + (l.gap || 0), 0) / labs.length)
        : 0;

    document.getElementById('stat-labs-available').textContent = labs.length;
    document.getElementById('stat-high-priority').textContent = high;
    document.getElementById('stat-avg-gap').textContent = labs.length > 0 ? `${avgGap}%` : '—';
}

function setLabFilter(filter, buttonEl) {
    activeLabFilter = filter;
    document.querySelectorAll('#labs-filter-row .pill').forEach(p => p.classList.remove('active'));
    buttonEl.classList.add('active');
    renderLabs();
}

function renderLabs() {
    const grid = document.getElementById('labs-grid');

    const filtered = activeLabFilter === 'all'
        ? labsData
        : labsData.filter(l => l.priority === activeLabFilter);

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-state">No labs match this filter.</p>';
        return;
    }

    grid.innerHTML = filtered.map(renderLabCard).join('');
}

function renderLabCard(lab) {
    const priorityClass = lab.priority.toLowerCase();
    return `
        <div class="lab-card">
            <div class="lab-card-top">
                <div class="lab-icon ${lab.category}">${categoryIconSvg(lab.category)}</div>
                <span class="priority-badge ${priorityClass}">${escapeHtml(lab.priority)} Priority</span>
            </div>
            <h3 class="lab-title">${escapeHtml(lab.topic)}</h3>
            <p class="lab-meta">${lab.current_percent}% now · ${lab.target_percent}% target · ${lab.gap} point gap</p>
            <div class="lab-track"><div class="lab-fill" style="width:${lab.current_percent}%;"></div></div>
            <button class="lab-start-btn" onclick="startLab('${escapeAttr(lab.topic)}', '${lab.category}')">Start Lab →</button>
        </div>
    `;
}

function categoryIconSvg(category) {
    if (category === 'code') {
        return `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m8 9-4 3 4 3m8-6 4 3-4 3M13.5 6.5l-3 11"/></svg>`;
    }
    if (category === 'cloud') {
        return `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 0 0 4 4h10a4 4 0 0 0 .8-7.92 5.5 5.5 0 0 0-10.6-2A4.5 4.5 0 0 0 3 15Z"/></svg>`;
    }
    if (category === 'finance') {
        return `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3v18h18M7 15l4-5 3 3 5-7"/></svg>`;
    }
    return `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"/></svg>`;
}

function startLab(topic, category) {
    window.location.href = `/labs?topic=${encodeURIComponent(topic)}&category=${encodeURIComponent(category)}`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const customCursor = document.getElementById('custom-cursor');
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (!isTouchDevice) {
    document.addEventListener('mousemove', (e) => {
        customCursor.style.left = `${e.clientX}px`;
        customCursor.style.top = `${e.clientY}px`;

        const target = e.target;
        const isInteractive = target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button') || target.closest('.lab-card');

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