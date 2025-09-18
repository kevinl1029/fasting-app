/**
 * MealTimeDetector Service
 * Determines if current time is within meal window
 * Integration with existing custom_mealtimes system
 * Configurable tolerance window (e.g., ±30 minutes)
 */

class MealTimeDetector {
    constructor(options = {}) {
        this.options = {
            toleranceMinutes: 30, // Default ±30 minutes window
            defaultMealtimes: {
                breakfast: '08:00',
                lunch: '12:00',
                dinner: '18:00'
            },
            ...options
        };

        this.userMealtimes = null;
        this.lastMealtimeCheck = null;
        this.currentMealContext = null;
    }

    /**
     * Initialize the meal time detector
     */
    async init() {
        try {
            await this.loadUserMealtimes();
            console.log('MealTimeDetector initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize MealTimeDetector:', error);
            return false;
        }
    }

    /**
     * Load user's custom meal times
     */
    async loadUserMealtimes() {
        try {
            // Try to load from existing getUserMealtimes function if available
            if (typeof getUserMealtimes === 'function') {
                this.userMealtimes = await getUserMealtimes();
            } else {
                // Fallback to localStorage or API
                this.userMealtimes = await this.fetchMealtimesFromStorage();
            }

            // Use defaults if no custom times found
            if (!this.userMealtimes || Object.keys(this.userMealtimes).length === 0) {
                this.userMealtimes = this.options.defaultMealtimes;
                console.log('Using default meal times');
            }

            console.log('Loaded meal times:', this.userMealtimes);

        } catch (error) {
            console.warn('Error loading user meal times, using defaults:', error);
            this.userMealtimes = this.options.defaultMealtimes;
        }
    }

    /**
     * Fetch meal times from localStorage or API
     */
    async fetchMealtimesFromStorage() {
        // Try localStorage first
        const stored = localStorage.getItem('fastingForecast_userSettings');
        if (stored) {
            try {
                const settings = JSON.parse(stored);
                if (settings.custom_mealtimes) {
                    return settings.custom_mealtimes;
                }
            } catch (error) {
                console.warn('Invalid stored settings format');
            }
        }

        // TODO: Implement API fetch when available
        return null;
    }

    /**
     * Check if current time is within a meal window
     */
    isCurrentlyMealTime(currentTime = null, toleranceMinutes = null) {
        const now = currentTime || new Date();
        const tolerance = toleranceMinutes || this.options.toleranceMinutes;

        if (!this.userMealtimes) {
            console.warn('No meal times loaded');
            return false;
        }

        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        for (const [mealType, mealTime] of Object.entries(this.userMealtimes)) {
            if (!mealTime) continue;

            try {
                const [hours, minutes] = mealTime.split(':').map(Number);
                const mealMinutes = hours * 60 + minutes;

                // Check if current time is within tolerance window
                const timeDiff = Math.abs(currentMinutes - mealMinutes);
                const isNearMealtime = timeDiff <= tolerance || timeDiff >= (24 * 60 - tolerance);

                if (isNearMealtime) {
                    this.currentMealContext = {
                        mealType,
                        mealTime,
                        timeDiff,
                        tolerance,
                        currentTime: now
                    };
                    return true;
                }
            } catch (error) {
                console.warn(`Invalid meal time format for ${mealType}: ${mealTime}`);
            }
        }

        this.currentMealContext = null;
        return false;
    }

    /**
     * Get the next upcoming meal time
     */
    getNextMealTime(currentTime = null) {
        const now = currentTime || new Date();
        if (!this.userMealtimes) return null;

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        let nextMeal = null;
        let shortestDiff = Infinity;

        for (const [mealType, mealTime] of Object.entries(this.userMealtimes)) {
            if (!mealTime) continue;

            try {
                const [hours, minutes] = mealTime.split(':').map(Number);
                const mealMinutes = hours * 60 + minutes;

                // Calculate time difference (considering next day if meal has passed)
                let timeDiff = mealMinutes - currentMinutes;
                if (timeDiff <= 0) {
                    timeDiff += 24 * 60; // Add 24 hours for next day
                }

                if (timeDiff < shortestDiff) {
                    shortestDiff = timeDiff;
                    nextMeal = {
                        mealType,
                        mealTime,
                        minutesUntil: timeDiff,
                        timeUntil: this.formatTimeUntil(timeDiff)
                    };
                }
            } catch (error) {
                console.warn(`Invalid meal time format for ${mealType}: ${mealTime}`);
            }
        }

        return nextMeal;
    }

    /**
     * Get the previous meal time that has passed
     */
    getPreviousMealTime(currentTime = null) {
        const now = currentTime || new Date();
        if (!this.userMealtimes) return null;

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        let previousMeal = null;
        let shortestDiff = Infinity;

        for (const [mealType, mealTime] of Object.entries(this.userMealtimes)) {
            if (!mealTime) continue;

            try {
                const [hours, minutes] = mealTime.split(':').map(Number);
                const mealMinutes = hours * 60 + minutes;

                // Calculate time difference (considering previous day if meal hasn't happened yet)
                let timeDiff = currentMinutes - mealMinutes;
                if (timeDiff < 0) {
                    timeDiff += 24 * 60; // Add 24 hours for previous day
                }

                if (timeDiff < shortestDiff) {
                    shortestDiff = timeDiff;
                    previousMeal = {
                        mealType,
                        mealTime,
                        minutesSince: timeDiff,
                        timeSince: this.formatTimeUntil(timeDiff)
                    };
                }
            } catch (error) {
                console.warn(`Invalid meal time format for ${mealType}: ${mealTime}`);
            }
        }

        return previousMeal;
    }

