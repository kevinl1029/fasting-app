/**
 * BenefitsCard Component
 * Extends ContextualCard to provide benefits tracking and motivation during fasting
 * Shows money saved, time reclaimed, and motivational context
 */

class BenefitsCard extends ContextualCard {
    constructor(cardId = 'benefitsCard', options = {}) {
        const defaultOptions = {
            autoHide: false, // Managed by card rotation system
            tapToExpand: true,
            rotationInterval: 15000, // 15 seconds
            ...options
        };

        super(cardId, defaultOptions);

        this.fastStartTime = null;
        this.userMealtimes = null;
        this.userPreferences = {
            avgMealCost: 10.00,
            avgMealDuration: 30, // minutes
            benefitsEnabled: true
        };
        this.currentBenefits = null;
        this.rotationIndex = 0;
        this.initialized = false;
    }

    /**
     * Initialize the benefits card
     */
    async init() {
        const success = super.init();
        if (!success) return false;

        try {
            // Load user preferences for benefits calculation
            await this.loadUserPreferences();
            this.initialized = true;
            console.log('BenefitsCard initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize BenefitsCard:', error);
            return false;
        }
    }

    /**
     * Load user preferences for benefits calculation
     */
    async loadUserPreferences() {
        try {
            // Try to load from settings API or localStorage
            const preferences = await this.fetchUserPreferences();
            if (preferences) {
                this.userPreferences = {
                    ...this.userPreferences,
                    ...preferences
                };
            }
        } catch (error) {
            console.log('Using default preferences for benefits calculation');
        }
    }

    /**
     * Fetch user preferences from API or localStorage
     */
    async fetchUserPreferences() {
        // Try to fetch from API using BenefitsDataService
        if (window.BenefitsDataService) {
            try {
                const benefitsDataService = new window.BenefitsDataService();
                const preferences = await benefitsDataService.getPreferences();
                if (preferences) {
                    return {
                        avgMealCost: preferences.avgMealCost,
                        avgMealDuration: preferences.avgMealDuration,
                        benefitsEnabled: preferences.benefitsEnabled
                    };
                }
            } catch (error) {
                console.warn('Error fetching preferences from API:', error);
            }
        }

        // Fallback: Try localStorage
        const stored = localStorage.getItem('fastingForecast_benefitsPreferences');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (error) {
                console.warn('Invalid stored preferences format');
            }
        }

