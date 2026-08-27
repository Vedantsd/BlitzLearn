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


if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
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
});


async function handleAdminLogout() {
    try {
        await fetch('/admin/api/logout', { method: 'POST' });
    } catch (e) {
    }
    window.location.href = '/admin/login';
}


const loadedViews = new Set();

function switchAdminView(view) {
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
    });
    document.querySelectorAll('.admin-view').forEach(panel => {
        panel.classList.toggle('active', panel.id === `${view}-view`);
    });

    if (view === 'users' && !loadedViews.has('users')) {
        loadUsers();
        loadedViews.add('users');
    } else if (view === 'performance' && !loadedViews.has('performance')) {
        loadPerformance();
        loadedViews.add('performance');
    } else if (view === 'departments' && !loadedViews.has('departments')) {
        loadDepartmentReports();
        loadedViews.add('departments');
    }
}


async function refreshStats() {
    try {
        const [usersRes, perfRes] = await Promise.all([
            fetch('/admin/api/users'),
            fetch('/admin/api/performance')
        ]);
        const users = await usersRes.json();
        const perf = await perfRes.json();

        document.getElementById('stat-total').textContent = users.length;
        document.getElementById('stat-active').textContent = users.filter(u => u.status === 'active').length;
        document.getElementById('stat-disabled').textContent = users.filter(u => u.status === 'disabled').length;
        document.getElementById('stat-assessed').textContent = perf.all.length;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}


async function loadDepartmentsFilter() {
    try {
        const response = await fetch('/admin/api/departments');
        const departments = await response.json();
        const select = document.getElementById('department-filter');

        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load departments:', error);
    }
}

function buildUsersQuery() {
    const q = document.getElementById('search-input').value.trim();
    const department = document.getElementById('department-filter').value;
    const status = document.getElementById('status-filter').value;
    const sortBy = document.getElementById('sort-select').value;

    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (department) params.set('department', department);
    if (status) params.set('status', status);
    params.set('sort_by', sortBy);

    return params.toString();
}

async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading users...</td></tr>';

    try {
        const response = await fetch(`/admin/api/users?${buildUsersQuery()}`);
        const users = await response.json();

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No users match these filters.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(renderUserRow).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Failed to load users.</td></tr>';
    }
}

function renderUserRow(user) {
    const scoreHtml = user.score_percent === null
        ? '<span class="score-cell no-score">Not assessed</span>'
        : `<span class="score-cell">${user.score_percent}%</span>`;

    const statusHtml = `<span class="status-badge ${user.status}">${user.status}</span>`;

    const toggleLabel = user.status === 'active' ? 'Disable' : 'Enable';
    const toggleClass = user.status === 'active' ? 'disable' : 'enable';
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';

    return `
        <tr>
            <td class="user-name-cell">${escapeHtml(user.name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.department)}</td>
            <td>${escapeHtml(user.designation || '—')}</td>
            <td>${scoreHtml}</td>
            <td>${statusHtml}</td>
            <td>
                <div class="row-actions">
                    <button class="action-button ${toggleClass}" onclick="toggleUserStatus(${user.id}, '${nextStatus}', '${escapeAttr(user.name)}')">${toggleLabel}</button>
                    <button class="action-button delete" onclick="deleteUser(${user.id}, '${escapeAttr(user.name)}')">Delete</button>
                </div>
            </td>
        </tr>
    `;
}

