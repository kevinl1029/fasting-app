class FastEffectivenessApi {
    constructor(options = {}) {
        const {
            baseUrl = '/api/fasts'
        } = options;

        this.baseUrl = baseUrl;
    }

    getSessionId() {
        try {
            return typeof window !== 'undefined' && typeof window.getSessionId === 'function'
                ? window.getSessionId()
                : null;
        } catch (error) {
            console.warn('FastEffectivenessApi: unable to resolve session ID', error);
            return null;
        }
    }

    buildUrl(path = '') {
        const sanitizedPath = String(path || '').replace(/^\/+/, '');
        return `${this.baseUrl}/${sanitizedPath}`;
    }

    async request(path, { method = 'GET', headers = {}, query, body } = {}) {
        const sessionId = this.getSessionId();
        const finalHeaders = { ...headers };

        if (sessionId) {
            finalHeaders['X-Session-Id'] = sessionId;
        }

        let url = this.buildUrl(path);

        if (query && typeof query === 'object') {
            const urlObj = new URL(url, window.location.origin);
            Object.entries(query).forEach(([key, value]) => {
                if (value === undefined || value === null || value === '') {
                    return;
                }
                urlObj.searchParams.set(key, value);
            });
            url = urlObj.toString();
        }

        const response = await fetch(url, {
            method,
            headers: finalHeaders,
            body
        });

        if (!response.ok) {
            let errorPayload = null;
            try {
                errorPayload = await response.json();
            } catch (error) {
                // Ignore parse failure and fall back to status text
            }

            const error = new Error(errorPayload?.error || response.statusText || 'Fast effectiveness request failed');
            error.status = response.status;
            error.payload = errorPayload;
            throw error;
        }

        if (response.status === 204) {
            return null;
        }

        try {
            return await response.json();
        } catch (error) {
            console.warn('FastEffectivenessApi: non-JSON response received', error);
            return null;
        }
    }

    async getEffectiveness(fastId) {
        if (!fastId && fastId !== 0) {
            throw new Error('getEffectiveness requires a fastId');
        }

        return this.request(`${fastId}/effectiveness`);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FastEffectivenessApi;
} else {
    window.FastEffectivenessApi = FastEffectivenessApi;
}
