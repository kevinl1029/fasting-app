/**
 * PageSessionGuard - Page-level session validation and protection
 * Ensures every page has a valid session before any operations
 * Provides a simple interface for pages to access session functionality
 */
class PageSessionGuard {
    constructor() {
        this.sessionManager = null;
        this.isReady = false;
        this.readyPromise = this.initialize();
    }

    /**
     * Initializes the session guard and validates page access
     */
    async initialize() {
        try {
            // Create session manager instance
            this.sessionManager = new window.FastingForecastSessionManager();

            // Validate session on page load
            const isValid = await this.validatePageAccess();

            this.isReady = true;

            // Set up error handling for future API calls
            this.setupApiErrorHandling();

            console.log('PageSessionGuard initialized successfully');
            return isValid;

        } catch (error) {
            console.error('PageSessionGuard initialization failed:', error);
            this.isReady = false;
            throw error;
        }
    }

    /**
     * Validates that the current page has proper session access
     */
    async validatePageAccess() {
        if (!this.sessionManager) {
            throw new Error('SessionManager not initialized');
        }

        try {
            // Perform comprehensive validation and repair if needed
            const isValid = await this.sessionManager.validateAndRepair();

            if (!isValid) {
                console.warn('Session was invalid and has been repaired');

                // Optional: Reload page to ensure clean state after repair
                // Uncomment if you want automatic reload after session repair
                // this.schedulePageReload('Session repaired, reloading for clean state');
            }

            return isValid;

        } catch (error) {
            console.error('Page access validation failed:', error);

            // NEVER create new sessions - preserve existing data at all costs
            // Log the error but continue with existing session
            console.warn('Session validation failed but preserving existing session to prevent data loss');
            return false;
        }
    }

    /**
     * Gets the current session ID (primary interface for pages)
     */
    getSessionId() {
        if (!this.isReady || !this.sessionManager) {
            console.warn('PageSessionGuard not ready, returning null sessionId');
            return null;
        }

        return this.sessionManager.getSessionId();
    }

    /**
     * Ensures session is valid before returning it
     */
    async getValidatedSessionId() {
        await this.readyPromise;

        if (!this.isReady) {
            throw new Error('Session validation failed');
        }

        const sessionId = this.getSessionId();
        if (!sessionId) {
            throw new Error('No session ID available');
        }

        return sessionId;
    }

    /**
     * Refreshes the session (useful for error recovery)
     */
    refreshSession() {
        if (!this.sessionManager) {
            console.error('Cannot refresh session: SessionManager not initialized');
            return null;
        }

        return this.sessionManager.refreshSession();
    }

    /**
     * Gets comprehensive session health information
     */
    getSessionHealth() {
        if (!this.sessionManager) {
            return {
                error: 'SessionManager not initialized',
                isReady: false
            };
        }

        return {
            ...this.sessionManager.getSessionHealth(),
            guardReady: this.isReady,
            guardInitialized: !!this.sessionManager
        };
    }

    /**
     * Sets up global error handling for API calls to detect session issues
     */
    setupApiErrorHandling() {
        // Listen for session-related API errors
        const originalFetch = window.fetch;

        window.fetch = async (...args) => {
            try {
                const response = await originalFetch(...args);

                // Check for session-related errors
                if (!response.ok && this.isSessionError(response)) {
                    console.warn('API session error detected, attempting session repair');
                    await this.handleSessionError(response);
                }

                return response;

            } catch (error) {
                console.error('Fetch error:', error);
                throw error;
            }
        };
    }

    /**
     * Determines if an API response indicates a session problem
     */
    isSessionError(response) {
        return response.status === 400 || response.status === 401 || response.status === 404;
    }

    /**
     * Handles session-related API errors
     */
    async handleSessionError(response) {
        try {
            const errorData = await response.clone().json();

            if (errorData.code === 'MISSING_SESSION' ||
                errorData.code === 'INVALID_SESSION_FORMAT' ||
                errorData.code === 'SESSION_NOT_FOUND') {

                console.log('Session error detected, refreshing session');
                this.refreshSession();

                // Optionally reload page for clean state
                // this.schedulePageReload('Session error resolved, reloading page');
            }
        } catch (parseError) {
            console.warn('Could not parse session error response:', parseError);
        }
    }

    /**
     * Schedules a page reload with user notification
     */
    schedulePageReload(reason) {
        console.log('Scheduling page reload:', reason);

        setTimeout(() => {
            window.location.reload();
        }, 2000);
    }

    /**
     * Waits for the guard to be ready
     */
    async waitForReady() {
        return await this.readyPromise;
    }

    /**
     * Creates an enhanced session-aware fetch function
     */
    createSessionFetch() {
        return async (url, options = {}) => {
            const sessionId = await this.getValidatedSessionId();

            // Add session to query params or headers
            const urlObj = new URL(url, window.location.origin);
            urlObj.searchParams.set('sessionId', sessionId);

            return fetch(urlObj.toString(), {
                ...options,
                headers: {
                    'X-Session-ID': sessionId,
                    ...options.headers
                }
            });
        };
    }
}

// Global instances and utilities
window.FastingForecastPageSessionGuard = PageSessionGuard;

/**
 * Global function to get session ID safely from any page script
 */
window.getSessionId = function() {
    if (window.pageGuard && window.pageGuard.isReady) {
        return window.pageGuard.getSessionId();
    }

    console.warn('PageGuard not ready, accessing localStorage directly (fallback)');
    try {
        return localStorage.getItem('fastingForecast_sessionId');
    } catch (error) {
        console.error('Failed to access session from localStorage:', error);
        return null;
    }
};

/**
 * Global function for session-aware API calls
 */
window.sessionFetch = async function(url, options = {}) {
    if (window.pageGuard && window.pageGuard.isReady) {
        const sessionFetch = window.pageGuard.createSessionFetch();
        return await sessionFetch(url, options);
    }

    // Fallback for when guard isn't ready
    const sessionId = window.getSessionId();
    if (sessionId) {
        const urlObj = new URL(url, window.location.origin);
        urlObj.searchParams.set('sessionId', sessionId);
        return fetch(urlObj.toString(), options);
    }

    throw new Error('No valid session available for API call');
};