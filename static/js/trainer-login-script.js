function handleTrainerLogin() {
    const username = document.getElementById('trainer-username').value.trim();
    const password = document.getElementById('trainer-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errorEl.textContent = '';

    if (!username || !password) {
        errorEl.textContent = 'Please enter both username and password.';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Logging in...';

    fetch('/trainer/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
        .then(response => response.json().then(data => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
            if (!ok) throw new Error(data.error || 'Login failed.');
            window.location.href = '/trainer/dashboard';
        })
        .catch(error => {
            errorEl.textContent = error.message || 'Login failed. Please try again.';
            btn.disabled = false;
            btn.textContent = 'Login';
        });
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('trainer-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleTrainerLogin();
    });
});