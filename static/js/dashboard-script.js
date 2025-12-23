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
    const MAX_FILE_SIZE = 20 * 1024 * 1024; 
    const fileInput = document.getElementById('pdf-upload');
    const fileCount = document.getElementById('file-count');

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
    fileCount.textContent =
        count > 0 ? `${count} file${count > 1 ? 's' : ''} selected` : '';
}

async function processContent() {
    const MAX_FILE_SIZE = 20 * 1024 * 1024;

    const fileInput = document.getElementById('pdf-upload');
    const ytUrl = document.getElementById('yt-url').value;
    const outcomes = document.getElementById('course-outcomes').value;
    const bloomLevel = document.getElementById('bloom-level').value;
    const weightage = document.getElementById('topic-weightage').value;
    const language = document.getElementById('language').value;
    const processBtn = document.getElementById('process-content');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    if (fileInput.files.length === 0) {
        showProgressMessage('Please select at least one PDF file.', 'error');
        return;
    }

    for (const file of fileInput.files) {
        if (file.size > MAX_FILE_SIZE) {
            showProgressMessage(
                `File "${file.name}" exceeds 20MB limit.`,
                'error'
            );
            return;
        }
    }

    processBtn.textContent = "Processing...";
    processBtn.disabled = true;
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = 'Uploading files...';

    const formData = new FormData();
    for (const file of fileInput.files) {
        formData.append('pdf_files', file);
    }
    formData.append('yt_url', ytUrl);
    formData.append('course_outcomes', outcomes);
    formData.append('bloom_level', bloomLevel);
    formData.append('weightage', weightage);
    formData.append('language', language)

    progressBar.style.width = '30%';
    progressText.textContent = 'Extracting text from PDFs...';

    try {
        setTimeout(() => {
            progressBar.style.width = '60%';
            progressText.textContent = 'Creating embeddings...';
        }, 500);

        const response = await fetch('/process', { method: 'POST', body: formData });
        const data = await response.json();
        
        progressBar.style.width = '100%';
        progressText.textContent = data.message || 'Processing complete!';
        progressText.style.color = '#10b981';
        
        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressText.style.color = '';
        }, 2000);
        
    } catch (error) {
        progressBar.style.width = '100%';
        progressBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        progressText.textContent = 'Failed to process content. Please try again.';
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

function showProgressMessage(message, type) {
    const progressContainer = document.getElementById('progress-container');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = message;
    progressText.style.color = type === 'error' ? '#ef4444' : '#10b981';
    
    setTimeout(() => {
        progressContainer.style.display = 'none';
        progressText.style.color = '';
    }, 3000);
}

function parseMarkdown(text) {
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    text = text.replace(/`(.+?)`/g, '<code>$1</code>');
    
    text = text.replace(/\n/g, '<br>');
    
    text = text.replace(/^(\d+)\.\s(.+)$/gm, '<div class="list-item">$1. $2</div>');
    
    text = text.replace(/^[-*]\s(.+)$/gm, '<div class="list-item">• $1</div>');
    
    text = text.replace(/^##\s(.+)$/gm, '<h4>$1</h4>');
    
    return text;
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
        const formattedAnswer = parseMarkdown(data.answer);
        chatBox.innerHTML += `<div class="message ai-message">${formattedAnswer}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (error) {
        chatBox.innerHTML += `<div class="message ai-message">Error connecting to server.</div>`;
    }
}

document.getElementById('user-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

document.addEventListener('DOMContentLoaded', () => {
    const isDark = localStorage.getItem('theme') === 'dark';
    document.body.classList.toggle('dark', isDark);
    updateThemeIcon(isDark);
    updateHeaderLogo(isDark);
});

document.addEventListener('DOMContentLoaded', function() {
    const headerLeft = document.querySelector('.header-left');
    const hamburger = document.createElement('button');
    hamburger.className = 'hamburger-menu';
    hamburger.innerHTML = '<span></span><span></span><span></span>';
    headerLeft.insertBefore(hamburger, headerLeft.firstChild);

    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    const profileCircle = document.getElementById('user-profile');
    const themeToggle = document.getElementById('theme-toggle');
    const logoutBtn = document.querySelector('.icon-button[onclick="logout()"]');
    
    const dropdown = document.createElement('div');
    dropdown.className = 'profile-dropdown';
    dropdown.appendChild(themeToggle.cloneNode(true));
    dropdown.appendChild(logoutBtn.cloneNode(true));
    document.querySelector('.header-actions').appendChild(dropdown);

    hamburger.addEventListener('click', function() {
        hamburger.classList.toggle('active');
        document.querySelector('.sidebar').classList.toggle('active');
        overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', function() {
        hamburger.classList.remove('active');
        document.querySelector('.sidebar').classList.remove('active');
        overlay.classList.remove('active');
    });

    profileCircle.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });

    document.addEventListener('click', function(e) {
        if (!profileCircle.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
});

function toggleDropdown() {
    const content = document.getElementById('dropdown-content');
    const arrow = document.getElementById('dropdown-arrow');
    
    content.classList.toggle('collapsed');
    arrow.classList.toggle('collapsed');
}

function toggleDropdown2() {
    const content = document.getElementById('dropdown-content-2');
    const arrow = document.getElementById('dropdown-arrow-2');
    
    content.classList.toggle('collapsed');
    arrow.classList.toggle('collapsed');
}

document.addEventListener('DOMContentLoaded', function() {
    const radioButtons = document.querySelectorAll('input[name="study-mode"]');
    const vibeOptions = document.getElementById('vibe-options');
    
    radioButtons.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'vibe' && this.checked) {
                vibeOptions.style.display = 'block';
            } else {
                vibeOptions.style.display = 'none';
            }
        });
    });
});

function setStudyMode() {
    const selectedMode = document.querySelector('input[name="study-mode"]:checked').value;
    let modeMessage = 'Study mode set to: ' + selectedMode;
    
    if (selectedMode === 'vibe') {
        const vibeType = document.getElementById('vibe-select').value;
        modeMessage += ' (' + document.getElementById('vibe-select').options[document.getElementById('vibe-select').selectedIndex].text + ')';
    }
    
    console.log(modeMessage);
    alert(modeMessage);
}

function toggleDropdown3() {
    const content = document.getElementById('dropdown-content-3');
    const arrow = document.getElementById('dropdown-arrow-3');
    
    content.classList.toggle('collapsed');
    arrow.classList.toggle('collapsed');
}

async function prioritizeTopics() {
    const prioritizeBtn = document.getElementById('prioritize-btn');
    const topicsLoading = document.getElementById('topics-loading');
    const topicsList = document.getElementById('topics-list');
    
    prioritizeBtn.style.display = 'none';
    topicsLoading.style.display = 'block';
    
    try {
        const response = await fetch('/prioritize_topics', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
            prioritizeBtn.style.display = 'flex';
            topicsLoading.style.display = 'none';
            return;
        }
        
        topicsLoading.style.display = 'none';
        
        displayTopics(data.topics);
        
    } catch (error) {
        console.error('Error prioritizing topics:', error);
        alert('Failed to prioritize topics. Please try again.');
        prioritizeBtn.style.display = 'flex';
        topicsLoading.style.display = 'none';
    }
}

function displayTopics(topics) {
    const topicsList = document.getElementById('topics-list');
    topicsList.innerHTML = '';
    
    topics.forEach((topic, index) => {
        const topicItem = document.createElement('div');
        topicItem.className = 'topic-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `topic-${index}`;
        checkbox.name = 'topics';
        checkbox.value = topic;
        checkbox.checked = false; 
        
        const label = document.createElement('label');
        label.htmlFor = `topic-${index}`;
        label.className = 'topic-label';
        
        const priorityBadge = document.createElement('span');
        priorityBadge.className = 'priority-badge';
        priorityBadge.textContent = `#${index + 1}`;
        
        const topicText = document.createElement('span');
        topicText.textContent = topic;
        
        label.appendChild(checkbox);
        label.appendChild(priorityBadge);
        label.appendChild(topicText);
        
        topicItem.appendChild(label);
        topicsList.appendChild(topicItem);
    });
}

function getSelectedTopics() {
    const checkboxes = document.querySelectorAll('input[name="topics"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

updateThemeIcon();  