        return null;
    }

    /**
     * Update card content with current benefits
     */
    async setContent(content) {
        console.log('BenefitsCard.setContent called with:', content);
        console.log('Element exists:', !!this.element);

        if (!this.element) {
            console.log('BenefitsCard.setContent early return - missing element');
            return;
        }

        try {
            let benefits;

            if (content && content.benefits) {
                // Use provided benefits
                benefits = content.benefits;
            } else {
                // Calculate current benefits
                benefits = this.calculateCurrentBenefits();
            }

            if (!benefits) {
                console.warn('No benefits data available - using fallback');
                benefits = {
                    fastDurationHours: 0,
                    mealsSkipped: 0,
                    moneySaved: 0,
                    timeReclaimed: 0,
                    timeReclaimed_formatted: '0 min'
                };
            }

            this.currentBenefits = benefits;

            // Update card elements based on rotation index
            this.updateCardDisplay(benefits);

        } catch (error) {
            console.error('Error setting content for BenefitsCard:', error);
        }
    }

    /**
     * Calculate current benefits based on fast progress
     */
    calculateCurrentBenefits() {
        if (!this.fastStartTime) {
            return null;
        }

        // Allow calculation without userMealtimes by using defaults
        if (!this.userMealtimes) {
            this.userMealtimes = {
                breakfast: '08:00',
                lunch: '12:00',
                dinner: '18:00'
            };
        }

        try {
            const now = new Date();
            const fastStart = new Date(this.fastStartTime);
            const fastDurationMs = now - fastStart;
            const fastDurationHours = fastDurationMs / (1000 * 60 * 60);

            // Calculate meals skipped
            const mealsSkipped = this.calculateMealsSkipped(fastStart, now);

            // Calculate money saved
            const moneySaved = mealsSkipped * this.userPreferences.avgMealCost;

            // Calculate time reclaimed (in minutes)
            const timeReclaimed = mealsSkipped * this.userPreferences.avgMealDuration;

            return {
                fastDurationHours,
                mealsSkipped,
                moneySaved,
                timeReclaimed,
                timeReclaimed_formatted: this.formatTimeReclaimed(timeReclaimed)
            };

        } catch (error) {
            console.error('Error calculating benefits:', error);
            return null;
        }
    }

    /**
     * Calculate number of meals skipped during the fast
     */
    calculateMealsSkipped(fastStart, currentTime) {
        if (!this.userMealtimes) return 0;

        let mealsSkipped = 0;
        const currentDate = new Date(fastStart);

        // Get array of meal times
        const mealTimes = Object.values(this.userMealtimes).filter(time => time);

        while (currentDate < currentTime) {
            // Check each meal time for this day
            mealTimes.forEach(mealTime => {
                const [hours, minutes] = mealTime.split(':').map(Number);
                const mealDateTime = new Date(currentDate);
                mealDateTime.setHours(hours, minutes, 0, 0);

                // If meal time is after fast start and before current time, count it
                if (mealDateTime >= fastStart && mealDateTime <= currentTime) {
                    mealsSkipped++;
                }
            });

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(0, 0, 0, 0);
        }

        return mealsSkipped;
    }

    /**
     * Format time reclaimed into readable format
     */
    formatTimeReclaimed(minutes) {
        if (minutes < 60) {
            return `${minutes} min`;
        }

        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (remainingMinutes === 0) {
            return `${hours}h`;
        }

        return `${hours}h ${remainingMinutes}m`;
    }

    /**
     * Update card display with rotating content
     */
    updateCardDisplay(benefits) {
        if (!this.element || !benefits) return;

        // Update card elements - use dashboard-specific IDs if in dashboard
        const isDashboard = this.cardId.includes('dashboard');
        const textId = isDashboard ? '#dashboardBenefitsCardText' : '#benefitsCardText';
        const iconId = isDashboard ? '#dashboardBenefitsCardIcon' : '#benefitsCardIcon';

        const textElement = this.element.querySelector(textId);
        const iconElement = this.element.querySelector(iconId);

        if (!textElement || !iconElement) return;

        // Rotate between different benefit displays
        const displays = this.getBenefitDisplays(benefits);
        const currentDisplay = displays[this.rotationIndex % displays.length];

        textElement.textContent = currentDisplay.text;
        iconElement.textContent = currentDisplay.icon;

        // Update extended content
        this.updateExtendedContent(benefits);
    }

    /**
     * Get different benefit display options for rotation
     */
    getBenefitDisplays(benefits) {
        const displays = [];

        // Money saved display
        if (benefits.moneySaved > 0) {
            displays.push({
                text: `You've saved $${benefits.moneySaved.toFixed(2)} so far`,
                icon: '💰',
                type: 'money'
            });
        }

        // Time reclaimed display
        if (benefits.timeReclaimed > 0) {
            displays.push({
                text: `You've reclaimed ${benefits.timeReclaimed_formatted}`,
                icon: '⏰',
                type: 'time'
            });
        }

        // Meals skipped display
        if (benefits.mealsSkipped > 0) {
            const mealText = benefits.mealsSkipped === 1 ? 'meal' : 'meals';
            displays.push({
                text: `${benefits.mealsSkipped} ${mealText} skipped successfully`,
                icon: '🎯',
                type: 'meals'
            });
        }

        // Early stage fasting content (0-2 hours)
        if (benefits.fastDurationHours >= 0.25 && benefits.fastDurationHours < 2) {
            displays.push({
                text: `${Math.round(benefits.fastDurationHours * 60)} minutes of mindful fasting`,
                icon: '🕐',
                type: 'progress'
            });
            displays.push({
                text: 'Your body is starting to tap into stored energy',
                icon: '⚡',
                type: 'education'
            });
        }

        // Short-term fasting content (2-6 hours)
        if (benefits.fastDurationHours >= 2 && benefits.fastDurationHours < 6) {
            displays.push({
                text: `${Math.round(benefits.fastDurationHours * 10) / 10}h of focused fasting`,
                icon: '⏱️',
                type: 'progress'
            });
            displays.push({
                text: 'Insulin levels are beginning to drop',
                icon: '📉',
                type: 'education'
            });
        }

        // Medium-term fasting content (6-12 hours)
        if (benefits.fastDurationHours >= 6 && benefits.fastDurationHours < 12) {
            displays.push({
                text: `${Math.round(benefits.fastDurationHours * 10) / 10}h into fat-burning mode`,
                icon: '🔥',
                type: 'progress'
            });
            displays.push({
                text: 'Your body is efficiently using stored fat',
                icon: '⚡',
                type: 'education'
            });
        }

        // Motivational displays
        if (benefits.fastDurationHours > 12) {
            displays.push({
                text: `Time for a mindful walk or creative project`,
                icon: '🚶',
                type: 'motivation'
            });
        }

        if (benefits.moneySaved > 20) {
            displays.push({
                text: 'Enough saved for a healthy grocery haul!',
                icon: '🛒',
                type: 'milestone'
            });
        }

        // Fallback display
        if (displays.length === 0) {
            displays.push({
                text: 'Building healthy habits, one fast at a time',
                icon: '💪',
                type: 'general'
            });
        }

        return displays;
    }

    /**
     * Update extended content with detailed benefits
     */
    updateExtendedContent(benefits) {
        const isDashboard = this.cardId.includes('dashboard');
        const extendedTextId = isDashboard ? '#dashboardBenefitsExtendedText' : '#benefitsExtendedText';
        const extendedTextElement = this.element.querySelector(extendedTextId);
        if (!extendedTextElement) return;

        let extendedText = '';

        if (benefits.moneySaved > 0 && benefits.timeReclaimed > 0) {
            extendedText = `💰 $${benefits.moneySaved.toFixed(2)} saved • ⏰ ${benefits.timeReclaimed_formatted} reclaimed\n\n`;
        }

        // Add motivational context based on savings
        if (benefits.moneySaved >= 50) {
            extendedText += 'That\'s enough for a nice dinner out when you break your fast! ';
        } else if (benefits.moneySaved >= 20) {
            extendedText += 'Perfect amount for some quality groceries or a coffee treat! ';
        } else if (benefits.moneySaved >= 10) {
            extendedText += 'A solid start toward your savings goals! ';
        }

        // Add time context
        if (benefits.timeReclaimed >= 120) { // 2+ hours
            extendedText += 'Use this time for a workout, meal prep, or creative project.';
        } else if (benefits.timeReclaimed >= 60) { // 1+ hour
            extendedText += 'Perfect for a walk, meditation, or catching up on reading.';
        } else if (benefits.timeReclaimed >= 30) { // 30+ minutes
            extendedText += 'Great for a quick meditation or planning session.';
        }

        extendedTextElement.textContent = extendedText || 'Keep going! Every hour builds more benefits.';
    }

    /**
     * Update fast context for benefits calculation
     */
    updateFastContext(fastStartTime, userMealtimes) {
        this.fastStartTime = fastStartTime;
        this.userMealtimes = userMealtimes;
    }

    /**
     * Update user preferences
     */
    updatePreferences(preferences) {
        this.userPreferences = {
            ...this.userPreferences,
            ...preferences
        };

        // Save to localStorage
        localStorage.setItem('fastingForecast_benefitsPreferences', JSON.stringify(this.userPreferences));
    }

    /**
     * Get next benefit display in rotation
     */
    async getNextDisplay() {
        if (!this.currentBenefits) {
            this.currentBenefits = this.calculateCurrentBenefits();
        }

        if (this.currentBenefits) {
            this.rotationIndex++;
            this.updateCardDisplay(this.currentBenefits);
        }
    }

    /**
     * Called when card expands
     */
    async onExpand() {
        if (!this.element) return;

        const extendedContent = this.element.querySelector('#benefitsCardExtended');
        if (extendedContent) {
            extendedContent.style.display = 'block';
        }
    }

    /**
     * Called when card collapses
     */
    async onCollapse() {
        if (!this.element) return;

        const extendedContent = this.element.querySelector('#benefitsCardExtended');
        if (extendedContent) {
            extendedContent.style.display = 'none';
        }
    }

    /**
     * Check if benefits card should be shown
     */
    shouldShow(isActiveFast) {
        return isActiveFast && this.userPreferences.benefitsEnabled;
    }

    /**
     * Start benefits rotation
     */
    startBenefitsRotation() {
        if (!this.isVisible) return;

        this.startRotation(async () => {
            try {
                await this.getNextDisplay();
            } catch (error) {
                console.error('Error in benefits rotation:', error);
            }
        });
    }

    /**
     * Stop benefits rotation
     */
    stopBenefitsRotation() {
        this.stopRotation();
    }

    /**
     * Override show to start benefits rotation
     */
    async show(content = null) {
        await super.show(content);

        if (this.isVisible) {
            this.startBenefitsRotation();
        }
    }

    /**
     * Override hide to stop benefits rotation
     */
    async hide() {
        this.stopBenefitsRotation();
        await super.hide();
    }

    /**
     * Update fast context with new fast start time and meal times
     * Called by CardRotationManager when fast state changes
     */
    updateFastContext(fastStartTime, userMealtimes) {
        this.fastStartTime = fastStartTime;
        this.userMealtimes = userMealtimes;

        console.log('BenefitsCard fast context updated:', {
            fastStartTime: this.fastStartTime,
            userMealtimes: this.userMealtimes
        });

        // Trigger content update with new context
        if (this.initialized && this.fastStartTime) {
            // Don't require userMealtimes - use defaults if needed
            this.setContent();
        }
    }

    /**
     * Get cumulative benefits for given timeframe
     */
    getCumulativeBenefits(timeframe = 'all') {
        // This would typically fetch from backend API
        // For now, return calculated current fast benefits
        return this.currentBenefits;
    }

    /**
     * Clean up benefits card
     */
    destroy() {
        this.stopBenefitsRotation();
        super.destroy();

        this.fastStartTime = null;
        this.userMealtimes = null;
        this.currentBenefits = null;
        this.rotationIndex = 0;
        this.initialized = false;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BenefitsCard;
} else {
    window.BenefitsCard = BenefitsCard;
}