/**
 * Hunger Coach Module
 * Provides context-aware hunger management tips and support during fasting
 */

class HungerCoach {
    constructor() {
        this.tips = null;
        this.shownTips = new Set();
        this.currentTipRotationIndex = 0;
        this.initialized = false;
    }

    /**
     * Initialize the hunger coach system
     */
    async init() {
        if (this.initialized) return;

        try {
            await this.loadTips();
            this.initialized = true;
            console.log('Hunger Coach initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Hunger Coach:', error);
        }
    }

    /**
     * Load hunger tips from JSON file
     */
    async loadTips() {
        try {
            console.log('Loading hunger tips from /content/hunger-tips.json...');
            const response = await fetch('/content/hunger-tips.json');
            if (!response.ok) {
                throw new Error(`Failed to load tips: ${response.status} ${response.statusText}`);
            }
            this.tips = await response.json();
            console.log('Hunger tips loaded successfully:', this.tips);

            // Verify the structure
            if (!this.tips.categories) {
                throw new Error('Invalid tips structure: missing categories');
            }
        } catch (error) {
            console.error('Error loading hunger tips:', error);
            console.log('Using fallback tips...');
            // Fallback tips in case of loading failure
            this.tips = this.getFallbackTips();
            console.log('Fallback tips loaded:', this.tips);
        }
    }

    /**
     * Get a contextual tip based on current time, mealtime, and fast duration
     */
    getContextualTip(fastStartTime = null, userMealtimes = null) {
        if (!this.tips || !this.tips.categories) {
            console.warn('Tips not loaded, using fallback');
            return this.getFallbackTip();
        }

        const now = new Date();
        const tips = [];

        try {
            // Get duration-specific tips if fast is active
            if (fastStartTime) {
                const fastDurationHours = (now - new Date(fastStartTime)) / (1000 * 60 * 60);
                const durationTips = this.getDurationSpecificTips(fastDurationHours);
                tips.push(...durationTips);
            }

            // Get mealtime-specific tips if near a mealtime
            if (userMealtimes) {
                const mealtimeTips = this.getMealtimeSpecificTips(now, userMealtimes);
                tips.push(...mealtimeTips);
            }

            // Add general tips as fallback
            if (this.tips.categories.general && this.tips.categories.general.tips) {
                tips.push(...this.tips.categories.general.tips);
            }
            if (this.tips.categories.hydration && this.tips.categories.hydration.tips) {
                tips.push(...this.tips.categories.hydration.tips);
            }
            if (this.tips.categories.movement && this.tips.categories.movement.tips) {
                tips.push(...this.tips.categories.movement.tips);
            }
            if (this.tips.categories.mindfulness && this.tips.categories.mindfulness.tips) {
                tips.push(...this.tips.categories.mindfulness.tips);
            }

            // Filter out already shown tips for variety
            const availableTips = tips.filter(tip => !this.shownTips.has(tip.id));

            // If we've shown all tips, reset the shown set
            if (availableTips.length === 0) {
                this.shownTips.clear();
                return this.selectRandomTip(tips);
            }

            return this.selectRandomTip(availableTips);

        } catch (error) {
            console.error('Error in getContextualTip:', error);
            return this.getFallbackTip();
        }
    }

    /**
     * Get tips based on fast duration
     */
    getDurationSpecificTips(durationHours) {
        if (!this.tips.categories.duration_specific) return [];

        if (durationHours < 16) {
            return this.tips.categories.duration_specific.early.tips || [];
        } else if (durationHours < 24) {
            return this.tips.categories.duration_specific.transition.tips || [];
        } else {
            return this.tips.categories.duration_specific.extended.tips || [];
        }
    }

