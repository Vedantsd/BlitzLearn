function getAuthInstance() {
    if (typeof auth !== 'undefined' && auth) return auth;
    if (window.auth) return window.auth;
    if (typeof firebase !== 'undefined' && firebase.auth) return firebase.auth();
    return null;
}

const authInstance = getAuthInstance();
if (authInstance) {
    authInstance.onAuthStateChanged((user) => {
        if (user) {
            window.location.href = '/dashboard';
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const clientAuth = getAuthInstance();
    if (!clientAuth) {
        alert("Authentication is not ready yet. Please refresh the page.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating...';

    try {
        await clientAuth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        alert("Login Error: " + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
    }
}

async function handleSocialLogin(provider) {
    const clientAuth = getAuthInstance();
    if (!clientAuth) {
        alert("Authentication is not ready yet. Please refresh the page.");
        return;
    }
    if (provider === 'Google') {
        const googleProvider = new firebase.auth.GoogleAuthProvider();
        try {
            await clientAuth.signInWithPopup(googleProvider);
        } catch (error) {
            alert("Google Login Error: " + error.message);
        }
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
        updateThemeIcon(true);
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
    updateHeaderLogo(isDark)
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

function switchTab(tab) {

    const tabs = document.querySelectorAll('.tab');
    const title = document.getElementById('auth-title');

    tabs.forEach(t => t.classList.remove('active'));

    if (tab === 'login') {
        tabs[0].classList.add('active');
        title.textContent = "Welcome Back";
    }
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
}

function handleForgotPassword(e) {
    e.preventDefault();
    const email = prompt("Enter your email:");
    const clientAuth = getAuthInstance();
    if (email && clientAuth) {
        clientAuth.sendPasswordResetEmail(email)
            .then(() => alert("Reset link sent!"))
            .catch(err => alert(err.message));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const isDark = localStorage.getItem('theme') === 'dark';
    document.body.classList.toggle('dark', isDark);
    updateThemeIcon(isDark);
    updateHeaderLogo(isDark);
});

const customCursor = document.getElementById('custom-cursor');

const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (!isTouchDevice) {
    document.addEventListener('mousemove', (e) => {
        customCursor.style.left = `${e.clientX}px`;
        customCursor.style.top = `${e.clientY}px`;

        const target = e.target;
        const isInteractive = target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button') || target.closest('.shadow-md');

        if (isInteractive) {
            customCursor.style.transform = 'translate(-50%, -50%) scale(2.2)';
            customCursor.style.backgroundColor = 'white';
        } else {
            customCursor.style.transform = 'translate(-50%, -50%) scale(1)';
            customCursor.style.backgroundColor = '#10B981';
        }
    });
}

initTheme();
