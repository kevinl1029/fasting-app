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
            // rotationInterval removed - managed by CardRotationManager
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
     * Calculate current benefits based on fast progress using enhanced calculator
     */
    calculateCurrentBenefits() {
        if (!this.fastStartTime) {
            return null;
        }

        try {
            // Use BenefitsCalculator if available for enhanced benefits
            if (window.BenefitsCalculator) {
                const calculator = new window.BenefitsCalculator();

                // Initialize with user preferences
                calculator.updatePreferences(this.userPreferences);
                if (this.userMealtimes) {
                    calculator.updateMealtimes(this.userMealtimes);
                }

                // Get full enhanced benefits
                const enhancedBenefits = calculator.calculateCurrentFastBenefits(this.fastStartTime);

                if (enhancedBenefits) {
                    console.log('BenefitsCard: Using enhanced benefits with physiological/lifestyle data');
                    return enhancedBenefits;
                }
            }

            // Fallback to simple calculation if enhanced calculator not available
            console.log('BenefitsCard: Falling back to simple benefits calculation');
            return this.calculateSimpleBenefits();

        } catch (error) {
            console.error('Error calculating benefits:', error);
            return this.calculateSimpleBenefits();
        }
    }

    /**
     * Fallback simple benefits calculation
     */
    calculateSimpleBenefits() {
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
            console.error('Error calculating simple benefits:', error);
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

        // Update extended content using the current display's extended info
        this.updateExtendedContent(benefits, currentDisplay);
    }

    /**
     * Get different benefit display options for rotation
     */
    getBenefitDisplays(benefits) {
        const displays = [];

        // Traditional benefits (money/time/meals)
        if (benefits.moneySaved > 0) {
            displays.push({
                text: `You've saved $${benefits.moneySaved.toFixed(2)} so far`,
                icon: '💰',
                type: 'money',
                extended: `That's ${this.getMoneyEquivalence(benefits.moneySaved)}`
            });
        }

        if (benefits.timeReclaimed > 0) {
            displays.push({
                text: `You've reclaimed ${benefits.timeReclaimed_formatted}`,
                icon: '⏰',
                type: 'time',
                extended: `Perfect for ${this.getTimeActivity(benefits.timeReclaimed)}`
            });
        }

        if (benefits.mealsSkipped > 0) {
            const mealText = benefits.mealsSkipped === 1 ? 'meal' : 'meals';
            displays.push({
                text: `${benefits.mealsSkipped} ${mealText} skipped successfully`,
                icon: '🎯',
                type: 'meals',
                extended: `Building discipline and metabolic flexibility with every meal skipped`
            });
        }

        // Physiological benefits from expanded calculator
        if (benefits.physiological) {
            this.addPhysiologicalDisplays(displays, benefits);
        }

        // Lifestyle benefits from expanded calculator
        if (benefits.lifestyle) {
            this.addLifestyleDisplays(displays, benefits);
        }

        // Duration-specific milestone content
        this.addMilestoneDisplays(displays, benefits);

        // Fallback display
        if (displays.length === 0) {
            displays.push({
                text: 'Building healthy habits, one fast at a time',
                icon: '💪',
                type: 'general',
                extended: 'Every fast strengthens your metabolic flexibility and mental resilience'
            });
        }

        return displays;
    }

    /**
     * Add physiological benefit displays
     */
    addPhysiologicalDisplays(displays, benefits) {
        const phys = benefits.physiological;

        // Hormonal changes
        phys.hormonalChanges.forEach(change => {
            let icon;
            switch (change.type) {
                case 'adrenaline':
                    icon = '⚡';
                    break;
                case 'insulin_sensitivity':
                    icon = '📈';
                    break;
                case 'growth_hormone':
                    icon = '💪';
                    break;
                default:
                    icon = '🔬';
            }
            displays.push({
                text: change.description,
                icon: icon,
                type: 'hormonal',
                extended: this.getHormonalExtended(change.type)
            });
        });

        // Cellular health
        phys.cellularHealth.forEach(cellular => {
            let icon;
            switch (cellular.type) {
                case 'autophagy':
                    icon = '🧹';
                    break;
                case 'dna_repair':
                    icon = '🔧';
                    break;
                case 'stem_cell_regeneration':
                    icon = '🌱';
                    break;
                default:
                    icon = '🔬';
            }
            displays.push({
                text: cellular.description,
                icon: icon,
                type: 'cellular',
                extended: this.getCellularExtended(cellular.type)
            });
        });

        // Brain benefits
        phys.brainBenefits.forEach(brain => {
            let icon;
            switch (brain.type) {
                case 'mental_clarity':
                    icon = '🧠';
                    break;
                case 'bdnf_production':
                    icon = '🧬';
                    break;
                default:
                    icon = '🧠';
            }
            displays.push({
                text: brain.description,
                icon: icon,
                type: 'brain',
                extended: this.getBrainExtended(brain.type)
            });
        });

        // Metabolic benefits
        phys.metabolicBenefits.forEach(metabolic => {
            let icon;
            switch (metabolic.type) {
                case 'fat_burning':
                    icon = '🔥';
                    break;
                case 'inflammation_reduction':
                    icon = '🌿';
                    break;
                default:
                    icon = '⚡';
            }
            displays.push({
                text: metabolic.description,
                icon: icon,
                type: 'metabolic',
                extended: this.getMetabolicExtended(metabolic.type)
            });
        });
    }

    /**
     * Add lifestyle benefit displays
     */
    addLifestyleDisplays(displays, benefits) {
        const lifestyle = benefits.lifestyle;

        // Time reclamation beyond eating
        lifestyle.timeReclamation.forEach(timeRec => {
            let icon;
            switch (timeRec.type) {
                case 'meal_prep':
                    icon = '🕐';
                    break;
                case 'mental_bandwidth':
                    icon = '🧩';
                    break;
                case 'schedule_simplicity':
                    icon = '📅';
                    break;
                default:
                    icon = '⏰';
            }
            displays.push({
                text: timeRec.description,
                icon: icon,
                type: 'lifestyle',
                extended: this.getLifestyleExtended(timeRec.type)
            });
        });

        // Mental benefits
        lifestyle.mentalBenefits.forEach(mental => {
            let icon;
            switch (mental.type) {
                case 'stress_resilience':
                    icon = '🛡️';
                    break;
                case 'food_appreciation':
                    icon = '🙏';
                    break;
                default:
                    icon = '💭';
            }
            displays.push({
                text: mental.description,
                icon: icon,
                type: 'mental',
                extended: this.getMentalExtended(mental.type)
            });
        });

        // Environmental impact
        lifestyle.environmentalImpact.forEach(env => {
            displays.push({
                text: env.description,
                icon: '🌍',
                type: 'environmental',
                extended: `Each skipped meal reduces your carbon footprint by approximately ${env.reduction.toFixed(1)} kg CO2`
            });
        });
    }

    /**
     * Add milestone-based displays
     */
    addMilestoneDisplays(displays, benefits) {
        const hours = benefits.fastDurationHours;

        if (hours >= 4 && hours < 8) {
            displays.push({
                text: 'You\'ve officially entered the fasting zone',
                icon: '🚀',
                type: 'milestone',
                extended: 'Your body is transitioning from fed to fasted state. Fat oxidation is beginning.'
            });
        }

        if (hours >= 8 && hours < 12) {
            displays.push({
                text: 'Glycogen stores are depleting, fat burning increasing',
                icon: '⚡',
                type: 'milestone',
                extended: 'Your body is shifting to fat as primary fuel. Growth hormone starts rising.'
            });
        }

        if (hours >= 12 && hours < 16) {
            displays.push({
                text: 'You\'ve entered the metabolic sweet spot',
                icon: '🎯',
                type: 'milestone',
                extended: 'Autophagy is beginning, growth hormone is elevated, and mental clarity often peaks.'
            });
        }

        if (hours >= 16 && hours < 24) {
            displays.push({
                text: 'Autophagy is in full swing',
                icon: '🧹',
                type: 'milestone',
                extended: 'Cellular cleanup is at peak efficiency. Your body is recycling old components.'
            });
        }

        if (hours >= 24) {
            displays.push({
                text: 'You\'ve achieved metabolic flexibility mastery',
                icon: '🏆',
                type: 'milestone',
                extended: 'Your body is highly efficient at using stored fat. Inflammation is reduced and cellular repair optimized.'
            });
        }
    }

    /**
     * Update extended content with detailed benefits
     */
    updateExtendedContent(benefits, currentDisplay = null) {
        const isDashboard = this.cardId.includes('dashboard');
        const extendedTextId = isDashboard ? '#dashboardBenefitsExtendedText' : '#benefitsExtendedText';
        const extendedTextElement = this.element.querySelector(extendedTextId);
        if (!extendedTextElement) return;

        let extendedText = '';

        // Use current display's extended content if available
        if (currentDisplay && currentDisplay.extended) {
            extendedText = currentDisplay.extended;
        } else {
            // Fallback to summary content
            const summaryParts = [];

            if (benefits.moneySaved > 0) {
                summaryParts.push(`💰 $${benefits.moneySaved.toFixed(2)} saved`);
            }

            if (benefits.timeReclaimed > 0) {
                summaryParts.push(`⏰ ${benefits.timeReclaimed_formatted} reclaimed`);
            }

            if (benefits.mealsSkipped > 0) {
                summaryParts.push(`🎯 ${benefits.mealsSkipped} meals skipped`);
            }

            if (summaryParts.length > 0) {
                extendedText = summaryParts.join(' • ') + '\n\n';
            }

            // Add phase-specific context
            if (benefits.fastDurationHours >= 24) {
                extendedText += 'You\'re in the advanced fasting zone where the deepest benefits occur. Autophagy, growth hormone, and cellular repair are all optimized.';
            } else if (benefits.fastDurationHours >= 16) {
                extendedText += 'You\'ve entered the powerful autophagy phase. Your cells are cleaning house and your body is becoming metabolically flexible.';
            } else if (benefits.fastDurationHours >= 12) {
                extendedText += 'You\'re in the metabolic sweet spot where fat burning is optimized and growth hormone is elevated.';
            } else if (benefits.fastDurationHours >= 6) {
                extendedText += 'Your body is transitioning to fat-burning mode and insulin sensitivity is improving.';
            } else {
                extendedText += 'You\'re building momentum! Each hour of fasting strengthens your metabolic flexibility and mental resilience.';
            }
        }

        extendedTextElement.textContent = extendedText || 'Keep going! Every hour builds more benefits.';
    }

    /**
     * Get money equivalence description
     */
    getMoneyEquivalence(amount) {
        if (amount >= 500) return 'enough for a weekend getaway!';
        if (amount >= 200) return 'perfect for a nice dinner out!';
        if (amount >= 100) return 'great for quality groceries!';
        if (amount >= 50) return 'enough for a gym membership!';
        if (amount >= 20) return 'perfect for a coffee date!';
        return 'building up your savings!';
    }

    /**
     * Get time activity suggestion
     */
    getTimeActivity(minutes) {
        if (minutes >= 240) return 'a full movie marathon and popcorn making';
        if (minutes >= 120) return 'a workout and relaxation session';
        if (minutes >= 60) return 'a walk, meditation, or catching up on reading';
        if (minutes >= 30) return 'a quick meditation or planning session';
        return 'a mindful breathing exercise';
    }

    /**
     * Get extended content for hormonal benefits
     */
    getHormonalExtended(type) {
        const extensions = {
            'adrenaline': 'Your body releases noradrenaline during fasting, increasing alertness and energy without the crash of caffeine.',
            'insulin_sensitivity': 'Fasting gives your insulin receptors a break, making them more sensitive for better blood sugar control.',
            'growth_hormone': 'Growth hormone can increase by 300-1300% during fasting, helping preserve muscle and burn fat efficiently.'
        };
        return extensions[type] || 'Fasting triggers beneficial hormonal changes throughout your body.';
    }

    /**
     * Get extended content for cellular benefits
     */
    getCellularExtended(type) {
        const extensions = {
            'autophagy': 'Autophagy is your body\'s cellular recycling program, breaking down old proteins and organelles to prevent aging.',
            'dna_repair': 'Fasting triggers cellular stress responses that enhance DNA repair and protect against oxidative damage.',
            'stem_cell_regeneration': 'Extended fasting can trigger stem cell-based regeneration, producing fresh cells to replace old ones.'
        };
        return extensions[type] || 'Your cells are undergoing important repair and regeneration processes.';
    }

    /**
     * Get extended content for brain benefits
     */
    getBrainExtended(type) {
        const extensions = {
            'mental_clarity': 'Ketones are a more efficient brain fuel than glucose, often leading to enhanced focus and cognitive performance.',
            'bdnf_production': 'BDNF helps grow new brain cells and protect existing ones, supporting learning, memory, and mood.'
        };
        return extensions[type] || 'Fasting provides significant benefits for brain health and cognitive function.';
    }

    /**
     * Get extended content for metabolic benefits
     */
    getMetabolicExtended(type) {
        const extensions = {
            'fat_burning': 'After glycogen depletion, your body becomes highly efficient at using stored fat for energy.',
            'inflammation_reduction': 'Fasting reduces inflammatory cytokines and oxidative stress, promoting healing throughout your body.'
        };
        return extensions[type] || 'Your metabolism is becoming more flexible and efficient.';
    }

    /**
     * Get extended content for lifestyle benefits
     */
    getLifestyleExtended(type) {
        const extensions = {
            'meal_prep': 'Beyond eating time, you\'re saving hours on planning, shopping, cooking, and cleaning.',
            'mental_bandwidth': 'The average person makes 200+ food decisions daily. Fasting frees up cognitive resources for more important things.',
            'schedule_simplicity': 'Your schedule becomes more flexible and productive when not anchored to meal times.'
        };
        return extensions[type] || 'Fasting simplifies your daily routine and mental load.';
    }

    /**
     * Get extended content for mental benefits
     */
    getMentalExtended(type) {
        const extensions = {
            'stress_resilience': 'Fasting is hormetic stress—mild stress that makes you stronger and better able to handle life\'s challenges.',
            'food_appreciation': 'Temporary restriction increases appreciation and can lead to more mindful eating habits.'
        };
        return extensions[type] || 'Fasting builds mental strength and improves your relationship with food.';
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

    // Individual rotation methods removed - now managed by CardRotationManager

    // Show/hide overrides removed - rotation now managed by CardRotationManager

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