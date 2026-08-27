let currentUid = null;

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

        loadEvaluateData();
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

async function loadEvaluateData() {
    const [, , history, tests] = await Promise.all([
        loadRadar(),
        loadGapAndPriority(),
        loadProgress(),
        loadTestHistory(),
    ]);
    updateStats(tests || [], history || []);
}

function updateStats(tests, progressHistory) {
    const attempted = tests.filter(t => t.attempted);
    const totalQuestions = attempted.reduce((sum, t) => sum + (t.total || 0), 0);
    const avgPercent = attempted.length > 0
        ? Math.round(attempted.reduce((sum, t) => sum + (t.percent || 0), 0) / attempted.length)
        : null;

    document.getElementById('stat-total-tests').textContent = tests.length;
    document.getElementById('stat-questions').textContent = totalQuestions;
    document.getElementById('stat-avg-score').textContent = avgPercent !== null ? `${avgPercent}%` : '—';

    if (progressHistory.length > 0) {
        const last = progressHistory[progressHistory.length - 1];
        document.getElementById('stat-last-assessed').textContent = formatDateShort(last.generated_at);
    } else {
        document.getElementById('stat-last-assessed').textContent = 'Never';
    }
}

async function loadRadar() {
    const wrapper = document.getElementById('radar-wrapper');
    try {
        const response = await fetch(`/api/skill_radar/${currentUid}`);
        const data = await response.json();

        if (!data.has_data || data.skills.length === 0) {
            wrapper.innerHTML = `<p class="empty-state">No skill assessment yet. <a href="/competency-test">Take it now</a>.</p>`;
            return;
        }

        wrapper.innerHTML = buildRadarSVG(data.skills);
    } catch (error) {
        wrapper.innerHTML = '<p class="empty-state">Failed to load your skill profile.</p>';
    }
}

function buildRadarSVG(skills) {
    const size = 380;
    const center = size / 2;
    const maxR = 130;
    const n = skills.length;

    if (n < 3) {
        return `<div>${skills.map(s => `
            <div class="gap-row" style="margin-bottom:14px;">
                <div class="gap-row-header">
                    <span class="gap-skill-name">${escapeHtml(s.skill)}</span>
                    <span class="gap-numbers">${s.percent}%</span>
                </div>
                <div class="gap-track"><div class="gap-current-fill" style="width:${s.percent}%;"></div></div>
            </div>
        `).join('')}</div>`;
    }

    const angleStep = (2 * Math.PI) / n;
    const angleFor = i => -Math.PI / 2 + i * angleStep;

    const point = (r, angle) => ({
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle)
    });

    const gridLevels = [0.25, 0.5, 0.75, 1];
    const gridPolygons = gridLevels.map(level => {
        const pts = skills.map((_, i) => {
            const p = point(maxR * level, angleFor(i));
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        }).join(' ');
        return `<polygon class="radar-grid" points="${pts}" />`;
    }).join('');

    const axisLines = skills.map((_, i) => {
        const p = point(maxR, angleFor(i));
        return `<line class="radar-axis" x1="${center}" y1="${center}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" />`;
    }).join('');

    const dataPoints = skills.map((s, i) => point((s.percent / 100) * maxR, angleFor(i)));
    const dataPolygon = dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dataDots = dataPoints.map(p => `<circle class="radar-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" />`).join('');

    const labels = skills.map((s, i) => {
        const angle = angleFor(i);
        const labelPoint = point(maxR + 34, angle);
        const percentPoint = point(maxR + 34, angle);
        const cosA = Math.cos(angle);
        let anchor = 'middle';
        if (cosA > 0.3) anchor = 'start';
        else if (cosA < -0.3) anchor = 'end';

        return `
            <text class="radar-label" x="${labelPoint.x.toFixed(1)}" y="${(labelPoint.y - 5).toFixed(1)}" text-anchor="${anchor}">${escapeHtml(truncate(s.skill, 16))}</text>
            <text class="radar-label-percent" x="${percentPoint.x.toFixed(1)}" y="${(percentPoint.y + 9).toFixed(1)}" text-anchor="${anchor}">${s.percent}%</text>
        `;
    }).join('');

    return `
        <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
            ${gridPolygons}
            ${axisLines}
            <polygon class="radar-shape" points="${dataPolygon}" />
            ${dataDots}
            ${labels}
        </svg>
    `;
}

