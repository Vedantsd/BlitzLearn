let learnersData = [];
let selectedLearnerId = null;
let allCoursesData = [];

document.addEventListener('DOMContentLoaded', () => {
    loadTrainerInfo();
    loadLearners();

    document.getElementById('course-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchCourses();
        }
    });
});

async function loadTrainerInfo() {
    try {
        const response = await fetch('/trainer/api/me');
        if (response.status === 401) {
            window.location.href = '/trainer/login';
            return;
        }
        const data = await response.json();
        document.getElementById('trainer-name').textContent = data.name || '—';
        document.getElementById('trainer-dept').textContent = data.department || '—';
    } catch (error) {
        window.location.href = '/trainer/login';
    }
}

async function loadLearners() {
    const list = document.getElementById('learners-list');
    try {
        const response = await fetch('/trainer/api/learners');
        if (response.status === 401) {
            window.location.href = '/trainer/login';
            return;
        }
        const data = await response.json();
        learnersData = data.learners || [];

        updateStats(learnersData, data.total_learning_hours || 0);
        renderLearners(learnersData);
    } catch (error) {
        list.innerHTML = '<p class="empty-state">Failed to load learners.</p>';
    }
}

function updateStats(learners, totalHours) {
    const assessed = learners.filter(l => l.score_percent !== null);
    const avg = assessed.length > 0
        ? Math.round(assessed.reduce((sum, l) => sum + l.score_percent, 0) / assessed.length)
        : null;

    document.getElementById('stat-total').textContent = learners.length;
    document.getElementById('stat-assessed').textContent = assessed.length;
    document.getElementById('stat-avg').textContent = avg !== null ? `${avg}%` : '—';
    document.getElementById('stat-total-hours').textContent = `${totalHours}h`;
}

function renderLearners(learners) {
    const list = document.getElementById('learners-list');

    if (learners.length === 0) {
        list.innerHTML = '<p class="empty-state">No learners found in your department.</p>';
        return;
    }

    list.innerHTML = learners.map(l => `
        <div class="learner-row ${l.id === selectedLearnerId ? 'active' : ''}" onclick="selectLearner(${l.id})">
            <div>
                <div class="learner-row-name">${escapeHtml(l.name)}</div>
                <div class="learner-row-designation">${escapeHtml(l.designation || 'No designation')} · ${l.learning_hours || 0}h</div>
            </div>
            <div class="learner-row-score ${l.score_percent === null ? 'none' : ''}">
                ${l.score_percent !== null ? l.score_percent + '%' : 'N/A'}
            </div>
        </div>
    `).join('');
}

function filterLearners() {
    const q = document.getElementById('learner-search').value.trim().toLowerCase();
    if (!q) {
        renderLearners(learnersData);
        return;
    }
    const filtered = learnersData.filter(l =>
        (l.name || '').toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q)
    );
    renderLearners(filtered);
}

