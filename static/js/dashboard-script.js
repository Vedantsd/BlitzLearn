let currentUserEmail = null;
let notesProcessed = false;

firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        window.location.href = '/login';
    } else {
        console.log("Active Session:", user.email);
        currentUserEmail = user.email;

        const photoEl = document.getElementById('user-photo');
        const initialEl = document.getElementById('user-initial');

        if (user.photoURL) {
            photoEl.src = user.photoURL;
            photoEl.style.display = 'block';
            initialEl.style.display = 'none';
        } else {
            initialEl.textContent = user.email.charAt(0).toUpperCase();
            photoEl.style.display = 'none';
            initialEl.style.display = 'block';
        }

        renderLearningHistory();
        refreshProcessedStatus();
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

document.addEventListener('DOMContentLoaded', function () {
    const headerLeft = document.querySelector('.header-left');
    const hamburger = document.createElement('button');
    hamburger.className = 'hamburger-menu';
    hamburger.innerHTML = '<span></span><span></span><span></span>';
    headerLeft.insertBefore(hamburger, headerLeft.firstChild);

    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    hamburger.addEventListener('click', function () {
        hamburger.classList.toggle('active');
        document.querySelector('.sidebar').classList.toggle('active');
        overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', function () {
        hamburger.classList.remove('active');
        document.querySelector('.sidebar').classList.remove('active');
        overlay.classList.remove('active');
    });
});

function goToProfile() {
    window.location.href = '/profile';
}

function historyKey() {
    return `learningHistory_${currentUserEmail || 'guest'}`;
}

function addToLearningHistory(entry) {
    const key = historyKey();
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift({ ...entry, date: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(list));
    renderLearningHistory();
}

async function removeHistoryItem(index) {
    const key = historyKey();
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const item = list[index];
    if (!item) return;

    list.splice(index, 1);
    localStorage.setItem(key, JSON.stringify(list));
    renderLearningHistory();

    if (item.filename) {
        try {
            await authFetch(`/staged_files/${encodeURIComponent(item.filename)}`, { method: 'DELETE' });
        } catch (e) {
        }
    }
}

function renderLearningHistory() {
    const container = document.getElementById('learning-history');
    const list = JSON.parse(localStorage.getItem(historyKey()) || '[]');

    if (list.length === 0) {
        container.innerHTML = '<div class="history-empty" id="history-empty">No notes or books added yet.</div>';
        return;
    }

    container.innerHTML = list.map((item, index) => `
        <div class="history-item">
            <div class="history-icon ${item.type === 'book' ? 'book' : 'upload'}">
                ${item.type === 'book' ? bookIconSvg() : uploadIconSvg()}
            </div>
            <div class="history-meta">
                <span class="history-name">${escapeHtml(item.name)}</span>
                <span class="history-date">${formatDate(item.date)}</span>
            </div>
            <button class="history-remove" title="Remove / ignore for next chat" onclick="removeHistoryItem(${index})">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `).join('');
}

function bookIconSvg() {
    return `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`;
}

function uploadIconSvg() {
    return `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>`;
}

function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function handleFileUpload() {
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const fileInput = document.getElementById('pdf-upload');
    const fileCount = document.getElementById('file-count');
    const statusEl = document.getElementById('upload-status');

    let validFiles = [];
    let hasOversizedFile = false;

    for (const file of fileInput.files) {
        if (file.size > MAX_FILE_SIZE) {
            hasOversizedFile = true;
        } else {
            validFiles.push(file);
        }
    }

    if (hasOversizedFile) {
        alert("One or more files exceed the 20MB limit and were removed.");
    }

    const dataTransfer = new DataTransfer();
    validFiles.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;

    const count = fileInput.files.length;
    fileCount.textContent = count > 0 ? `${count} file${count > 1 ? 's' : ''} selected` : '';

    if (count === 0) return;

    statusEl.textContent = 'Adding to your notes...';
    statusEl.className = 'upload-status';

    const formData = new FormData();
    for (const file of fileInput.files) {
        formData.append('pdf_files', file);
    }

    try {
        // Note: authFetch attaches the Authorization header but leaves the
        // FormData body/Content-Type alone (the browser sets the correct
        // multipart boundary automatically as long as we don't set our own
        // Content-Type header here).
        const response = await authFetch('/upload_stage', { method: 'POST', body: formData });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Upload failed');

        statusEl.textContent = data.message;
        statusEl.className = 'upload-status success';

        for (const file of fileInput.files) {
            addToLearningHistory({ name: file.name, type: 'upload', filename: file.name });
        }

        fileInput.value = '';
        fileCount.textContent = '';
    } catch (error) {
        statusEl.textContent = error.message || 'Failed to upload. Please try again.';
        statusEl.className = 'upload-status error';
    }
}

async function processContent() {
    const processBtn = document.getElementById('process-content');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    processBtn.textContent = "Processing...";
    processBtn.disabled = true;
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.style.background = '';
    progressText.textContent = 'Preparing your notes...';

    progressBar.style.width = '30%';
    progressText.textContent = 'Extracting text from your notes...';

    try {
        setTimeout(() => {
            progressBar.style.width = '60%';
            progressText.textContent = 'Creating embeddings...';
        }, 500);

        const response = await authFetch('/process', { method: 'POST' });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to process content.');
        }

        progressBar.style.width = '100%';
        progressText.textContent = data.message || 'Processing complete!';
        progressText.style.color = '#10b981';

        setTilesEnabled(true);

        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressText.style.color = '';
        }, 2000);

    } catch (error) {
        progressBar.style.width = '100%';
        progressBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        progressText.textContent = error.message || 'Failed to process content. Please try again.';
        progressText.style.color = '#ef4444';

        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressBar.style.background = '';
            progressText.style.color = '';
        }, 3000);
    } finally {
        processBtn.textContent = "Process Content";
        processBtn.disabled = false;
    }
}

