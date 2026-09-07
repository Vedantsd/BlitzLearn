(function () {
    const HEARTBEAT_INTERVAL_MS = 30000;
    let lastActivityAt = Date.now();
    let uid = null;

    function markActive() {
        lastActivityAt = Date.now();
    }

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, markActive, { passive: true });
    });

    function isRecentlyActive() {
        return (Date.now() - lastActivityAt) < HEARTBEAT_INTERVAL_MS;
    }

    async function sendHeartbeat() {
        if (document.visibilityState !== 'visible') return;
        if (!isRecentlyActive()) return;
        if (!uid) return;

        try {
            await authFetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seconds: Math.round(HEARTBEAT_INTERVAL_MS / 1000) })
            });
        } catch (e) {
        }
    }

    firebase.auth().onAuthStateChanged(user => {
        uid = user ? user.uid : null;
    });

    setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
})();