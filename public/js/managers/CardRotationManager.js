/**
 * CardRotationManager Class
 * Manages smart card display and rotation logic
 * Core Logic:
 * - Active Fast + Meal Time: Rotate 50-50 between Hunger Coach & Benefits cards
 * - Active Fast + Non-Meal Time: Show ONLY Benefits card
 * - No Active Fast: Hide cards
 */

class CardRotationManager {
    constructor(options = {}) {
        this.options = {
            rotationInterval: window.location.hostname === 'localhost' ? 2000 : 12000, // 2s for dev, 12s for production - unified timing
            mealTimeToleranceMinutes: 30,
            enableRotation: true,
            ...options
        };

        // Card instances
        this.hungerCoachCard = null;
        this.benefitsCard = null;
        this.mealTimeDetector = null;

        // State management
        this.isActiveFast = false;
        this.fastStartTime = null;
        this.userMealtimes = null;
        this.currentCard = null;
        this.rotationInterval = null;
        this.rotationIndex = 0;

        // Initialization state
        this.initialized = false;
        this.isRotating = false;
    }

    /**
     * Initialize the card rotation manager
     */
    async init() {
        try {
            console.log('Initializing CardRotationManager...');

            // Initialize meal time detector
            this.mealTimeDetector = new MealTimeDetector({
                toleranceMinutes: this.options.mealTimeToleranceMinutes
            });
            await this.mealTimeDetector.init();

            // Initialize cards
            await this.initializeCards();

            this.initialized = true;
            console.log('CardRotationManager initialized successfully');
            return true;

        } catch (error) {
            console.error('Failed to initialize CardRotationManager:', error);
            return false;
        }
    }

    /**
     * Initialize card instances
     */
    async initializeCards() {
        try {
            // Initialize Hunger Coach Card
            if (window.HungerCoachCard) {
                this.hungerCoachCard = new HungerCoachCard('hungerCoachCard');
                await this.hungerCoachCard.init();
                console.log('HungerCoachCard initialized');
            } else {
                console.warn('HungerCoachCard class not available');
            }

            // Initialize Benefits Card
            if (window.BenefitsCard) {
                this.benefitsCard = new BenefitsCard('benefitsCard');
                await this.benefitsCard.init();
                console.log('BenefitsCard initialized');
            } else {
                console.warn('BenefitsCard class not available');
            }

            // Ensure we have at least one card
            if (!this.hungerCoachCard && !this.benefitsCard) {
                throw new Error('No cards available for rotation');
            }

        } catch (error) {
            console.error('Error initializing cards:', error);
            throw error;
        }
    }

    /**
     * Update fast state and context
     */
    updateFastState(isActiveFast, fastStartTime = null, userMealtimes = null) {
        this.isActiveFast = isActiveFast;
        this.fastStartTime = fastStartTime;
        this.userMealtimes = userMealtimes;

        // Update meal time detector
        if (this.mealTimeDetector && userMealtimes) {
            this.mealTimeDetector.updateMealtimes(userMealtimes);
        }

        // Update card contexts
        if (this.hungerCoachCard) {
            this.hungerCoachCard.updateFastContext(fastStartTime, userMealtimes);
        }

        if (this.benefitsCard) {
            this.benefitsCard.updateFastContext(fastStartTime, userMealtimes);
        }

        console.log('Fast state updated:', { isActiveFast, fastStartTime, userMealtimes });

        // Update card display based on new state
        this.updateCardDisplay();
    }

    /**
     * Update card display based on current state
     */
    async updateCardDisplay() {
        if (!this.initialized) return;

        try {
            const shouldShow = this.shouldShowCards();
            const shouldRotate = this.shouldRotateCards();

            if (shouldShow) {
                await this.showAppropriateCards();

                if (shouldRotate && this.options.enableRotation) {
                    this.startRotation();
                } else {
                    this.stopRotation();
                }
            } else {
                await this.hideAllCards();
                this.stopRotation();
            }

        } catch (error) {
            console.error('Error updating card display:', error);
        }
    }

    /**
     * Determine if cards should be shown
     */
    shouldShowCards() {
        return this.isActiveFast;
    }

