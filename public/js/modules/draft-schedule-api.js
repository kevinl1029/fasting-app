class DraftScheduleApi {
    constructor(options = {}) {
        this.basePath = options.basePath || '/api/schedule';
    }

    async fetchDraft(sessionId) {
        if (!sessionId) {
            return null;
        }

        const url = new URL(`${this.basePath}/draft`, window.location.origin);
        url.searchParams.set('sessionId', sessionId);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn('Failed to fetch schedule draft:', response.status);
            return null;
        }

        const data = await response.json();
        if (!data || !data.draft) {
            return null;
        }

        return {
            draft: data.draft,
            metadata: data.metadata || null
        };
    }

    async confirmDraft(sessionId, payload = {}) {
        if (!sessionId) {
            throw new Error('SESSION_ID_REQUIRED');
        }

        const response = await fetch(`${this.basePath}/draft/confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                blocks: payload.blocks || null,
                weekAnchor: payload.weekAnchor || 1
            })
        });

        if (!response.ok) {
            const errorData = await this._safeJson(response);
            const errorCode = errorData?.error || 'CONFIRM_FAILED';
            const err = new Error(errorCode);
            err.code = errorCode;
            throw err;
        }

        return response.json();
    }

    async dismissDraft(sessionId) {
        if (!sessionId) {
            throw new Error('SESSION_ID_REQUIRED');
        }

        const response = await fetch(`${this.basePath}/draft/dismiss`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId })
        });

        if (!response.ok) {
            const errorData = await this._safeJson(response);
            const errorCode = errorData?.error || 'DISMISS_FAILED';
            const err = new Error(errorCode);
            err.code = errorCode;
            throw err;
        }

        return response.json();
    }

    async _safeJson(response) {
        try {
            return await response.clone().json();
        } catch (_) {
            return null;
        }
    }
}

window.FastingForecastDraftScheduleApi = DraftScheduleApi;
