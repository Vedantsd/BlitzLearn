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
    }, 3500);
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

const TOTAL_STEPS = 6;
let currentStep = 1;

let educationRows = [];   
let experienceRows = [];  
let skillsData = [];      
let rowIdCounter = 0;

function showStep(step) {
    document.querySelectorAll('.step-panel').forEach(panel => {
        panel.classList.toggle('active', Number(panel.dataset.step) === step);
    });

    document.querySelectorAll('.step-dot').forEach(dot => {
        const dotStep = Number(dot.dataset.step);
        dot.classList.toggle('active', dotStep === step);
        dot.classList.toggle('completed', dotStep < step);
    });

    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    prevBtn.style.visibility = step === 1 ? 'hidden' : 'visible';
    nextBtn.textContent = step === TOTAL_STEPS ? 'Create Account & Start Assessment' : 'Continue';
}

function validateStep(step) {
    if (step === 1) {
        const name = document.getElementById('basic-name').value.trim();
        const email = document.getElementById('basic-email').value.trim();
        const password = document.getElementById('basic-password').value;
        const confirm = document.getElementById('basic-confirm-password').value;
        const errorEl = document.getElementById('basic-error');

        if (!name || !email || !password || !confirm) {
            errorEl.textContent = 'Please fill in all required fields.';
            return false;
        }
        if (password.length < 8) {
            errorEl.textContent = 'Password must be at least 8 characters.';
            return false;
        }
        if (password !== confirm) {
            errorEl.textContent = 'Passwords do not match.';
            return false;
        }
        errorEl.textContent = '';
        return true;
    }

    if (step === 3) {
        const errorEl = document.getElementById('skills-error');
        if (skillsData.length === 0) {
            errorEl.textContent = 'Please add at least one skill.';
            return false;
        }
        errorEl.textContent = '';
        return true;
    }

    if (step === 5) {
        const department = document.getElementById('role-department').value;
        const designation = document.getElementById('role-designation').value.trim();
        const errorEl = document.getElementById('role-error');
        if (!department || !designation) {
            errorEl.textContent = 'Please select a department and enter your designation.';
            return false;
        }
        errorEl.textContent = '';
        return true;
    }

    return true;
}

function nextStep() {
    if (!validateStep(currentStep)) return;

    if (currentStep === TOTAL_STEPS) {
        completeSignup();
        return;
    }

    currentStep += 1;
    showStep(currentStep);
}

function prevStep() {
    if (currentStep === 1) return;
    currentStep -= 1;
    showStep(currentStep);
}

function addEducationRow() {
    const id = ++rowIdCounter;
    educationRows.push({ id, degree: '', institution: '', year: '' });
    renderEducationRows();
}

function removeEducationRow(id) {
    educationRows = educationRows.filter(row => row.id !== id);
    renderEducationRows();
}

function updateEducationField(id, field, value) {
    const row = educationRows.find(r => r.id === id);
    if (row) row[field] = value;
}

function renderEducationRows() {
    const container = document.getElementById('education-list');
    container.innerHTML = educationRows.map(row => `
        <div class="dynamic-row">
            <button type="button" class="remove-row-button" onclick="removeEducationRow(${row.id})">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <div class="form-row">
                <div class="form-group">
                    <label>Degree</label>
                    <input type="text" value="${escapeAttr(row.degree)}" placeholder="e.g. B.Tech in Computer Science"
                        oninput="updateEducationField(${row.id}, 'degree', this.value)">
                </div>
                <div class="form-group">
                    <label>Institution</label>
                    <input type="text" value="${escapeAttr(row.institution)}" placeholder="e.g. IIT Delhi"
                        oninput="updateEducationField(${row.id}, 'institution', this.value)">
                </div>
            </div>
            <div class="form-group">
                <label>Year of Completion</label>
                <input type="text" value="${escapeAttr(row.year)}" placeholder="e.g. 2022"
                    oninput="updateEducationField(${row.id}, 'year', this.value)">
            </div>
        </div>
    `).join('');
}