    /**
     * Determine if cards should rotate (meal time logic)
     */
    shouldRotateCards() {
        // Rotate whenever there's an active fast - content rotation is always useful
        if (!this.isActiveFast) return false;

        // Must have at least benefits card
        return !!this.benefitsCard;
    }

    /**
     * Show appropriate cards based on current state
     */
    async showAppropriateCards() {
        if (!this.shouldShowCards()) return;

        const isMealTime = this.mealTimeDetector ? this.mealTimeDetector.isCurrentlyMealTime() : false;
        if (isMealTime && this.hungerCoachCard && this.benefitsCard) {
            // Meal time: Show hunger coach, hide benefits
            await this.hungerCoachCard.show();
            await this.benefitsCard.hide();
            this.currentCard = this.hungerCoachCard;
        } else if (this.benefitsCard) {
            // Non-meal time: Show benefits, hide hunger coach
            await this.benefitsCard.show();
            if (this.hungerCoachCard) {
                await this.hungerCoachCard.hide();
            }
            this.currentCard = this.benefitsCard;
        } else if (this.hungerCoachCard) {
            // Fallback to hunger coach if benefits not available
            await this.hungerCoachCard.show();
            this.currentCard = this.hungerCoachCard;
        }
    }

    /**
     * Show a specific card
     */
    async showCard(card) {
        if (!card || card === this.currentCard) return;

        try {
            // Hide current card first
            if (this.currentCard && this.currentCard !== card) {
                await this.currentCard.hide();
            }

            // Show new card
            await card.show();
            this.currentCard = card;


        } catch (error) {
            console.error('Error showing card:', error);
        }
    }

    /**
     * Hide all cards
     */
    async hideAllCards() {
        try {
            const hidePromises = [];

            if (this.hungerCoachCard) {
                hidePromises.push(this.hungerCoachCard.hide());
            }

            if (this.benefitsCard) {
                hidePromises.push(this.benefitsCard.hide());
            }

            await Promise.all(hidePromises);
            this.currentCard = null;


        } catch (error) {
            console.error('Error hiding cards:', error);
        }
    }

    /**
     * Start card rotation
     */
    startRotation() {
        if (this.isRotating || !this.shouldRotateCards()) return;

        this.stopRotation(); // Clear any existing interval

        this.isRotating = true;

        this.rotationInterval = setInterval(async () => {
            await this.rotateCards();
        }, this.options.rotationInterval);
    }