async function loadGapAndPriority() {
    const gapList = document.getElementById('gap-list');
    const gapDetailGrid = document.getElementById('gap-detail-grid');
    const priorityList = document.getElementById('priority-list');
    const gapHint = document.getElementById('gap-hint');

    try {
        const response = await fetch(`/api/skill_gap/${currentUid}`);
        const data = await response.json();

        if (!data.has_data || data.skills.length === 0) {
            const emptyMsg = '<p class="empty-state">No skill assessment yet. <a href="/competency-test">Take it now</a>.</p>';
            gapList.innerHTML = emptyMsg;
            gapDetailGrid.innerHTML = emptyMsg;
            priorityList.innerHTML = emptyMsg;
            return;
        }

        gapHint.textContent = `Current level vs. a ${data.target_percent}% target for your role.`;

        const byName = [...data.skills].sort((a, b) => a.skill.localeCompare(b.skill));
        gapList.innerHTML = byName.map(s => `
            <div class="gap-row">
                <div class="gap-row-header">
                    <span class="gap-skill-name">${escapeHtml(s.skill)}</span>
                    <span class="gap-numbers">${s.current_percent}% / ${s.target_percent}% target</span>
                </div>
                <div class="gap-track">
                    <div class="gap-current-fill" style="width:${s.current_percent}%;"></div>
                    <div class="gap-target-marker" style="left:${s.target_percent}%;"></div>
                </div>
            </div>
        `).join('');

        gapDetailGrid.innerHTML = data.skills.map(s => {
            const priorityClass = s.priority.toLowerCase().replace(' ', '');
            return `
                <div class="gap-detail-card priority-${priorityClass}">
                    <div class="gap-detail-header">
                        <span class="gap-detail-name">${escapeHtml(s.skill)}</span>
                    </div>
                    <div class="gap-detail-numbers">
                        <div class="gap-detail-number-block">
                            <span class="gap-detail-number current">${s.current_percent}%</span>
                            <span class="gap-detail-number-label">Current</span>
                        </div>
                        <span class="gap-detail-divider">/</span>
                        <div class="gap-detail-number-block">
                            <span class="gap-detail-number target">${s.target_percent}%</span>
                            <span class="gap-detail-number-label">Target</span>
                        </div>
                        <div class="gap-detail-gap-tag">
                            <div class="gap-detail-gap-value ${priorityClass}">${s.gap > 0 ? '-' + s.gap : '0'}</div>
                            <span class="gap-detail-gap-label">Gap</span>
                        </div>
                    </div>
                    <div class="gap-detail-track">
                        <div class="gap-detail-fill ${priorityClass}" style="width:${s.current_percent}%;"></div>
                        <div class="gap-detail-target-marker" style="left:${s.target_percent}%;" title="Target: ${s.target_percent}%"></div>
                    </div>
                    <div class="gap-detail-footer">
                        <span class="gap-detail-badge ${priorityClass}">${escapeHtml(s.priority)} Priority</span>
                        <span class="gap-detail-legend">| marks target</span>
                    </div>
                </div>
            `;
        }).join('');

        priorityList.innerHTML = data.skills.map((s, index) => `
            <div class="priority-row">
                <div class="priority-rank">#${index + 1}</div>
                <div class="priority-info">
                    <div class="priority-skill">${escapeHtml(s.skill)}</div>
                    <div class="priority-detail">${s.current_percent}% now · ${s.target_percent}% target${s.gap > 0 ? ' · ' + s.gap + ' point gap' : ''}</div>
                </div>
                <span class="priority-badge ${s.priority.toLowerCase().replace(' ', '')}">${escapeHtml(s.priority)}</span>
            </div>
        `).join('');
    } catch (error) {
        gapList.innerHTML = '<p class="empty-state">Failed to load gap analysis.</p>';
        gapDetailGrid.innerHTML = '<p class="empty-state">Failed to load gap analysis.</p>';
        priorityList.innerHTML = '<p class="empty-state">Failed to load priorities.</p>';
    }
}

let progressHistoryCache = [];

async function loadProgress() {
    const wrapper = document.getElementById('progress-chart-wrapper');
    try {
        const response = await fetch(`/api/progress_history/${currentUid}`);
        const history = await response.json();
        progressHistoryCache = history;

        if (history.length === 0) {
            wrapper.innerHTML = '<p class="empty-state">No assessments yet.</p>';
            return history;
        }
        if (history.length === 1) {
            wrapper.innerHTML = `<p class="empty-state">You've taken 1 assessment so far — scoring <strong>${history[0].percent}%</strong>. Take another later to see your trend.</p>`;
            return history;
        }

        wrapper.innerHTML = buildProgressSVG(history);
        return history;
    } catch (error) {
        wrapper.innerHTML = '<p class="empty-state">Failed to load your progress.</p>';
        return [];
    }
}