    /**
     * Get all meal times for a given day with proximity info
     */
    getDayMealTimes(targetDate = null) {
        const date = targetDate || new Date();
        if (!this.userMealtimes) return [];

        const currentMinutes = date.getHours() * 60 + date.getMinutes();
        const mealTimes = [];

        for (const [mealType, mealTime] of Object.entries(this.userMealtimes)) {
            if (!mealTime) continue;

            try {
                const [hours, minutes] = mealTime.split(':').map(Number);
                const mealMinutes = hours * 60 + minutes;
                const timeDiff = Math.abs(currentMinutes - mealMinutes);

                mealTimes.push({
                    mealType,
                    mealTime,
                    mealMinutes,
                    timeDiff,
                    isPassed: currentMinutes > mealMinutes,
                    isNear: timeDiff <= this.options.toleranceMinutes,
                    isCurrent: timeDiff <= this.options.toleranceMinutes
                });
            } catch (error) {
                console.warn(`Invalid meal time format for ${mealType}: ${mealTime}`);
            }
        }

        // Sort by meal time
        mealTimes.sort((a, b) => a.mealMinutes - b.mealMinutes);
        return mealTimes;
    }

    /**
     * Check if a specific time is within any meal window
     */
    isTimeMealTime(checkTime, toleranceMinutes = null) {
        const tolerance = toleranceMinutes || this.options.toleranceMinutes;
        const checkMinutes = checkTime.getHours() * 60 + checkTime.getMinutes();

        if (!this.userMealtimes) return false;

        for (const [mealType, mealTime] of Object.entries(this.userMealtimes)) {
            if (!mealTime) continue;

            try {
                const [hours, minutes] = mealTime.split(':').map(Number);
                const mealMinutes = hours * 60 + minutes;

                const timeDiff = Math.abs(checkMinutes - mealMinutes);
                const isNearMealtime = timeDiff <= tolerance || timeDiff >= (24 * 60 - tolerance);

                if (isNearMealtime) {
                    return {
                        mealType,
                        mealTime,
                        timeDiff,
                        tolerance
                    };
                }
            } catch (error) {
                console.warn(`Invalid meal time format for ${mealType}: ${mealTime}`);
            }
        }

        return false;
    }

    /**
     * Get meal window boundaries for a specific meal
     */
    getMealWindow(mealType) {
        if (!this.userMealtimes || !this.userMealtimes[mealType]) {
            return null;
        }

        try {
            const mealTime = this.userMealtimes[mealType];
            const [hours, minutes] = mealTime.split(':').map(Number);
            const mealMinutes = hours * 60 + minutes;
            const tolerance = this.options.toleranceMinutes;

            const startMinutes = mealMinutes - tolerance;
            const endMinutes = mealMinutes + tolerance;

            return {
                mealType,
                mealTime,
                startTime: this.minutesToTimeString(startMinutes),
                endTime: this.minutesToTimeString(endMinutes),
                startMinutes: startMinutes < 0 ? startMinutes + 24 * 60 : startMinutes,
                endMinutes: endMinutes >= 24 * 60 ? endMinutes - 24 * 60 : endMinutes,
                tolerance
            };
        } catch (error) {
            console.warn(`Error calculating meal window for ${mealType}:`, error);
            return null;
        }
    }

    /**
     * Update user meal times
     */
    updateMealtimes(newMealtimes) {
        this.userMealtimes = { ...newMealtimes };
        this.currentMealContext = null;
        console.log('Updated meal times:', this.userMealtimes);
    }

    /**
     * Update tolerance window
     */
    updateTolerance(toleranceMinutes) {
        this.options.toleranceMinutes = toleranceMinutes;
        console.log('Updated tolerance to:', toleranceMinutes, 'minutes');
    }

    /**
     * Get current meal context (if within meal window)
     */
    getCurrentMealContext() {
        return this.currentMealContext;
    }

    /**
     * Format minutes into readable time format
     */
    formatTimeUntil(minutes) {
        if (minutes < 60) {
            return `${minutes}m`;
        }

        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (remainingMinutes === 0) {
            return `${hours}h`;
        }

        return `${hours}h ${remainingMinutes}m`;
    }

    /**
     * Convert minutes to time string (HH:MM)
     */
    minutesToTimeString(minutes) {
        // Handle negative minutes (previous day)
        if (minutes < 0) {
            minutes += 24 * 60;
        }

        // Handle minutes over 24 hours (next day)
        if (minutes >= 24 * 60) {
            minutes -= 24 * 60;
        }

        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    /**
     * Get summary of meal time detection status
     */
    getMealTimeStatus(currentTime = null) {
        const now = currentTime || new Date();
        const isCurrentlyMeal = this.isCurrentlyMealTime(now);
        const nextMeal = this.getNextMealTime(now);
        const previousMeal = this.getPreviousMealTime(now);

        return {
            isCurrentlyMealTime: isCurrentlyMeal,
            currentMealContext: this.currentMealContext,
            nextMeal,
            previousMeal,
            userMealtimes: this.userMealtimes,
            tolerance: this.options.toleranceMinutes,
            timestamp: now
        };
    }

    /**
     * Clean up detector
     */
    destroy() {
        this.userMealtimes = null;
        this.currentMealContext = null;
        this.lastMealtimeCheck = null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MealTimeDetector;
} else {
    window.MealTimeDetector = MealTimeDetector;
}