    /**
     * Stop card rotation
     */
    stopRotation() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
            this.rotationInterval = null;
        }

        this.isRotating = false;
    }

    /**
     * Rotate between available cards AND rotate content within current card
     */
    async rotateCards() {
        if (!this.shouldRotateCards()) {
            this.stopRotation();
            return;
        }

        try {
            const availableCards = this.getAvailableCards();

            if (availableCards.length === 0) {
                return;
            } else if (availableCards.length === 1) {
                // Only one card available (benefits during non-meal time) - rotate its content
                const singleCard = availableCards[0];
                if (singleCard !== this.currentCard) {
                    await this.showCard(singleCard);
                } else {
                    // Same card is showing - rotate its content
                    await this.rotateCardContent(singleCard);
                }
            } else {
                // Multiple cards available (meal time: hunger + benefits)
                // 50/50 strategy: every other rotation switches cards, others rotate content
                const shouldSwitchCards = this.rotationIndex % 2 === 0;

                if (shouldSwitchCards) {
                    // Switch to next card type (50/50 between hunger and benefits)
                    const currentCardIndex = availableCards.indexOf(this.currentCard);
                    const nextCardIndex = (currentCardIndex + 1) % availableCards.length;
                    const nextCard = availableCards[nextCardIndex];

                    if (nextCard !== this.currentCard) {
                        await this.showCard(nextCard);
                    }
                } else {
                    // Rotate content within current card
                    if (this.currentCard) {
                        await this.rotateCardContent(this.currentCard);
                    }
                }

                this.rotationIndex++;
            }

        } catch (error) {
            console.error('Error rotating cards:', error);
        }
    }

    /**
     * Rotate content within a specific card
     */
    async rotateCardContent(card) {
        if (!card) return;

        try {
            if (card === this.benefitsCard && card.getNextDisplay) {
                // Benefits card content rotation
                await card.getNextDisplay();
            } else if (card === this.hungerCoachCard && card.getNextTip) {
                // Hunger coach card content rotation
                const nextTip = await card.getNextTip();
                if (nextTip) {
                    await card.setContent({ tip: nextTip });
                }
            }
        } catch (error) {
            console.error('Error rotating card content:', error);
        }
    }

    /**
     * Get available cards for rotation
     */
    getAvailableCards() {
        const cards = [];

        if (this.hungerCoachCard && this.hungerCoachCard.shouldShow) {
            const isMealTime = this.mealTimeDetector ? this.mealTimeDetector.isCurrentlyMealTime() : true;
            if (this.hungerCoachCard.shouldShow(this.isActiveFast, isMealTime)) {
                cards.push(this.hungerCoachCard);
            }
        }

        if (this.benefitsCard && this.benefitsCard.shouldShow) {
            if (this.benefitsCard.shouldShow(this.isActiveFast)) {
                cards.push(this.benefitsCard);
            }
        }

        return cards;
    }

    /**
     * Force show a specific card type
     */
    async forceShowCard(cardType) {
        let targetCard = null;

        switch (cardType.toLowerCase()) {
            case 'hunger':
            case 'hungercoach':
                targetCard = this.hungerCoachCard;
                break;
            case 'benefits':
                targetCard = this.benefitsCard;
                break;
            default:
                console.warn('Unknown card type:', cardType);
                return;
        }

        if (targetCard) {
            this.stopRotation();
            await this.showCard(targetCard);
        }
    }

    /**
     * Get current rotation status
     */
    getRotationStatus() {
        const isMealTime = this.mealTimeDetector ? this.mealTimeDetector.isCurrentlyMealTime() : false;
        const mealContext = this.mealTimeDetector ? this.mealTimeDetector.getCurrentMealContext() : null;

        return {
            isActiveFast: this.isActiveFast,
            isMealTime,
            mealContext,
            isRotating: this.isRotating,
            currentCard: this.currentCard ? this.currentCard.constructor.name : null,
            availableCards: this.getAvailableCards().map(card => card.constructor.name),
            rotationIndex: this.rotationIndex,
            shouldShowCards: this.shouldShowCards(),
            shouldRotateCards: this.shouldRotateCards()
        };
    }

    /**
     * Update rotation settings
     */
    updateSettings(newOptions) {
        const oldRotationInterval = this.options.rotationInterval;

        this.options = {
            ...this.options,
            ...newOptions
        };

        // Restart rotation if interval changed
        if (newOptions.rotationInterval && newOptions.rotationInterval !== oldRotationInterval && this.isRotating) {
            this.startRotation();
        }

        // Update meal time detector tolerance if changed
        if (newOptions.mealTimeToleranceMinutes && this.mealTimeDetector) {
            this.mealTimeDetector.updateTolerance(newOptions.mealTimeToleranceMinutes);
        }

        console.log('CardRotationManager settings updated:', this.options);
    }

    /**
     * Handle manual card tap/interaction
     */
    onCardTap(cardType, event) {
        // Pause rotation temporarily when user interacts
        if (this.isRotating) {
            this.stopRotation();

            // Resume rotation after a delay
            setTimeout(() => {
                if (this.shouldRotateCards()) {
                    this.startRotation();
                }
            }, 30000); // 30 seconds pause
        }
    }

    /**
     * Clean up and destroy the manager
     */
    destroy() {
        this.stopRotation();

        // Destroy cards
        if (this.hungerCoachCard) {
            this.hungerCoachCard.destroy();
            this.hungerCoachCard = null;
        }

        if (this.benefitsCard) {
            this.benefitsCard.destroy();
            this.benefitsCard = null;
        }

        // Destroy meal time detector
        if (this.mealTimeDetector) {
            this.mealTimeDetector.destroy();
            this.mealTimeDetector = null;
        }

        // Reset state
        this.isActiveFast = false;
        this.fastStartTime = null;
        this.userMealtimes = null;
        this.currentCard = null;
        this.rotationIndex = 0;
        this.initialized = false;
        this.isRotating = false;

        console.log('CardRotationManager destroyed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CardRotationManager;
} else {
    window.CardRotationManager = CardRotationManager;
}