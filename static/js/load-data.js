(function () {
    const CORE_TTL_MS = 30 * 1000;
    let uid = null;
    let coreResolved = false;
    let coreResolve;
    let corePromise = new Promise(res => { coreResolve = res; });

    function coreKey() { return `bl_core:${uid || 'guest'}`; }
    function roadmapKey() { return `bl_roadmap:${uid || 'guest'}`; }

    function readCache(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writeCache(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
        } catch (e) {
        }
    }

    function resolveCoreOnce(data) {
        if (!coreResolved) {
            coreResolved = true;
            coreResolve(data);
        }
    }

    async function fetchCore() {
        const response = await authFetch('/api/bootstrap/core');
        if (!response.ok) throw new Error('Failed to load bootstrap data');
        return response.json();
    }

    async function refreshCore(cachedEntry) {
        try {
            const fresh = await fetchCore();
            writeCache(coreKey(), fresh);
            resolveCoreOnce(fresh);
            const changed = !cachedEntry || JSON.stringify(fresh) !== JSON.stringify(cachedEntry.data);
            if (changed) {
                document.dispatchEvent(new CustomEvent('bl-core-updated', { detail: fresh }));
            }
        } catch (e) {
            resolveCoreOnce(cachedEntry ? cachedEntry.data : null);
        }
    }

    function initForUser(user) {
        uid = user.uid;
        const cached = readCache(coreKey());

        if (cached) {
            resolveCoreOnce(cached.data);
            if (Date.now() - cached.ts > CORE_TTL_MS) refreshCore(cached);
        } else {
            refreshCore(null);
        }
    }

    firebase.auth().onAuthStateChanged(user => {
        if (user) initForUser(user);
    });

    async function getRoadmap(forceRefresh) {
        const cached = readCache(roadmapKey());
        if (cached && !forceRefresh) {
            authFetch('/api/bootstrap/roadmap').then(r => r.json()).then(fresh => {
                writeCache(roadmapKey(), fresh);
                if (JSON.stringify(fresh) !== JSON.stringify(cached.data)) {
                    document.dispatchEvent(new CustomEvent('bl-roadmap-updated', { detail: fresh }));
                }
            }).catch(() => {});
            return cached.data;
        }
        const response = await authFetch('/api/bootstrap/roadmap');
        const fresh = await response.json();
        writeCache(roadmapKey(), fresh);
        return fresh;
    }

    function invalidate() {
        try {
            localStorage.removeItem(coreKey());
            localStorage.removeItem(roadmapKey());
        } catch (e) {}
        coreResolved = false;
        corePromise = new Promise(res => { coreResolve = res; });
        refreshCore(null);
    }

    window.BLData = {
        ready: () => corePromise,
        getRoadmap,
        invalidate,
    };
})();