function openBooksModal() {
    document.getElementById('books-modal-overlay').classList.add('active');
    loadBooks();
}

function closeBooksModal() {
    document.getElementById('books-modal-overlay').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('books-modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'books-modal-overlay') closeBooksModal();
    });
});

async function loadBooks() {
    const grid = document.getElementById('books-grid');
    grid.innerHTML = '<div class="books-loading">Loading books...</div>';

    try {
        // Public, non-personal listing — no auth needed.
        const response = await fetch('/api/books');
        const books = await response.json();

        if (!books.length) {
            grid.innerHTML = '<div class="books-empty">No books have been added by your admin yet.</div>';
            return;
        }

        grid.innerHTML = books.map(book => `
            <div class="book-card">
                <span class="book-subject">${escapeHtml(book.subject)}</span>
                <p class="book-title">${escapeHtml(book.title)}</p>
                <p class="book-author">${escapeHtml(book.author)}</p>
                <button class="book-add-button" data-book-id="${book.id}" onclick="selectBook('${book.id}', this)">
                    Add to My Notes
                </button>
            </div>
        `).join('');
    } catch (error) {
        grid.innerHTML = '<div class="books-error">Failed to load books. Please try again.</div>';
    }
}

async function selectBook(bookId, buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Adding...';

    try {
        const response = await authFetch('/select_book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ book_id: bookId })
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to add book');

        buttonEl.textContent = 'Added ✓';
        addToLearningHistory({ name: data.title, type: 'book', filename: data.filename });
    } catch (error) {
        buttonEl.disabled = false;
        buttonEl.textContent = 'Add to My Notes';
        alert(error.message || 'Failed to add this book. Please try again.');
    }
}

async function refreshProcessedStatus() {
    try {
        const response = await authFetch('/processed_status');
        const data = await response.json();
        setTilesEnabled(data.processed);
    } catch (error) {
        setTilesEnabled(false);
    }
}

function setTilesEnabled(enabled) {
    notesProcessed = enabled;
    document.querySelectorAll('.tile').forEach(tile => {
        if (tile.id === 'evaluate-tile' || tile.id === 'roadmap-tile') return;
        tile.classList.toggle('tile-locked', !enabled);
    });
}

function goToTile(target) {
    if (target === 'evaluate') {
        window.location.href = '/evaluate';
        return;
    }
    if (target === 'roadmap') {
        window.location.href = '/roadmap';
        return;
    }

    if (!notesProcessed) {
        alert('Please process your notes first using "Process Content" at the bottom of the sidebar.');
        return;
    }

    if (target === 'chat') {
        window.location.href = '/chat';
    } else if (target === 'tests') {
        window.location.href = '/tests';
    } else {
        comingSoon(target.charAt(0).toUpperCase() + target.slice(1));
    }
}

function comingSoon(featureName) {
    alert(`${featureName} is coming soon!`);
}

const customCursor = document.getElementById('custom-cursor');
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (!isTouchDevice) {
    document.addEventListener('mousemove', (e) => {
        customCursor.style.left = `${e.clientX}px`;
        customCursor.style.top = `${e.clientY}px`;

        const target = e.target;
        const isInteractive = target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button') || target.closest('.tile') || target.closest('.shadow-md');

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