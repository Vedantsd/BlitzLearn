if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
    updateThemeIcon();
}

function toggleTheme() {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon();
}

function updateThemeIcon() {
    const icon = document.getElementById('theme-icon');
    const isDark = document.body.classList.contains('dark');
    
    if (isDark) {
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    } else {
        icon.innerHTML = '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>';
    }
}

function updateFileCount() {
    const fileInput = document.getElementById('pdf-upload');
    const fileCount = document.getElementById('file-count');
    const count = fileInput.files.length;
    
    if (count > 0) {
        fileCount.textContent = `${count} file${count > 1 ? 's' : ''} selected`;
    } else {
        fileCount.textContent = '';
    }
}

async function processContent() {
    const fileInput = document.getElementById('pdf-upload');
    const ytUrl = document.getElementById('yt-url').value;
    const outcomes = document.getElementById('course-outcomes').value;
    const bloomLevel = document.getElementById('bloom-level').value;
    const processBtn = event.target;
    
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
        const response = await fetch('/process', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        alert(data.message || data.error);
    } catch (error) {
        console.error("Error:", error);
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
        console.error("Error:", error);
        chatBox.innerHTML += `<div class="message ai-message">Error: Could not connect to server.</div>`;
    }
}

document.getElementById('user-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

updateThemeIcon();