    /**
     * Get tips based on proximity to user's mealtimes
     */
    getMealtimeSpecificTips(currentTime, userMealtimes) {
        if (!this.tips.categories.mealtime_specific) return [];

        const currentHour = currentTime.getHours();
        const currentMinutes = currentHour * 60 + currentTime.getMinutes();

        // Check if we're within 1 hour of any mealtime
        const proximityMinutes = 60;

        for (const [mealType, mealTime] of Object.entries(userMealtimes)) {
            if (!mealTime) continue;

            const [hours, minutes] = mealTime.split(':').map(Number);
            const mealMinutes = hours * 60 + minutes;

            const timeDiff = Math.abs(currentMinutes - mealMinutes);
            const isNearMealtime = timeDiff <= proximityMinutes || timeDiff >= (24 * 60 - proximityMinutes);

            if (isNearMealtime && this.tips.categories.mealtime_specific[mealType]) {
                return this.tips.categories.mealtime_specific[mealType].tips || [];
            }
        }

        return [];
    }

    /**
     * Select a random tip from the available tips
     */
    selectRandomTip(tips) {
        if (!tips || tips.length === 0) {
            return this.getFallbackTip();
        }

        const selectedTip = tips[Math.floor(Math.random() * tips.length)];

        // Mark tip as shown
        if (selectedTip.id) {
            this.shownTips.add(selectedTip.id);
        }

        return selectedTip;
    }

    /**
     * Get the next tip in rotation for carousel display
     */
    getNextRotationTip(fastStartTime = null, userMealtimes = null) {
        const contextualTip = this.getContextualTip(fastStartTime, userMealtimes);
        this.currentTipRotationIndex++;
        return contextualTip;
    }

    /**
     * Check if it's an appropriate time to show hunger coach notifications
     */
    shouldShowNotification(userMealtimes, lastNotificationTime = null) {
        if (!userMealtimes) return false;

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        // Don't show notifications more than once per hour
        if (lastNotificationTime) {
            const timeSinceLastNotification = now - new Date(lastNotificationTime);
            if (timeSinceLastNotification < 60 * 60 * 1000) { // 1 hour in milliseconds
                return false;
            }
        }

        // Check if we're within 30 minutes of any mealtime
        const notificationWindow = 30;

        for (const [mealType, mealTime] of Object.entries(userMealtimes)) {
            if (!mealTime) continue;

            const [hours, minutes] = mealTime.split(':').map(Number);
            const mealMinutes = hours * 60 + minutes;

            const timeDiff = Math.abs(currentMinutes - mealMinutes);
            const isNearMealtime = timeDiff <= notificationWindow || timeDiff >= (24 * 60 - notificationWindow);

            if (isNearMealtime) {
                return { shouldShow: true, mealType, mealTime };
            }
        }

        return false;
    }

    /**
     * Get a notification message for hunger support
     */
    getNotificationMessage(mealType = null, fastStartTime = null) {
        const contextualTip = this.getContextualTip(fastStartTime,
            mealType ? { [mealType]: null } : null
        );

        const prefix = mealType ? `It's ${mealType} time — ` : '';
        return `${prefix}${contextualTip.text}`;
    }

    /**
     * Reset the shown tips set to allow tip repetition
     */
    resetShownTips() {
        this.shownTips.clear();
    }

    /**
     * Get fallback tips in case of loading failure
     */
    getFallbackTips() {
        return {
            categories: {
                general: {
                    tips: [
                        {
                            id: 'fallback_1',
                            text: 'Hunger pangs are often habit signals — most waves pass within 15–20 minutes.',
                            type: 'educational'
                        },
                        {
                            id: 'fallback_2',
                            text: 'Try a glass of water — it can help reset hunger cues.',
                            type: 'action'
                        },
                        {
                            id: 'fallback_3',
                            text: 'Go for a short walk — movement makes cravings fade faster.',
                            type: 'action'
                        }
                    ]
                }
            }
        };
    }

    /**
     * Get a single fallback tip
     */
    getFallbackTip() {
        return {
            id: 'fallback_default',
            text: 'Remember: hunger comes in waves, not constant streams. This feeling will pass.',
            type: 'reassurance'
        };
    }

    /**
     * Get statistics about available tips
     */
    getTipStats() {
        if (!this.tips) return null;

        return {
            totalTips: this.tips.metadata?.total_tips || 0,
            shownTips: this.shownTips.size,
            availableCategories: Object.keys(this.tips.categories),
            version: this.tips.metadata?.version || 'unknown'
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HungerCoach;
} else {
    window.HungerCoach = HungerCoach;
}