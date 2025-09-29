/**
 * HungerCoachCard Component
 * Extends ContextualCard to provide hunger management tips and support during fasting
 * Only shows during meal times + active fast (fixes current always-show behavior)
 */

class HungerCoachCard extends ContextualCard {
    constructor(cardId = 'hungerCoachCard', options = {}) {
        const defaultOptions = {
            autoHide: false, // Managed by card rotation system
            tapToExpand: true,
            // rotationInterval removed - managed by CardRotationManager
            ...options
        };

        super(cardId, defaultOptions);

        this.hungerCoach = null;
        this.currentTip = null;
        this.fastStartTime = null;
        this.userMealtimes = null;
        this.initialized = false;
    }

    /**
     * Initialize the hunger coach card
     */
    async init() {
        const success = super.init();
        if (!success) return false;

        try {
            // Initialize the hunger coach engine
            if (window.HungerCoach) {
                this.hungerCoach = new window.HungerCoach();
                await this.hungerCoach.init();
                this.initialized = true;
                console.log('HungerCoachCard initialized successfully');
            } else {
                console.warn('HungerCoach class not available');
                return false;
            }

            return true;
        } catch (error) {
            console.error('Failed to initialize HungerCoachCard:', error);
            return false;
        }
    }

    /**
     * Update card content with contextual tip
     */
    async setContent(content) {
        console.log('HungerCoachCard.setContent called with:', content);
        console.log('Element exists:', !!this.element);
        console.log('HungerCoach exists:', !!this.hungerCoach);

        if (!this.element || !this.hungerCoach) {
            console.log('HungerCoachCard.setContent early return - missing element or hungerCoach');
            return;
        }

        try {
            let tip;

            if (content && content.tip) {
                // Use provided tip
                tip = content.tip;
            } else {
                // Get contextual tip from hunger coach
                tip = this.hungerCoach.getContextualTip(this.fastStartTime, this.userMealtimes);
            }

            if (!tip) {
                console.warn('No tip available for hunger coach card - using fallback');
                tip = {
                    text: 'Stay strong! Hunger comes in waves.',
                    type: 'general',
                    extended: 'Remember that hunger pangs are temporary. Stay hydrated and keep yourself busy.'
                };
            }

            this.currentTip = tip;

            // Update card elements - use dashboard-specific IDs if in dashboard
            const isDashboard = this.cardId.includes('dashboard');
            const textId = isDashboard ? '#dashboardHungerCardText' : '#hungerCardText';
            const iconId = isDashboard ? '#dashboardHungerCardIcon' : '#hungerCardIcon';

            const textElement = this.element.querySelector(textId);
            const iconElement = this.element.querySelector(iconId);

            if (textElement) {
                textElement.textContent = tip.text || 'Remember: hunger comes in waves, not constant streams.';
            }

            if (iconElement) {
                // Set icon based on tip type
                const icon = this.getIconForTipType(tip.type);
                iconElement.textContent = icon;
            }

            // Update extended content if available
            const extendedTextId = isDashboard ? '#dashboardHungerExtendedText' : '#hungerExtendedText';
            const extendedTextElement = this.element.querySelector(extendedTextId);
            if (extendedTextElement && tip.extended) {
                extendedTextElement.textContent = tip.extended;
            }

        } catch (error) {
            console.error('Error setting content for HungerCoachCard:', error);
        }
    }

    /**
     * Get icon emoji based on tip type
     */
    getIconForTipType(tipType) {
        const iconMap = {
            'hydration': '💧',
            'movement': '🚶',
            'mindfulness': '🧘',
            'educational': '🍵',
            'action': '💪',
            'reassurance': '❤️',
            'breathing': '🌬️',
            'distraction': '🎯',
            'general': '🍵'
        };

        return iconMap[tipType] || '🍵';
    }

    /**
     * Update fast context for better tip selection
     */
    updateFastContext(fastStartTime, userMealtimes) {
        this.fastStartTime = fastStartTime;
        this.userMealtimes = userMealtimes;
    }

    /**
     * Get next tip in rotation
     */
    async getNextTip() {
        if (!this.hungerCoach) return null;

        try {
            return this.hungerCoach.getNextRotationTip(this.fastStartTime, this.userMealtimes);
        } catch (error) {
            console.error('Error getting next tip:', error);
            return null;
        }
    }