function addSkill() {
    const nameInput = document.getElementById('skill-name-input');
    const levelInput = document.getElementById('skill-level-input');
    const name = nameInput.value.trim();

    if (!name) return;
    if (skillsData.some(s => s.name.toLowerCase() === name.toLowerCase())) {
        showToast('That skill is already added.', 'error');
        return;
    }

    skillsData.push({ name, level: levelInput.value });
    nameInput.value = '';
    nameInput.focus();
    renderSkillsChips();
}

function removeSkill(index) {
    skillsData.splice(index, 1);
    renderSkillsChips();
}

function renderSkillsChips() {
    const container = document.getElementById('skills-chips');
    container.innerHTML = skillsData.map((skill, index) => `
        <div class="skill-chip">
            <span>${escapeHtml(skill.name)}</span>
            <span class="chip-level">${escapeHtml(skill.level)}</span>
            <button type="button" class="chip-remove" onclick="removeSkill(${index})">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('skill-name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSkill();
        }
    });
});


function addExperienceRow() {
    const id = ++rowIdCounter;
    experienceRows.push({ id, role: '', organization: '', duration: '', description: '' });
    renderExperienceRows();
}

function removeExperienceRow(id) {
    experienceRows = experienceRows.filter(row => row.id !== id);
    renderExperienceRows();
}

function updateExperienceField(id, field, value) {
    const row = experienceRows.find(r => r.id === id);
    if (row) row[field] = value;
}

function renderExperienceRows() {
    const container = document.getElementById('experience-list');
    container.innerHTML = experienceRows.map(row => `
        <div class="dynamic-row">
            <button type="button" class="remove-row-button" onclick="removeExperienceRow(${row.id})">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <div class="form-row">
                <div class="form-group">
                    <label>Role / Position</label>
                    <input type="text" value="${escapeAttr(row.role)}" placeholder="e.g. Data Analyst Intern"
                        oninput="updateExperienceField(${row.id}, 'role', this.value)">
                </div>
                <div class="form-group">
                    <label>Organization</label>
                    <input type="text" value="${escapeAttr(row.organization)}" placeholder="e.g. NSSTA"
                        oninput="updateExperienceField(${row.id}, 'organization', this.value)">
                </div>
            </div>
            <div class="form-group">
                <label>Duration</label>
                <input type="text" value="${escapeAttr(row.duration)}" placeholder="e.g. Jun 2022 - Aug 2022"
                    oninput="updateExperienceField(${row.id}, 'duration', this.value)">
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea placeholder="What did you work on?"
                    oninput="updateExperienceField(${row.id}, 'description', this.value)">${escapeHtml(row.description)}</textarea>
            </div>
        </div>
    `).join('');
}


async function completeSignup() {
    const nextBtn = document.getElementById('next-btn');
    nextBtn.disabled = true;
    nextBtn.textContent = 'Creating your account...';

    const name = document.getElementById('basic-name').value.trim();
    const age = document.getElementById('basic-age').value;
    const phone = document.getElementById('basic-phone').value.trim();
    const email = document.getElementById('basic-email').value.trim();
    const password = document.getElementById('basic-password').value;
    const department = document.getElementById('role-department').value;
    const designation = document.getElementById('role-designation').value.trim();

    try {
        const credential = await auth.createUserWithEmailAndPassword(email, password);
        await credential.user.updateProfile({ displayName: name });

        const response = await fetch('/api/save_profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid: credential.user.uid,
                name, age: age ? Number(age) : null, phone, email,
                department, designation,
                education: educationRows.map(({ degree, institution, year }) => ({ degree, institution, year })),
                skills: skillsData,
                experience: experienceRows.map(({ role, organization, duration, description }) => ({ role, organization, duration, description }))
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to save your profile.');
        }

        showToast('Account created! Generating your skill assessment...', 'success');
        setTimeout(() => {
            window.location.href = '/competency-test';
        }, 800);

    } catch (error) {
        showToast(error.message || 'Something went wrong. Please try again.', 'error');
        nextBtn.disabled = false;
        nextBtn.textContent = 'Create Account & Start Assessment';
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
}


document.addEventListener('DOMContentLoaded', () => {
    addEducationRow();
    addExperienceRow();
    showStep(1);
});


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