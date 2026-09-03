let currentUid = null;

firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        window.location.href = '/login';
    } else {
        currentUid = user.uid;

        const photoEl = document.getElementById('profile-photo');
        const initialEl = document.getElementById('profile-initial');

        if (user.photoURL) {
            photoEl.src = user.photoURL;
            photoEl.style.display = 'block';
            initialEl.style.display = 'none';
        } else {
            initialEl.textContent = (user.displayName || user.email || '?').charAt(0).toUpperCase();
        }

        loadProfile();
        loadActivityHeatmap();
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

function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message, type = 'success') {
    const container = getToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.innerHTML = type === 'error'
        ? '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>'
        : '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';

    const text = document.createElement('span');
    text.className = 'toast-message';
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 250);
    }, 3000);
}

let profileSkills = [];

async function loadProfile() {
    try {
        const core = await BLData.ready();
        if (!core.profile) throw new Error('Profile not found.');
        renderProfile(core.profile);
    } catch (error) {
        showToast(error.message || 'Failed to load your profile.', 'error');
    }

    document.addEventListener('bl-core-updated', e => {
        if (e.detail.profile) renderProfile(e.detail.profile);
    });
}

function renderProfile(data) {
    document.getElementById('profile-name').textContent = data.name || 'Unnamed User';
    document.getElementById('profile-role').textContent = [data.designation, data.department].filter(Boolean).join(' · ') || 'No role set';
    document.getElementById('profile-email').textContent = data.email || '';

    document.getElementById('info-email').textContent = data.email || '—';
    document.getElementById('info-phone').textContent = data.phone || '—';
    document.getElementById('info-age').textContent = data.age || '—';
    document.getElementById('info-department').textContent = data.department || '—';
    document.getElementById('info-designation').textContent = data.designation || '—';

    profileSkills = data.skills || [];
    renderSkills();

    if (data.education && data.education.length > 0) {
        document.getElementById('education-card').style.display = 'block';
        document.getElementById('education-list').innerHTML = data.education.map(e => `
            <div class="detail-item">
                <div class="detail-item-title">${escapeHtml(e.degree || 'Degree')}</div>
                <div class="detail-item-subtitle">${escapeHtml(e.institution || '')}${e.year ? ' · ' + escapeHtml(e.year) : ''}</div>
            </div>
        `).join('');
    }

    if (data.experience && data.experience.length > 0) {
        document.getElementById('experience-card').style.display = 'block';
        document.getElementById('experience-list').innerHTML = data.experience.map(e => `
            <div class="detail-item">
                <div class="detail-item-title">${escapeHtml(e.role || 'Role')}</div>
                <div class="detail-item-subtitle">${escapeHtml(e.organization || '')}${e.duration ? ' · ' + escapeHtml(e.duration) : ''}</div>
                ${e.description ? `<div class="detail-item-desc">${escapeHtml(e.description)}</div>` : ''}
            </div>
        `).join('');
    }
}

function renderSkills() {
    const container = document.getElementById('skills-chips');

    if (profileSkills.length === 0) {
        container.innerHTML = '<p class="empty-state">No skills added yet.</p>';
        return;
    }

    container.innerHTML = profileSkills.map(skill => `
        <div class="skill-chip">
            <span>${escapeHtml(skill.skill_name)}</span>
            <span class="chip-level">${escapeHtml(skill.self_rated_level || 'Beginner')}</span>
            <button type="button" class="chip-remove" onclick="removeSkill(${skill.id})">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
    `).join('');
}

async function addSkill() {
    const nameInput = document.getElementById('skill-name-input');
    const levelInput = document.getElementById('skill-level-input');
    const button = document.querySelector('.add-chip-button');
    const name = nameInput.value.trim();

    if (!name) return;

    button.disabled = true;

    try {
        const response = await fetch(`/api/profile/${currentUid}/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, level: levelInput.value })
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to add skill.');

        profileSkills.push({ id: data.id, skill_name: data.skill_name, self_rated_level: data.self_rated_level });
        renderSkills();
        nameInput.value = '';
        nameInput.focus();
        showToast(`${data.skill_name} added.`, 'success');
        BLData.invalidate();
    } catch (error) {
        showToast(error.message || 'Failed to add skill.', 'error');
    } finally {
        button.disabled = false;
    }
}

async function removeSkill(skillId) {
    try {
        const response = await fetch(`/api/profile/${currentUid}/skills/${skillId}`, { method: 'DELETE' });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to remove skill.');

        profileSkills = profileSkills.filter(s => s.id !== skillId);
        renderSkills();
        showToast('Skill removed.', 'success');
        BLData.invalidate();
    } catch (error) {
        showToast(error.message || 'Failed to remove skill.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('skill-name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSkill();
        }
    });
});

async function loadActivityHeatmap() {
    const grid = document.getElementById('heatmap-grid');
    try {
        const response = await fetch(`/api/activity/${currentUid}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load activity.');

        const currentStreak = data.current_streak || 0;
        const longestStreak = data.longest_streak || 0;

        document.getElementById('stat-current-streak').textContent = `${currentStreak} day${currentStreak === 1 ? '' : 's'}`;
        document.getElementById('stat-longest-streak').textContent = `${longestStreak} day${longestStreak === 1 ? '' : 's'}`;
        document.getElementById('stat-active-days').textContent = data.total_active_days || 0;

        const weeks = generateHeatmapWeeks(data.activity || {});
        renderHeatmap(weeks);
    } catch (error) {
        grid.innerHTML = '<p class="empty-state">Failed to load learning activity.</p>';
    }
}

function generateHeatmapWeeks(activityMap) {
    const weeks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalDays = 371;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (totalDays - 1));
    startDate.setDate(startDate.getDate() - startDate.getDay());

    let cursor = new Date(startDate);
    while (cursor <= today) {
        const week = [];
        for (let d = 0; d < 7; d++) {
            if (cursor > today) {
                week.push(null);
            } else {
                const iso = cursor.toISOString().slice(0, 10);
                week.push({ date: iso, count: activityMap[iso] || 0 });
            }
            cursor.setDate(cursor.getDate() + 1);
        }
        weeks.push(week);
    }
    return weeks;
}

function heatLevel(count) {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count <= 4) return 3;
    return 4;
}

function renderHeatmap(weeks) {
    const container = document.getElementById('heatmap-grid');
    container.innerHTML = weeks.map(week => `
        <div class="heatmap-col">
            ${week.map(day => {
                if (!day) return '<div class="heatmap-cell empty"></div>';
                const level = heatLevel(day.count);
                const label = day.count > 0
                    ? `${day.count} activit${day.count === 1 ? 'y' : 'ies'} on ${formatHeatDate(day.date)}`
                    : `No activity on ${formatHeatDate(day.date)}`;
                return `<div class="heatmap-cell level-${level}" title="${escapeAttr(label)}"></div>`;
            }).join('')}
        </div>
    `).join('');
}

function formatHeatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
        const isInteractive = target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button') || target.closest('.skill-chip');

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