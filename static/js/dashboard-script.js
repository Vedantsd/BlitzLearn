firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        window.location.href = '/login';
    } else {
        console.log("Active Session:", user.email);
        
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


function updateFileCount() {
    const fileInput = document.getElementById('pdf-upload');
    const fileCount = document.getElementById('file-count');
    const count = fileInput.files.length;
    fileCount.textContent = count > 0 ? `${count} file${count > 1 ? 's' : ''} selected` : '';
}

async function processContent() {
    const fileInput = document.getElementById('pdf-upload');
    const ytUrl = document.getElementById('yt-url').value;
    const outcomes = document.getElementById('course-outcomes').value;
    const bloomLevel = document.getElementById('bloom-level').value;
    const processBtn = document.querySelector('.sidebar button');
    
    if (fileInput.files.length === 0) {
        alert("Please select at least one PDF file.");
        return;
    }

    processBtn.textContent = "Processing...";
    processBtn.disabled = true;

    const formData = new FormData();
    for (const file of fileInput.files) {
        formData.append('pdf_files', file);
    }
    formData.append('yt_url', ytUrl);
    formData.append('course_outcomes', outcomes);
    formData.append('bloom_level', bloomLevel);

    try {
        const response = await fetch('/process', { method: 'POST', body: formData });
        const data = await response.json();
        alert(data.message || data.error);
    } catch (error) {
        alert("Failed to process content.");
    } finally {
        processBtn.textContent = "Process Content";
        processBtn.disabled = false;
    }
}

async function askQuestion() {
    const input = document.getElementById('user-input');
    const chatBox = document.getElementById('chat-box');
    const placeholder = document.getElementById('placeholder');
    const query = input.value.trim();

    if (!query) return;
    if (placeholder) placeholder.remove();

    chatBox.innerHTML += `<div class="message user-message">${query}</div>`;
    input.value = "";
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: query })
        });
        const data = await response.json();
        chatBox.innerHTML += `<div class="message ai-message">${data.answer}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (error) {
        chatBox.innerHTML += `<div class="message ai-message">Error connecting to server.</div>`;
    }
}

document.getElementById('user-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

updateThemeIcon();