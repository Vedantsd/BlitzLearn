(function () {
    const CORE_TTL_MS = 30 * 1000;
    let uid = null;
    let coreResolved = false;
    let coreResolve;
    let corePromise = new Promise(res => { coreResolve = res; });

    let labsResolved = false;
    let labsResolve;
    let labsPromise = new Promise(res => { labsResolve = res; });

    function coreKey() { return `bl_core:${uid || 'guest'}`; }
    function roadmapKey() { return `bl_roadmap:${uid || 'guest'}`; }
    function labsKey() { return `bl_labs:${uid || 'guest'}`; }

    function readCache(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.data || parsed.data.error) {
                localStorage.removeItem(key);
                return null;
            }
            return parsed;
        } catch (e) {
            return null;
        }
    }

    function writeCache(key, data) {
        try {
            if (!data || data.error) return;
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

    function resolveLabsOnce(data) {
        if (!labsResolved) {
            labsResolved = true;
            labsResolve(data);
        }
    }

    async function fetchCore() {
        const response = await authFetch('/api/bootstrap/core');
        if (!response.ok) throw new Error('Failed to load bootstrap data');
        return response.json();
    }

    async function fetchLabs() {
        const response = await authFetch(`/api/labs/${uid}`);
        if (!response.ok) throw new Error('Failed to load labs data');
        return response.json();
    }

    async function refreshCore(cachedEntry) {
        try {
            const fresh = await fetchCore();
            if (fresh && !fresh.error) {
                writeCache(coreKey(), fresh);
                resolveCoreOnce(fresh);
                const changed = !cachedEntry || JSON.stringify(fresh) !== JSON.stringify(cachedEntry.data);
                if (changed) {
                    document.dispatchEvent(new CustomEvent('bl-core-updated', { detail: fresh }));
                }
            } else {
                resolveCoreOnce(cachedEntry ? cachedEntry.data : null);
            }
        } catch (e) {
            resolveCoreOnce(cachedEntry ? cachedEntry.data : null);
        }
    }

    async function refreshLabs(cachedEntry) {
        try {
            const fresh = await fetchLabs();
            if (fresh && !fresh.error) {
                writeCache(labsKey(), fresh);
                resolveLabsOnce(fresh);
                const changed = !cachedEntry || JSON.stringify(fresh) !== JSON.stringify(cachedEntry.data);
                if (changed) {
                    document.dispatchEvent(new CustomEvent('bl-labs-updated', { detail: fresh }));
                }
            } else {
                resolveLabsOnce(cachedEntry ? cachedEntry.data : null);
            }
        } catch (e) {
            resolveLabsOnce(cachedEntry ? cachedEntry.data : null);
        }
    }

    function initForUser(user) {
        uid = user.uid;

        const cachedCore = readCache(coreKey());
        if (cachedCore) {
            resolveCoreOnce(cachedCore.data);
            if (Date.now() - cachedCore.ts > CORE_TTL_MS) refreshCore(cachedCore);
        } else {
            refreshCore(null);
        }

        const cachedLabs = readCache(labsKey());
        if (cachedLabs) {
            resolveLabsOnce(cachedLabs.data);
            if (Date.now() - cachedLabs.ts > CORE_TTL_MS) refreshLabs(cachedLabs);
        } else {
            refreshLabs(null);
        }
    }

    firebase.auth().onAuthStateChanged(user => {
        if (user) initForUser(user);
    });

    async function getRoadmap(forceRefresh) {
        const cached = readCache(roadmapKey());
        if (cached && !forceRefresh) {
            authFetch('/api/bootstrap/roadmap').then(r => r.json()).then(fresh => {
                if (fresh && !fresh.error) {
                    writeCache(roadmapKey(), fresh);
                    if (JSON.stringify(fresh) !== JSON.stringify(cached.data)) {
                        document.dispatchEvent(new CustomEvent('bl-roadmap-updated', { detail: fresh }));
                    }
                }
            }).catch(() => {});
            return cached.data;
        }
        const response = await authFetch('/api/bootstrap/roadmap');
        const fresh = await response.json();
        if (fresh && !fresh.error) {
            writeCache(roadmapKey(), fresh);
        }
        return fresh;
    }

    async function getLabs(forceRefresh) {
        const cached = readCache(labsKey());
        if (cached && !forceRefresh) {
            authFetch(`/api/labs/${uid}`).then(r => r.json()).then(fresh => {
                if (fresh && !fresh.error) {
                    writeCache(labsKey(), fresh);
                    if (JSON.stringify(fresh) !== JSON.stringify(cached.data)) {
                        document.dispatchEvent(new CustomEvent('bl-labs-updated', { detail: fresh }));
                    }
                }
            }).catch(() => {});
            return cached.data;
        }
        const response = await authFetch(`/api/labs/${uid}`);
        const fresh = await response.json();
        if (fresh && !fresh.error) {
            writeCache(labsKey(), fresh);
        }
        return fresh;
    }

    function invalidate() {
        try {
            localStorage.removeItem(coreKey());
            localStorage.removeItem(roadmapKey());
            localStorage.removeItem(labsKey());
        } catch (e) {}
        coreResolved = false;
        corePromise = new Promise(res => { coreResolve = res; });
        refreshCore(null);

        labsResolved = false;
        labsPromise = new Promise(res => { labsResolve = res; });
        refreshLabs(null);
    }

    window.BLData = {
        ready: () => corePromise,
        labsReady: () => labsPromise,
        getRoadmap,
        getLabs,
        invalidate,
    };
})();
