/**
 * Enhanced SessionManager - Bulletproof session management for Fasting Forecast
 * Handles session creation, validation, health monitoring, and cross-tab synchronization
 * Prevents orphaned fasts by ensuring consistent session IDs across all pages
 */
class SessionManager {
    constructor() {
        this.SESSION_KEY = 'fastingForecast_sessionId';
        this.isInitializing = false;
        this.lastHealthCheck = 0;

        // Initialize session immediately
        this.ensureSession();

        // Enable cross-tab sync only (removed aggressive health monitoring)
        this.syncAcrossTabs();
    }

    /**
     * Ensures a valid session exists, creating one if needed
     * This is the primary method that prevents orphaned data
     */
    ensureSession() {
        if (this.isInitializing) {
            return this.getSessionId();
        }

        this.isInitializing = true;

        try {
            let sessionId = localStorage.getItem(this.SESSION_KEY);

            if (!sessionId || !this.validateSessionFormat(sessionId)) {
                console.warn('Invalid or missing sessionId detected, creating new session');
                sessionId = this.createNewSession();
            } else {
                console.log('Valid sessionId found:', sessionId);
            }

            return sessionId;
        } catch (error) {
            console.error('Error accessing localStorage, creating temporary session:', error);
            // Fallback for localStorage access issues
            return this.generateSessionId();
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * Creates a new session and stores it
     */
    createNewSession() {
        const sessionId = this.generateSessionId();

        try {
            localStorage.setItem(this.SESSION_KEY, sessionId);
            console.log('Created new sessionId:', sessionId);

            // Trigger session change event for other components
            this.dispatchSessionChangeEvent(sessionId, true);

        } catch (error) {
            console.error('Failed to store sessionId in localStorage:', error);
        }

        return sessionId;
    }

    /**
     * Generates a new session ID using the established format
     */
    generateSessionId() {
        return 'fs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Gets the current session ID
     */
    getSessionId() {
        try {
            return localStorage.getItem(this.SESSION_KEY);
        } catch (error) {
            console.error('Failed to access sessionId from localStorage:', error);
            return null;
        }
    }

    /**
     * Validates session ID format to prevent corruption
     */
    validateSessionFormat(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') {
            return false;
        }

        // Must start with 'fs_', be reasonable length, and match expected format
        return sessionId.startsWith('fs_') &&
               sessionId.length > 10 &&
               sessionId.length < 50 &&
               /^fs_\d+_[a-z0-9]+$/.test(sessionId);
    }

    /**
     * Validates session with backend to ensure user profile exists
     */
    async validateWithBackend(sessionId) {
        try {
            const response = await fetch(`/api/session/validate?sessionId=${encodeURIComponent(sessionId)}`);

            if (!response.ok) {
                console.warn('Backend session validation failed:', response.status);
                return false;
            }

            const data = await response.json();
            return data.valid === true;

        } catch (error) {
            console.warn('Backend validation request failed (offline?):', error.message);
            // Assume valid for offline scenarios - frontend validation passed
            return true;
        }
    }

    /**
     * Conservative session validation - only checks format, never regenerates for backend issues
     */
    async validateAndRepair() {
        const sessionId = this.getSessionId();

        // Only validate format - don't regenerate sessions based on backend issues
        if (!sessionId || !this.validateSessionFormat(sessionId)) {
            console.warn('Session format validation failed, session appears corrupted');
            this.createNewSession();
            return false;
        }

        // Session format is valid - consider it good regardless of backend state
        return true;
    }


    /**
     * Enables cross-tab synchronization to maintain consistency
     */
    syncAcrossTabs() {
        window.addEventListener('storage', (e) => {
            if (e.key === this.SESSION_KEY) {
                if (e.newValue && this.validateSessionFormat(e.newValue)) {
                    console.log('Session synchronized across tabs:', e.newValue);
                    this.dispatchSessionChangeEvent(e.newValue, false);
                } else if (!e.newValue) {
                    console.warn('Session removed in another tab - keeping current session if valid');
                    // Don't create new session - preserve current session if it exists and is valid
                    const currentSession = this.getSessionId();
                    if (!currentSession || !this.validateSessionFormat(currentSession)) {
                        console.log('No valid current session, creating new one');
                        this.createNewSession();
                    }
                }
            }
        });
    }

    /**
     * Dispatches session change events for other components to listen
     */
    dispatchSessionChangeEvent(sessionId, isNew) {
        try {
            window.dispatchEvent(new CustomEvent('sessionChange', {
                detail: {
                    sessionId,
                    isNew,
                    timestamp: Date.now()
                }
            }));
        } catch (error) {
            console.error('Failed to dispatch session change event:', error);
        }
    }

    /**
     * Manual session refresh (useful for testing or error recovery)
     */
    refreshSession() {
        console.log('Manually refreshing session...');
        this.createNewSession();
        return this.getSessionId();
    }

    /**
     * Get session health information for debugging
     */
    getSessionHealth() {
        const sessionId = this.getSessionId();
        return {
            hasSession: !!sessionId,
            sessionId: sessionId,
            formatValid: this.validateSessionFormat(sessionId),
            lastHealthCheck: new Date(this.lastHealthCheck).toISOString(),
            storageAccessible: this.testStorageAccess()
        };
    }

    /**
     * Test if localStorage is accessible
     */
    testStorageAccess() {
        try {
            const testKey = 'test_' + Date.now();
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (error) {
            return false;
        }
    }
}

// Global session manager instance
window.FastingForecastSessionManager = SessionManager;