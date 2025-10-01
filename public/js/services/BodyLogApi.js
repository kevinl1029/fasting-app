class BodyLogApi {
    constructor(options = {}) {
        const {
            apiBaseUrl = '/api/body-log',
            defaultIncludeSecondary = true
        } = options;

        this.apiBaseUrl = apiBaseUrl;
        this.defaultIncludeSecondary = defaultIncludeSecondary;
    }

    getSessionId() {
        try {
            return typeof window !== 'undefined' && typeof window.getSessionId === 'function'
                ? window.getSessionId()
                : null;
        } catch (error) {
            console.warn('BodyLogApi: unable to resolve session ID', error);
            return null;
        }
    }

    buildUrl(path = '', query = {}) {
        const url = new URL(path.replace(/^\//, ''), window.location.origin + this.apiBaseUrl + '/');

        Object.entries(query).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
                return;
            }

            url.searchParams.set(key, value);
        });

        return url.toString();
    }

    async request(path = '', { method = 'GET', headers = {}, body, query } = {}) {
        const sessionId = this.getSessionId();
        const finalHeaders = { ...headers };

        if (sessionId) {
            finalHeaders['X-Session-Id'] = sessionId;
        }

        if (body && !(body instanceof FormData)) {
            finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
        }

        const url = this.buildUrl(path, query || {});

        const response = await fetch(url, {
            method,
            headers: finalHeaders,
            body: body && !(body instanceof FormData) ? JSON.stringify(body) : body
        });

        if (!response.ok) {
            let errorPayload = null;
            try {
                errorPayload = await response.json();
            } catch (parseError) {
                // Ignore parse error and fall back to status text
            }

            const error = new Error(errorPayload?.error || response.statusText || 'Body log request failed');
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
            console.warn('BodyLogApi: non-JSON response received', error);
            return null;
        }
    }

    normalizeEntry(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        return {
            id: entry.id,
            userProfileId: entry.user_profile_id,
            fastId: entry.fast_id,
            loggedAt: entry.logged_at,
            localDate: entry.local_date,
            timezoneOffsetMinutes: entry.timezone_offset_minutes,
            weight: entry.weight,
            bodyFat: entry.body_fat,
            entryTag: entry.entry_tag,
            source: entry.source,
            notes: entry.notes,
            isCanonical: !!entry.is_canonical,
            canonicalStatus: entry.canonical_status,
            canonicalReason: entry.canonical_reason,
            canonicalOverrideAt: entry.canonical_override_at,
            createdAt: entry.created_at,
            updatedAt: entry.updated_at
        };
    }

    normalizeEntries(entries) {
        if (!Array.isArray(entries)) {
            return [];
        }

        return entries
            .map((entry) => this.normalizeEntry(entry))
            .filter(Boolean);
    }

    async listEntries(options = {}) {
        const {
            startDate,
            endDate,
            limit,
            offset,
            includeSecondary = this.defaultIncludeSecondary
        } = options;

        const query = {
            startDate,
            endDate,
            includeSecondary: includeSecondary ? 'true' : 'false'
        };

        if (typeof limit === 'number') {
            query.limit = limit;
        }
        if (typeof offset === 'number') {
            query.offset = offset;
        }

        const data = await this.request('', { query });
        return this.normalizeEntries(data);
    }

    async createEntry(payload) {
        const body = this.serializePayload(payload);
        const data = await this.request('', { method: 'POST', body });
        return this.normalizeEntry(data);
    }

    async updateEntry(entryId, payload) {
        if (!entryId) {
            throw new Error('updateEntry requires an entry ID');
        }

        const body = this.serializePayload(payload);
        const data = await this.request(`/${entryId}`, { method: 'PUT', body });
        return this.normalizeEntry(data);
    }

    async deleteEntry(entryId) {
        if (!entryId) {
            throw new Error('deleteEntry requires an entry ID');
        }

        return await this.request(`/${entryId}`, { method: 'DELETE' });
    }

    async setCanonical(entryId) {
        if (!entryId) {
            throw new Error('setCanonical requires an entry ID');
        }

        const data = await this.request(`/${entryId}/canonical`, { method: 'POST' });
        return this.normalizeEntry(data);
    }

    async clearCanonical(entryId) {
        if (!entryId) {
            throw new Error('clearCanonical requires an entry ID');
        }

        const data = await this.request(`/${entryId}/canonical`, { method: 'DELETE' });
        return this.normalizeEntry(data);
    }

    serializePayload(payload = {}) {
        const serialized = { ...payload };

        if (serialized.loggedAt instanceof Date) {
            serialized.loggedAt = serialized.loggedAt.toISOString();
        }

        if (serialized.makeCanonical !== undefined) {
            serialized.makeCanonical = !!serialized.makeCanonical;
        }

        return serialized;
    }
}

window.BodyLogApi = BodyLogApi;