function buildProgressSVG(history) {
    const width = 800;
    const height = 220;
    const padding = { top: 20, right: 20, bottom: 30, left: 36 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const xStep = history.length > 1 ? chartW / (history.length - 1) : 0;
    const yFor = percent => padding.top + chartH - (percent / 100) * chartH;
    const xFor = i => padding.left + i * xStep;

    const points = history.map((h, i) => ({ x: xFor(i), y: yFor(h.percent), percent: h.percent, date: h.generated_at }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${padding.top + chartH} L ${points[0].x.toFixed(1)} ${padding.top + chartH} Z`;

    const gridLines = [0, 25, 50, 75, 100].map(level => {
        const y = yFor(level);
        return `<line class="progress-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" />
                <text class="progress-axis-label" x="${padding.left - 8}" y="${y + 3}" text-anchor="end">${level}</text>`;
    }).join('');

    const dots = points.map(p => `
        <circle class="progress-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4">
            <title>${p.percent}% on ${formatDateShort(p.date)}</title>
        </circle>
    `).join('');

    const dateLabels = points.map((p, i) => {
        if (history.length > 8 && i % Math.ceil(history.length / 8) !== 0) return '';
        return `<text class="progress-axis-label" x="${p.x.toFixed(1)}" y="${height - 8}" text-anchor="middle">${formatDateShort(p.date)}</text>`;
    }).join('');

    return `
        <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            ${gridLines}
            <path class="progress-area" d="${areaPath}" />
            <path class="progress-line" d="${linePath}" />
            ${dots}
            ${dateLabels}
        </svg>
    `;
}

const testDetailCache = {};

async function loadTestHistory() {
    const list = document.getElementById('test-history-list');
    try {
        const response = await fetch(`/api/my_tests/${currentUid}`);
        const tests = await response.json();

        if (tests.length === 0) {
            list.innerHTML = '<p class="empty-state">You haven\'t taken any tests yet.</p>';
            return tests;
        }

        list.innerHTML = tests.map(t => `
            <div class="test-history-row" id="test-row-${t.test_id}">
                <div class="test-history-header" onclick="toggleTestRow(${t.test_id})">
                    <div class="test-history-info">
                        <span class="test-history-title">${escapeHtml(t.source_title || 'Test')} · ${escapeHtml(capitalize(t.difficulty))}</span>
                        <span class="test-history-meta">${t.num_questions} questions · ${formatDateShort(t.created_at)}</span>
                    </div>
                    <div class="test-history-right">
                        ${t.attempted
                            ? `<span class="test-history-score">${t.percent}%</span>`
                            : `<span class="test-history-score no-attempt">Not submitted</span>`}
                        <svg class="expand-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </div>
                </div>
                <div class="test-history-detail" id="test-detail-${t.test_id}"></div>
            </div>
        `).join('');

        return tests;
    } catch (error) {
        list.innerHTML = '<p class="empty-state">Failed to load test history.</p>';
        return [];
    }
}

async function toggleTestRow(testId) {
    const row = document.getElementById(`test-row-${testId}`);
    const detail = document.getElementById(`test-detail-${testId}`);
    const isExpanding = !row.classList.contains('expanded');

    row.classList.toggle('expanded');
    if (!isExpanding) return;

    if (testDetailCache[testId]) {
        detail.innerHTML = testDetailCache[testId];
        return;
    }

    detail.innerHTML = '<div class="detail-loading">Loading questions...</div>';

    try {
        const response = await fetch(`/api/test_detail/${testId}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to load.');

        const html = data.questions.map((q, index) => `
            <div class="detail-question-card">
                <div class="detail-question-header">
                    <span class="detail-question-number">Question ${index + 1}</span>
                    <span class="detail-badge">${escapeHtml(q.topic || 'General')}</span>
                </div>
                <p class="detail-question-text">${escapeHtml(q.question)}</p>
                <div class="detail-options">
                    ${['a', 'b', 'c', 'd'].map(letter => {
                        let cls = 'detail-option';
                        if (letter === q.correct_option) cls += ' correct';
                        else if (letter === q.selected_option) cls += ' wrong';
                        return `
                            <div class="${cls}">
                                <span class="detail-option-letter">${letter.toUpperCase()}</span>
                                <span>${escapeHtml(q.options[letter])}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${q.explanation ? `<div class="detail-explanation"><strong>Explanation:</strong> ${escapeHtml(q.explanation)}</div>` : ''}
            </div>
        `).join('');

        testDetailCache[testId] = html;
        detail.innerHTML = html;
    } catch (error) {
        detail.innerHTML = '<div class="detail-loading">Failed to load questions.</div>';
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDateShort(iso) {
    if (!iso) return '—';
    const d = new Date(iso.replace(' ', 'T'));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}


const customCursor = document.getElementById('custom-cursor');
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (!isTouchDevice) {
    document.addEventListener('mousemove', (e) => {
        customCursor.style.left = `${e.clientX}px`;
        customCursor.style.top = `${e.clientY}px`;

        const target = e.target;
        const isInteractive = target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button') || target.closest('.test-history-header');

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