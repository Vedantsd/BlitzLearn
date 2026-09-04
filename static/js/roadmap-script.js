let currentUid = null;
let roadmapData = [];
let activeFilter = 'all';

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

        loadRoadmap();
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

async function loadRoadmap() {
    const list = document.getElementById('roadmap-list');

    try {
        const data = await BLData.getRoadmap();
        renderRoadmapData(data);
    } catch (error) {
        list.innerHTML = `<p class="empty-state">${escapeHtml(error.message || 'Failed to load your roadmap.')}</p>`;
        updateStats([]);
    }

    document.addEventListener('bl-roadmap-updated', e => renderRoadmapData(e.detail));
}

function renderRoadmapData(data) {
    const list = document.getElementById('roadmap-list');

    if (!data || data.error) {
        list.innerHTML = `<p class="empty-state">${escapeHtml((data && data.error) || 'Failed to load your roadmap.')}</p>`;
        updateStats([]);
        return;
    }

    if (!data.has_data || !data.skills || data.skills.length === 0) {
        list.innerHTML = '<p class="empty-state">No skill assessment yet. <a href="/competency-test">Take it now</a> to generate your roadmap.</p>';
        updateStats([]);
        return;
    }

    roadmapData = data.skills;
    updateStats(roadmapData);
    renderRoadmap();
}

function updateStats(skills) {
    const needsFocus = skills.filter(s => s.priority !== 'On Target').length;
    const igotCount = skills.reduce((sum, s) => sum + (s.igot_courses ? s.igot_courses.length : 0), 0);
    const tpacCount = skills.reduce((sum, s) => sum + (s.tpac_docs ? s.tpac_docs.length : 0), 0);
    const noResource = skills.filter(s => hasNoResource(s) && s.priority !== 'On Target').length;

    document.getElementById('stat-skills-flagged').textContent = needsFocus;
    document.getElementById('stat-igot-count').textContent = igotCount;
    document.getElementById('stat-tpac-count').textContent = tpacCount;
    document.getElementById('stat-no-resource').textContent = noResource;
}

function hasNoResource(skill) {
    const igot = skill.igot_courses || [];
    const tpac = skill.tpac_docs || [];
    return igot.length === 0 && tpac.length === 0;
}

function setFilter(filter, button) {
    activeFilter = filter;
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    button.classList.add('active');
    renderRoadmap();
}

function renderRoadmap() {
    const list = document.getElementById('roadmap-list');

    let filtered = roadmapData;
    if (activeFilter === 'needs-focus') {
        filtered = roadmapData.filter(s => s.priority !== 'On Target');
    } else if (activeFilter === 'no-resource') {
        filtered = roadmapData.filter(s => hasNoResource(s) && s.priority !== 'On Target');
    }

    if (filtered.length === 0) {
        list.innerHTML = '<p class="empty-state">No skills match this filter.</p>';
        return;
    }

    list.innerHTML = filtered.map(renderSkillCard).join('');
}

function renderSkillCard(skill) {
    const priorityClass = skill.priority.toLowerCase().replace(' ', '');
    const igotCourses = skill.igot_courses || [];
    const tpacDocs = skill.tpac_docs || [];
    const fallbackTopics = skill.fallback_topics || [];

    let resourcesHtml = '';

    if (igotCourses.length > 0) {
        resourcesHtml += `
            <div class="resource-section-label">iGOT Karmayogi Courses</div>
            <div class="resource-list">
                ${igotCourses.map(renderIgotResource).join('')}
            </div>
        `;
    }

    if (tpacDocs.length > 0) {
        resourcesHtml += `
            <div class="resource-section-label">NSSTA TPAC Training</div>
            <div class="resource-list">
                ${tpacDocs.map(renderTpacResource).join('')}
            </div>
        `;
    }

    if (igotCourses.length === 0 && tpacDocs.length === 0) {
        resourcesHtml += `
            <div class="no-resource-block">
                <div class="no-resource-icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                </div>
                <div class="no-resource-text">
                    <div class="no-resource-title">No matching course or training document found yet</div>
                    ${fallbackTopics.length > 0 ? `
                        <div>Focus on these topics in the meantime:</div>
                        <div class="topic-chips">
                            ${fallbackTopics.map(t => `<span class="topic-chip">${escapeHtml(t)}</span>`).join('')}
                        </div>
                    ` : `<div>Try a practice test on this skill from the Tests page to keep building evidence.</div>`}
                </div>
            </div>
        `;
    }

    return `
        <div class="roadmap-card priority-${priorityClass}">
            <div class="roadmap-card-header">
                <div>
                    <div class="roadmap-skill-name">${escapeHtml(skill.skill)}</div>
                    <div class="roadmap-skill-numbers">${skill.current_percent}% now · ${skill.target_percent}% target${skill.gap > 0 ? ' · ' + skill.gap + ' point gap' : ''}</div>
                </div>
                <span class="priority-badge ${priorityClass}">${escapeHtml(skill.priority)}</span>
            </div>
            ${resourcesHtml}
        </div>
    `;
}

function renderIgotResource(course) {
    return `
        <div class="resource-item">
            <div class="resource-icon igot">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            </div>
            <div class="resource-info">
                <div class="resource-title">${escapeHtml(course.course_name || 'Untitled Course')}</div>
                <div class="resource-meta">${[course.organisation, course.duration].filter(Boolean).map(escapeHtml).join(' · ') || 'iGOT Karmayogi'}</div>
            </div>
            ${course.url ? `<a class="resource-link" href="${escapeAttr(course.url)}" target="_blank" rel="noopener">View Course</a>` : ''}
        </div>
    `;
}

function renderTpacResource(doc) {
    return `
        <div class="resource-item">
            <div class="resource-icon tpac">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <div class="resource-info">
                <div class="resource-title">${escapeHtml(doc.subject || 'TPAC Document')}</div>
                <div class="resource-meta">${[doc.reference_id, doc.start_date].filter(Boolean).map(escapeHtml).join(' · ') || 'NSSTA'}</div>
            </div>
            ${doc.document_url ? `<a class="resource-link" href="${escapeAttr(doc.document_url)}" target="_blank" rel="noopener">View Document</a>` : ''}
        </div>
    `;
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