    /**
     * Called when card expands
     */
    async onExpand() {
        if (!this.element) return;

        const extendedContent = this.element.querySelector('#hungerCardExtended');
        const extendedText = this.element.querySelector('#hungerExtendedText');

        if (extendedContent && extendedText) {
            // Show extended content
            extendedContent.style.display = 'block';

            // Add extended content if not already present
            if (!extendedText.textContent || extendedText.textContent === 'Additional context and tips will appear here when you tap the card.') {
                if (this.currentTip && this.currentTip.extended) {
                    extendedText.textContent = this.currentTip.extended;
                } else {
                    // Generate contextual extended content
                    extendedText.textContent = this.generateExtendedContent();
                }
            }
        }
    }

    /**
     * Called when card collapses
     */
    async onCollapse() {
        if (!this.element) return;

        const extendedContent = this.element.querySelector('#hungerCardExtended');
        if (extendedContent) {
            extendedContent.style.display = 'none';
        }
    }

    /**
     * Generate contextual extended content based on current state
     */
    generateExtendedContent() {
        if (!this.currentTip) {
            return 'Tap again to see more personalized tips for your current fasting state.';
        }

        const type = this.currentTip.type;
        const extendedContentMap = {
            'hydration': 'Staying hydrated helps reduce false hunger signals. Try sparkling water with lemon for variety.',
            'movement': 'Physical activity increases endorphins and reduces appetite. Even light stretching can help.',
            'mindfulness': 'Mindful breathing and meditation help you observe hunger without reacting to it immediately.',
            'educational': 'Understanding the science behind hunger helps you recognize when cravings are habit-based.',
            'action': 'Taking specific actions gives you control over your fasting experience.',
            'reassurance': 'Remember that feeling hungry is normal and temporary. Your body is adapting.',
            'breathing': 'Deep breathing activates your parasympathetic nervous system, reducing stress-induced cravings.',
            'distraction': 'Engaging your mind with activities makes time pass faster and reduces focus on hunger.',
            'general': 'Each fast gets easier as your body adapts to using stored energy more efficiently.'
        };

        return extendedContentMap[type] || 'Keep going! You\'re building mental resilience and metabolic flexibility.';
    }

    /**
     * Handle see more link clicks
     */
    handleSeeMoreClick(event) {
        event.preventDefault();
        event.stopPropagation();

        // Navigate to learning hub or tips section
        // This can be implemented based on the app's navigation structure
        console.log('See more clicked for hunger coach tips');

        // Emit event for external handling
        this.emit('hungerCoach:seeMore', {
            currentTip: this.currentTip,
            tipType: this.currentTip?.type
        });
    }

    /**
     * Check if hunger coach should be shown (meal time logic)
     */
    shouldShow(isActivefast, isMealTime) {
        return isActivefast && isMealTime;
    }

    // Individual rotation methods removed - now managed by CardRotationManager

    // Show/hide overrides removed - rotation now managed by CardRotationManager

    /**
     * Get hunger coach notification message
     */
    getNotificationMessage(mealType = null) {
        if (!this.hungerCoach) return null;

        try {
            return this.hungerCoach.getNotificationMessage(mealType, this.fastStartTime);
        } catch (error) {
            console.error('Error getting notification message:', error);
            return null;
        }
    }

    /**
     * Check if hunger coach should show notifications
     */
    shouldShowNotification(lastNotificationTime = null) {
        if (!this.hungerCoach) return false;

        try {
            return this.hungerCoach.shouldShowNotification(this.userMealtimes, lastNotificationTime);
        } catch (error) {
            console.error('Error checking notification criteria:', error);
            return false;
        }
    }

    /**
     * Get tip statistics
     */
    getTipStats() {
        if (!this.hungerCoach) return null;

        try {
            return this.hungerCoach.getTipStats();
        } catch (error) {
            console.error('Error getting tip stats:', error);
            return null;
        }
    }

    /**
     * Reset shown tips for variety
     */
    resetShownTips() {
        if (this.hungerCoach) {
            this.hungerCoach.resetShownTips();
        }
    }

    /**
     * Update fast context with new fast start time and meal times
     * Called by CardRotationManager when fast state changes
     */
    updateFastContext(fastStartTime, userMealtimes) {
        this.fastStartTime = fastStartTime;
        this.userMealtimes = userMealtimes;

        console.log('HungerCoachCard fast context updated:', {
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
     * Clean up hunger coach card
     */
    destroy() {
        super.destroy();

        this.hungerCoach = null;
        this.currentTip = null;
        this.fastStartTime = null;
        this.userMealtimes = null;
        this.initialized = false;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HungerCoachCard;
} else {
    window.HungerCoachCard = HungerCoachCard;
}