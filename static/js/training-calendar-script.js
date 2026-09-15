let currentYear = null;
let currentMonth = null;
let selectedDateIso = null;
let monthEvents = [];

firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        window.location.href = '/login';
    } else {
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

        const today = new Date();
        currentYear = today.getFullYear();
        currentMonth = today.getMonth() + 1;
        loadCalendar();
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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth > 12) {
        currentMonth = 1;
        currentYear += 1;
    } else if (currentMonth < 1) {
        currentMonth = 12;
        currentYear -= 1;
    }
    selectedDateIso = null;
    loadCalendar();
}

async function loadCalendar() {
    const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    document.getElementById('tc-month-label').textContent = `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;

    const eventsList = document.getElementById('tc-events-list');
    eventsList.innerHTML = '<p class="empty-state">Loading trainings...</p>';

    try {
        const response = await fetch(`/api/nssta_calendar?month=${monthStr}`);
        const data = await response.json();
        monthEvents = data.events || [];
        renderGrid();
        renderEventsForSelection();
    } catch (error) {
        eventsList.innerHTML = '<p class="empty-state">Failed to load the training calendar.</p>';
        renderGrid();
    }
}

function renderGrid() {
    const grid = document.getElementById('tc-grid');
    const firstOfMonth = new Date(currentYear, currentMonth - 1, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

    const todayIso = new Date().toISOString().slice(0, 10);
    const eventDates = new Set(monthEvents.map(e => e.start_date));

    let cells = '';
    for (let i = 0; i < startWeekday; i++) {
        cells += '<div class="tc-day empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const iso = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const classes = ['tc-day'];
        if (iso === todayIso) classes.push('today');
        if (iso === selectedDateIso) classes.push('selected');
        const hasEvent = eventDates.has(iso);

        cells += `
            <div class="${classes.join(' ')}" onclick="selectDay('${iso}')">
                <span>${day}</span>
                ${hasEvent ? '<span class="tc-day-dot"></span>' : ''}
            </div>
        `;
    }

    grid.innerHTML = cells;
}

function selectDay(iso) {
    selectedDateIso = selectedDateIso === iso ? null : iso;
    renderGrid();
    renderEventsForSelection();
}

function renderEventsForSelection() {
    const title = document.getElementById('tc-events-title');
    const list = document.getElementById('tc-events-list');

    const filtered = selectedDateIso
        ? monthEvents.filter(e => e.start_date === selectedDateIso)
        : monthEvents;

    title.textContent = selectedDateIso
        ? `Trainings on ${formatDateLong(selectedDateIso)}`
        : `Trainings this month`;

    if (filtered.length === 0) {
        list.innerHTML = `<p class="empty-state">${selectedDateIso ? 'No trainings on this day.' : 'No trainings scheduled this month.'}</p>`;
        return;
    }

    list.innerHTML = filtered.map(renderEventRow).join('');
}

function renderEventRow(e) {
    const d = new Date(e.start_date + 'T00:00:00');
    const day = d.getDate();
    const mon = MONTH_NAMES[d.getMonth()].slice(0, 3);

    return `
        <div class="tc-event-row">
            <div class="tc-event-date">${mon}<br>${day}</div>
            <div class="tc-event-info">
                <div class="tc-event-subject">${escapeHtml(e.subject || 'NSSTA Training')}</div>
                <div class="tc-event-meta">${[e.reference_id, e.document_type].filter(Boolean).map(escapeHtml).join(' · ') || 'NSSTA TPAC'}</div>
            </div>
            ${e.document_url ? `<a class="tc-event-link" href="${escapeAttr(e.document_url)}" target="_blank" rel="noopener">View</a>` : ''}
        </div>
    `;
}

function formatDateLong(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
}

const customCursor = document.getElementById('custom-cursor');
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (!isTouchDevice) {
    document.addEventListener('mousemove', (e) => {
        customCursor.style.left = `${e.clientX}px`;
        customCursor.style.top = `${e.clientY}px`;

        const target = e.target;
        const isInteractive = target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button') || target.closest('.tc-day');

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