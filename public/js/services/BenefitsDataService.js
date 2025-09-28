/**
 * BenefitsDataService
 * API integration for benefits data communication and persistence
 * Fetch user preferences from settings endpoint
 * Calculate and cache current fast benefits
 * Retrieve historical data for trends
 */

class BenefitsDataService {
    constructor(options = {}) {
        this.options = {
            apiBaseUrl: '/api',
            cacheExpiry: 5 * 60 * 1000, // 5 minutes
            retryAttempts: 3,
            retryDelay: 1000, // 1 second
            ...options
        };

        this.cache = new Map();
        this.calculator = null;
        this.lastPreferencesSync = null;
        this.syncInProgress = false;
    }

    /**
     * Initialize the benefits data service
     */
    async init() {
        try {
            // Initialize benefits calculator
            if (window.BenefitsCalculator) {
                this.calculator = new window.BenefitsCalculator();
                await this.calculator.init();
            } else {
                console.warn('BenefitsCalculator not available');
                return false;
            }

            // Load initial preferences
            await this.loadUserPreferences();

            console.log('BenefitsDataService initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize BenefitsDataService:', error);
            return false;
        }
    }

    /**
     * Load user preferences from API or localStorage
     */
    async loadUserPreferences() {
        try {
            // Try API first
            const preferences = await this.fetchUserPreferencesFromAPI();
            if (preferences) {
                this.updateCalculatorPreferences(preferences);
                this.cachePreferences(preferences);
                return preferences;
            }

            // Fallback to localStorage
            const cachedPreferences = this.getCachedPreferences();
            if (cachedPreferences) {
                this.updateCalculatorPreferences(cachedPreferences);
                return cachedPreferences;
            }

            // Use defaults
            console.log('Using default preferences for benefits calculation');
            return this.getDefaultPreferences();

        } catch (error) {
            console.error('Error loading user preferences:', error);
            return this.getDefaultPreferences();
        }
    }

    /**
     * Get user preferences with optional cache usage
     */
    async getPreferences({ forceRefresh = false } = {}) {
        if (!forceRefresh) {
            const cached = this.getCachedPreferences();
            if (cached) {
                return cached;
            }
        }

        return await this.loadUserPreferences();
    }

    /**
     * Backwards-compatible alias for existing integrations
     */
    async getUserPreferences(options = {}) {
        return await this.getPreferences(options);
    }

    /**
     * Fetch user preferences from API
     */
    async fetchUserPreferencesFromAPI() {
        try {
            const response = await this.makeRequest('/user/settings', {
                method: 'GET'
            });

            if (response && response.success) {
                return {
                    avgMealCost: response.data.avg_meal_cost || 10.00,
                    avgMealDuration: response.data.avg_meal_duration || 30,
                    benefitsEnabled: response.data.benefits_enabled !== false,
                    benefitsOnboarded: response.data.benefits_onboarded || false,
                    customMealtimes: response.data.custom_mealtimes || null
                };
            }

            return null;
        } catch (error) {
            console.warn('Could not fetch preferences from API:', error.message);
            return null;
        }
    }