async function selectLearner(userId) {
    selectedLearnerId = userId;
    renderLearners(learnersData.filter(l => matchesCurrentSearch(l)));

    document.getElementById('no-learner-selected').style.display = 'none';
    document.getElementById('learner-detail').style.display = 'block';
    document.getElementById('course-search').value = '';

    try {
        const response = await fetch(`/trainer/api/learner/${userId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load learner.');
        renderLearnerDetail(data);
    } catch (error) {
        document.getElementById('detail-name').textContent = 'Failed to load learner';
    }

    loadAllCourses();
    loadAssignedCourses(userId);
}

function matchesCurrentSearch(l) {
    const q = document.getElementById('learner-search').value.trim().toLowerCase();
    if (!q) return true;
    return (l.name || '').toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q);
}

function renderLearnerDetail(data) {
    document.getElementById('detail-name').textContent = data.name;
    document.getElementById('detail-meta').textContent =
        `${data.email} · ${data.designation || 'No designation'} · ${data.department} · ${data.total_learning_hours || 0}h learned`;

    const scoreBadge = document.getElementById('detail-score');
    if (data.latest_report && data.latest_report.overall_total) {
        const percent = Math.round((data.latest_report.overall_score / data.latest_report.overall_total) * 100);
        scoreBadge.textContent = `${percent}%`;
    } else {
        scoreBadge.textContent = 'N/A';
    }

    const skillsEl = document.getElementById('detail-skills');
    if (!data.competency || data.competency.length === 0) {
        skillsEl.innerHTML = '<p class="empty-state">No competency data yet.</p>';
    } else {
        skillsEl.innerHTML = data.competency.map(s => `
            <div class="skill-bar-row">
                <span class="skill-bar-name">${escapeHtml(s.skill)}</span>
                <div class="skill-bar-track"><div class="skill-bar-fill" style="width:${s.percent}%;"></div></div>
                <span class="skill-bar-percent">${s.percent}%</span>
            </div>
        `).join('');
    }

    const testsEl = document.getElementById('detail-tests');
    if (!data.test_history || data.test_history.length === 0) {
        testsEl.innerHTML = '<p class="empty-state">No tests taken yet.</p>';
    } else {
        testsEl.innerHTML = data.test_history.slice(0, 8).map(t => `
            <div class="detail-test-row">
                <span>${escapeHtml(t.source_title || 'Test')} · ${escapeHtml(capitalize(t.difficulty))}</span>
                <span class="detail-test-score">${t.attempted ? t.percent + '%' : 'Not submitted'}</span>
            </div>
        `).join('');
    }
}

async function loadAllCourses() {
    const resultsEl = document.getElementById('course-results');
    resultsEl.innerHTML = '<p class="empty-state">Loading courses...</p>';

    try {
        const response = await fetch('/api/courses');
        const courses = await response.json();
        allCoursesData = courses || [];
        renderCoursePane(allCoursesData);
    } catch (error) {
        resultsEl.innerHTML = '<p class="empty-state">Failed to load courses.</p>';
    }
}

function renderCoursePane(courses) {
    const resultsEl = document.getElementById('course-results');

    if (!courses || courses.length === 0) {
        resultsEl.innerHTML = '<p class="empty-state">No courses found.</p>';
        return;
    }

    resultsEl.innerHTML = courses.map(renderCourseCard).join('');
}

function renderCourseCard(c) {
    return `
        <div class="course-result-card">
            <div class="course-result-info">
                <div class="course-result-title">${escapeHtml(c.course_name || 'Untitled Course')}</div>
                <div class="course-result-meta">${[c.organisation, c.duration].filter(Boolean).map(escapeHtml).join(' · ') || 'iGOT Karmayogi'}</div>
            </div>
            <button class="course-assign-btn" onclick='assignCourse(${JSON.stringify(c)}, this)'>Assign</button>
        </div>
    `;
}

function filterCoursesLive() {
    const q = document.getElementById('course-search').value.trim().toLowerCase();

    if (!q) {
        renderCoursePane(allCoursesData);
        return;
    }

    const filtered = allCoursesData.filter(c =>
        (c.course_name || '').toLowerCase().includes(q) ||
        (c.organisation || '').toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q)
    );
    renderCoursePane(filtered);
}

async function searchCourses() {
    const q = document.getElementById('course-search').value.trim();
    const resultsEl = document.getElementById('course-results');
    resultsEl.innerHTML = '<p class="empty-state">Searching...</p>';

    try {
        const response = await fetch(`/api/courses?q=${encodeURIComponent(q)}`);
        const courses = await response.json();
        allCoursesData = courses || [];
        renderCoursePane(allCoursesData);
    } catch (error) {
        resultsEl.innerHTML = '<p class="empty-state">Failed to search courses.</p>';
    }
}

async function assignCourse(course, buttonEl) {
    if (!selectedLearnerId) return;

    buttonEl.disabled = true;
    buttonEl.textContent = 'Assigning...';

    try {
        const response = await fetch('/trainer/api/assign_course', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: selectedLearnerId,
                course_name: course.course_name,
                course_url: course.url,
                organisation: course.organisation,
                duration: course.duration,
                category: course.category
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to assign course.');

        buttonEl.textContent = 'Assigned ✓';
        loadAssignedCourses(selectedLearnerId);
    } catch (error) {
        buttonEl.disabled = false;
        buttonEl.textContent = 'Assign';
        showAlert(error.message || 'Failed to assign course.');
    }
}

async function loadAssignedCourses(userId) {
    const list = document.getElementById('assigned-courses-list');
    list.innerHTML = '<p class="empty-state">Loading...</p>';

    try {
        const response = await fetch(`/trainer/api/learner/${userId}/assigned_courses`);
        const data = await response.json();
        const courses = data.assigned_courses || [];

        if (courses.length === 0) {
            list.innerHTML = '<p class="empty-state">No courses assigned yet.</p>';
            return;
        }

        list.innerHTML = courses.map(c => `
            <div class="assigned-row">
                <div class="assigned-row-info">
                    <div class="assigned-row-title">${escapeHtml(c.course_name)}</div>
                    <div class="assigned-row-meta">${[c.organisation, c.duration].filter(Boolean).map(escapeHtml).join(' · ') || 'iGOT Karmayogi'}</div>
                </div>
                <button class="assigned-remove-btn" onclick="removeAssignedCourse(${c.id}, ${userId})">Remove</button>
            </div>
        `).join('');
    } catch (error) {
        list.innerHTML = '<p class="empty-state">Failed to load assigned courses.</p>';
    }
}

async function removeAssignedCourse(assignmentId, userId) {
    if (!confirm('Remove this assigned course?')) return;

    try {
        const response = await fetch(`/trainer/api/assigned_courses/${assignmentId}`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to remove.');
        loadAssignedCourses(userId);
    } catch (error) {
        showAlert(error.message || 'Failed to remove course.');
    }
}

function handleTrainerLogout() {
    fetch('/trainer/api/logout', { method: 'POST' })
        .finally(() => { window.location.href = '/trainer/login'; });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showAlert(message, type = 'info') {
    let container = document.getElementById('universal-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'universal-toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `universal-toast ${type}`;

    const icon = document.createElement('span');
    icon.className = 'universal-toast-icon';
    const icons = {
        success: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
        error: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
        warning: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 004 21h16a2 2 0 001.89-3l-8.18-14.14a2 2 0 00-3.42 0z"/></svg>',
        info: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    };
    icon.innerHTML = icons[type] || icons.info;

    const text = document.createElement('span');
    text.className = 'universal-toast-message';
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}