async function toggleUserStatus(userId, newStatus, name) {
    try {
        const response = await fetch(`/admin/api/users/${userId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to update status.');

        showToast(`${name} is now ${newStatus}.`, 'success');
        loadUsers();
        refreshStats();
    } catch (error) {
        showToast(error.message || 'Failed to update status.', 'error');
    }
}

async function deleteUser(userId, name) {
    if (!confirm(`Delete ${name}'s account permanently? This removes their profile, skills, and reports from BlitzLearn. Their login is not affected.`)) {
        return;
    }

    try {
        const response = await fetch(`/admin/api/users/${userId}`, { method: 'DELETE' });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to delete user.');

        showToast(`${name}'s account was deleted.`, 'success');
        loadUsers();
        refreshStats();
    } catch (error) {
        showToast(error.message || 'Failed to delete user.', 'error');
    }
}


async function loadPerformance() {
    const topBody = document.getElementById('top-performer-body');
    const bottomBody = document.getElementById('bottom-performer-body');
    const list = document.getElementById('leaderboard-list');

    try {
        const response = await fetch('/admin/api/performance');
        const data = await response.json();

        if (!data.top) {
            topBody.innerHTML = '<p class="no-data-text">No completed assessments yet.</p>';
            bottomBody.innerHTML = '<p class="no-data-text">No completed assessments yet.</p>';
            list.innerHTML = '';
            return;
        }

        topBody.innerHTML = renderPerformerBody(data.top);
        bottomBody.innerHTML = data.bottom ? renderPerformerBody(data.bottom) : '<p class="no-data-text">Not enough data yet.</p>';

        list.innerHTML = data.all.map((user, index) => `
            <div class="leaderboard-row">
                <div class="leaderboard-rank">#${index + 1}</div>
                <div class="leaderboard-info">
                    <div class="leaderboard-name">${escapeHtml(user.name)}</div>
                    <div class="leaderboard-meta">${escapeHtml(user.department)}${user.designation ? ' · ' + escapeHtml(user.designation) : ''}</div>
                </div>
                <div class="leaderboard-score">${user.score_percent}%</div>
            </div>
        `).join('');
    } catch (error) {
        topBody.innerHTML = '<p class="no-data-text">Failed to load.</p>';
        bottomBody.innerHTML = '<p class="no-data-text">Failed to load.</p>';
    }
}

function renderPerformerBody(user) {
    return `
        <div class="performer-name">${escapeHtml(user.name)}</div>
        <div class="performer-meta">${escapeHtml(user.department)}${user.designation ? ' · ' + escapeHtml(user.designation) : ''}</div>
        <div class="performer-score">${user.score_percent}%</div>
    `;
}


async function loadDepartmentReports() {
    const container = document.getElementById('department-reports-list');
    container.innerHTML = '<p class="no-data-text">Loading department reports...</p>';

    try {
        const response = await fetch('/admin/api/department_report');
        const departments = await response.json();

        if (departments.length === 0) {
            container.innerHTML = '<p class="no-data-text">No departments found yet.</p>';
            return;
        }

        container.innerHTML = departments.map(dept => `
            <div class="department-card">
                <div class="department-card-header">
                    <div>
                        <div class="department-name">${escapeHtml(dept.department)}</div>
                        <div class="department-meta-row">
                            <span class="department-meta-item">${dept.user_count} user${dept.user_count !== 1 ? 's' : ''}</span>
                            <span class="department-meta-item">${dept.assessed_count} assessed</span>
                        </div>
                    </div>
                    <div class="department-avg-score">
                        ${dept.avg_score_percent !== null ? dept.avg_score_percent + '%' : '—'}
                    </div>
                </div>
                ${dept.skills.length > 0 ? `
                    <div class="department-skills-grid">
                        ${dept.skills.map(s => `
                            <div class="dept-skill-row">
                                <span class="dept-skill-name">${escapeHtml(s.skill)}</span>
                                <div class="dept-skill-track">
                                    <div class="dept-skill-fill" style="width: ${s.avg_percent}%;"></div>
                                </div>
                                <span class="dept-skill-percent">${s.avg_percent}%</span>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p class="no-data-text">No assessment data yet for this department.</p>'}
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<p class="no-data-text">Failed to load department reports.</p>';
    }
}


function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "\\'");
}


document.addEventListener('DOMContentLoaded', () => {
    loadDepartmentsFilter();
    loadUsers();
    refreshStats();
    loadedViews.add('users');

    document.getElementById('search-input').addEventListener('input', debounce(loadUsers, 300));
    document.getElementById('department-filter').addEventListener('change', loadUsers);
    document.getElementById('status-filter').addEventListener('change', loadUsers);
    document.getElementById('sort-select').addEventListener('change', loadUsers);
});

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
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