    /**
     * Update user preferences via API
     */
    async updateUserPreferences(preferences) {
        try {
            if (this.syncInProgress) {
                console.log('Sync already in progress, queuing update...');
                return await this.queuePreferencesUpdate(preferences);
            }

            this.syncInProgress = true;

            // Validate preferences
            if (this.calculator) {
                const validation = this.calculator.validatePreferences(preferences);
                if (!validation.isValid) {
                    throw new Error(`Invalid preferences: ${validation.errors.join(', ')}`);
                }
            }

            // Update via API
            const response = await this.makeRequest('/user/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    avg_meal_cost: preferences.avgMealCost,
                    avg_meal_duration: preferences.avgMealDuration,
                    benefits_enabled: preferences.benefitsEnabled,
                    benefits_onboarded: preferences.benefitsOnboarded
                })
            });

            if (response && response.success) {
                // Update local calculator and cache
                this.updateCalculatorPreferences(preferences);
                this.cachePreferences(preferences);
                this.lastPreferencesSync = new Date();

                console.log('User preferences updated successfully');
                return preferences;
            }

            throw new Error('API update failed');

        } catch (error) {
            console.error('Error updating user preferences:', error);

            // Fallback to localStorage
            this.cachePreferences(preferences);
            this.updateCalculatorPreferences(preferences);

            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Get current fast benefits
     */
    async getCurrentFastBenefits() {
        try {
            const cacheKey = 'current_fast_benefits';
            const cached = this.getFromCache(cacheKey);

            if (cached && this.isCacheValid(cached.timestamp, 30000)) { // 30 second cache
                return cached.data;
            }

            // Get active fast from API or localStorage
            const activeFast = await this.getActiveFast();
            if (!activeFast) {
                return null;
            }

            // Calculate benefits
            if (!this.calculator) {
                console.warn('BenefitsCalculator not available');
                return null;
            }

            const benefits = this.calculator.calculateCurrentFastBenefits(activeFast.start_time);

            // Cache result
            this.setCache(cacheKey, benefits);

            return benefits;

        } catch (error) {
            console.error('Error getting current fast benefits:', error);
            return null;
        }
    }

    /**
     * Get cumulative benefits for timeframe
     */
    async getCumulativeBenefits(timeframe = 'all') {
        try {
            const cacheKey = `cumulative_benefits_${timeframe}`;
            const cached = this.getFromCache(cacheKey);

            if (cached && this.isCacheValid(cached.timestamp)) {
                return cached.data;
            }

            // Get fasts from API
            const fasts = await this.getUserFasts(timeframe);
            if (!fasts) {
                return null;
            }

            // Calculate cumulative benefits
            if (!this.calculator) {
                console.warn('BenefitsCalculator not available');
                return null;
            }

            const benefits = this.calculator.calculateCumulativeBenefits(fasts, timeframe);

            // Cache result
            this.setCache(cacheKey, benefits);

            return benefits;

        } catch (error) {
            console.error('Error getting cumulative benefits:', error);
            return null;
        }
    }

    /**
     * Mark user as onboarded for benefits
     */
    async markBenefitsOnboarded() {
        try {
            const response = await this.makeRequest('/benefits/onboarding-complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response && response.success) {
                // Update local preferences
                const currentPrefs = this.getCachedPreferences() || this.getDefaultPreferences();
                currentPrefs.benefitsOnboarded = true;
                this.cachePreferences(currentPrefs);

                return true;
            }

            return false;
        } catch (error) {
            console.error('Error marking benefits onboarded:', error);
            return false;
        }
    }

    /**
     * Get active fast from API or cache
     */
    async getActiveFast() {
        try {
            // Try to get from global state first
            if (typeof getActiveFast === 'function') {
                return await getActiveFast();
            }

            // Try API
            const response = await this.makeRequest('/fasts/active', {
                method: 'GET'
            });

            if (response && response.success && response.data) {
                return response.data;
            }

            return null;
        } catch (error) {
            console.warn('Could not get active fast:', error.message);
            return null;
        }
    }

    /**
     * Get user fasts for benefits calculation
     */
    async getUserFasts(timeframe = 'all') {
        try {
            let endpoint = '/fasts';
            const params = new URLSearchParams();

            // Add timeframe filtering
            if (timeframe !== 'all') {
                params.append('timeframe', timeframe);
            }

            if (params.toString()) {
                endpoint += '?' + params.toString();
            }

            const response = await this.makeRequest(endpoint, {
                method: 'GET'
            });

            if (response && response.success && response.data) {
                return response.data;
            }

            return [];
        } catch (error) {
            console.warn('Could not get user fasts:', error.message);
            return [];
        }
    }

    /**
     * Update calculator with new preferences
     */
    updateCalculatorPreferences(preferences) {
        if (!this.calculator) return;

        this.calculator.updatePreferences({
            avgMealCost: preferences.avgMealCost,
            avgMealDuration: preferences.avgMealDuration,
            benefitsEnabled: preferences.benefitsEnabled
        });

        if (preferences.customMealtimes) {
            try {
                const mealtimes = typeof preferences.customMealtimes === 'string' ?
                    JSON.parse(preferences.customMealtimes) : preferences.customMealtimes;
                this.calculator.updateMealtimes(mealtimes);
            } catch (error) {
                console.warn('Error parsing custom mealtimes:', error);
            }
        }
    }

    /**
     * Cache preferences in localStorage
     */
    cachePreferences(preferences) {
        try {
            localStorage.setItem('fastingForecast_benefitsPreferences', JSON.stringify({
                ...preferences,
                timestamp: new Date().toISOString()
            }));
        } catch (error) {
            console.warn('Could not cache preferences:', error);
        }
    }

    /**
     * Get cached preferences from localStorage
     */
    getCachedPreferences() {
        try {
            const stored = localStorage.getItem('fastingForecast_benefitsPreferences');
            if (stored) {
                const parsed = JSON.parse(stored);
                // Check if cache is still valid (24 hours)
                if (this.isCacheValid(parsed.timestamp, 24 * 60 * 60 * 1000)) {
                    return parsed;
                }
            }
        } catch (error) {
            console.warn('Error reading cached preferences:', error);
        }
        return null;
    }

    /**
     * Get default preferences
     */
    getDefaultPreferences() {
        return {
            avgMealCost: 10.00,
            avgMealDuration: 30,
            benefitsEnabled: true,
            benefitsOnboarded: false
        };
    }

    /**
     * Make HTTP request with retry logic
     */
    async makeRequest(endpoint, options = {}) {
        // Get session ID from global function (uses PageGuard if available)
        const sessionId = window.getSessionId ? window.getSessionId() : localStorage.getItem('fastingForecast_sessionId');
        let url = `${this.options.apiBaseUrl}${endpoint}`;

        // Add session ID as query parameter if available
        if (sessionId) {
            const separator = endpoint.includes('?') ? '&' : '?';
            url += `${separator}sessionId=${sessionId}`;
        }

        let lastError;

        for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    credentials: 'same-origin'
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return await response.json();
                }

                return { success: true, data: await response.text() };

            } catch (error) {
                lastError = error;
                console.warn(`Request attempt ${attempt} failed:`, error.message);

                if (attempt < this.options.retryAttempts) {
                    await this.delay(this.options.retryDelay * attempt);
                }
            }
        }

        throw lastError;
    }

    /**
     * Cache management
     */
    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: new Date()
        });
    }

    getFromCache(key) {
        return this.cache.get(key);
    }

    isCacheValid(timestamp, maxAge = null) {
        const age = new Date() - new Date(timestamp);
        const maxAgeMs = maxAge || this.options.cacheExpiry;
        return age < maxAgeMs;
    }

    clearCache(pattern = null) {
        if (pattern) {
            for (const key of this.cache.keys()) {
                if (key.includes(pattern)) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
    }

    /**
     * Utility: delay execution
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Queue preferences update for when sync completes
     */
    async queuePreferencesUpdate(preferences) {
        return new Promise((resolve, reject) => {
            const checkSync = () => {
                if (!this.syncInProgress) {
                    this.updateUserPreferences(preferences)
                        .then(resolve)
                        .catch(reject);
                } else {
                    setTimeout(checkSync, 100);
                }
            };
            checkSync();
        });
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            initialized: !!this.calculator,
            syncInProgress: this.syncInProgress,
            lastPreferencesSync: this.lastPreferencesSync,
            cacheSize: this.cache.size,
            hasCalculator: !!this.calculator
        };
    }

    /**
     * Clean up service
     */
    destroy() {
        this.clearCache();
        this.calculator = null;
        this.lastPreferencesSync = null;
        this.syncInProgress = false;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BenefitsDataService;
} else {
    window.BenefitsDataService = BenefitsDataService;
}
