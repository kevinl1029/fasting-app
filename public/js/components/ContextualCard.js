/**
 * Base ContextualCard Class
 * Provides common card behaviors: show/hide, animations, tap handling
 * Standardized styling and responsive design
 */

class ContextualCard {
    constructor(cardId, options = {}) {
        this.cardId = cardId;
        this.element = null;
        this.isVisible = false;
        this.isExpanded = false;
        this.tapHandler = null;

        // Default options
        this.options = {
            autoHide: true,
            autoHideDelay: 10000, // 10 seconds
            fadeDelay: 300, // ms for fade transitions
            slideDelay: 500, // ms for slide transitions
            tapToExpand: true,
            rotationInterval: 18000, // 18 seconds
            ...options
        };

        this.autoHideTimeout = null;
        this.rotationInterval = null;
        this.eventListeners = new Map();
    }

    /**
     * Initialize the card and set up event listeners
     */
    init() {
        this.element = document.getElementById(this.cardId);
        if (!this.element) {
            console.warn(`Card element with ID '${this.cardId}' not found`);
            return false;
        }

        this.setupEventListeners();
        this.setupInitialState();
        return true;
    }

    /**
     * Set up initial card state and styling
     */
    setupInitialState() {
        if (!this.element) return;

        // Ensure card starts hidden
        this.element.classList.add('hidden');
        this.element.classList.remove('slide-in', 'expanded', 'fading');
        this.isVisible = false;
        this.isExpanded = false;
    }

    /**
     * Set up event listeners for card interactions
     */
    setupEventListeners() {
        if (!this.element) return;

        // Remove existing listeners if any
        this.removeEventListeners();

        if (this.options.tapToExpand) {
            this.tapHandler = (event) => this.handleCardTap(event);
            this.element.addEventListener('click', this.tapHandler);
            this.eventListeners.set('click', this.tapHandler);
        }
    }

    /**
     * Remove all event listeners
     */
    removeEventListeners() {
        if (!this.element) return;

        this.eventListeners.forEach((handler, event) => {
            this.element.removeEventListener(event, handler);
        });
        this.eventListeners.clear();
    }

    /**
     * Show the card with animation
     */
    async show(content = null) {
        if (!this.element || this.isVisible) return;

        try {
            // Update content if provided
            if (content) {
                await this.updateContent(content);
            }

            // Show card with slide-in animation
            this.element.classList.remove('hidden');

            // Use requestAnimationFrame to ensure DOM is ready for animation
            await this.nextFrame();
            this.element.classList.add('slide-in');

            this.isVisible = true;

            // Set up auto-hide if enabled
            if (this.options.autoHide) {
                this.scheduleAutoHide();
            }

            // Trigger custom show event
            this.emit('card:show', { cardId: this.cardId });

        } catch (error) {
            console.error(`Error showing card ${this.cardId}:`, error);
        }
    }

    /**
     * Hide the card with animation
     */
    async hide() {
        if (!this.element) return;

        // Check if card is actually visible in the DOM, regardless of isVisible state
        const isActuallyVisible = !this.element.classList.contains('hidden');

        if (!isActuallyVisible && !this.isVisible) {
            return;
        }

        try {
            // Cancel auto-hide and rotation
            this.cancelAutoHide();
            this.stopRotation();

            // Hide card
            this.element.classList.add('hidden');
            this.element.classList.remove('slide-in', 'expanded');

            this.isVisible = false;
            this.isExpanded = false;

            // Trigger custom hide event
            this.emit('card:hide', { cardId: this.cardId });

        } catch (error) {
            console.error(`Error hiding card ${this.cardId}:`, error);
        }
    }

    /**
     * Update card content with fade transition
     */
    async updateContent(content) {
        if (!this.element) return;

        try {
            // Add fade effect to current content
            const messageElement = this.getMessageElement();
            if (messageElement) {
                messageElement.classList.add('fading');

                // Wait for fade transition
                await this.delay(this.options.fadeDelay / 2);

                // Update content
                await this.setContent(content);

                // Remove fade effect
                await this.delay(this.options.fadeDelay / 2);
                messageElement.classList.remove('fading');
            } else {
                // No fade transition, just update
                await this.setContent(content);
            }

            // Trigger content update event
            this.emit('card:contentUpdate', { cardId: this.cardId, content });

        } catch (error) {
            console.error(`Error updating content for card ${this.cardId}:`, error);
        }
    }

    /**
     * Set card content - to be implemented by subclasses
     */
    async setContent(content) {
        // Default implementation - subclasses should override
        console.warn(`setContent not implemented for card ${this.cardId}`);
    }

    /**
     * Get the main message element - to be implemented by subclasses
     */
    getMessageElement() {
        // Default implementation - subclasses should override
        return this.element?.querySelector('.card-message');
    }

    /**
     * Handle card tap/click events
     */
    async handleCardTap(event) {
        // Prevent default behavior
        event.preventDefault();
        event.stopPropagation();

        try {
            // Check if tap was on a link or button
            if (this.isInteractiveElement(event.target)) {
                return;
            }

            // Toggle expanded state
            await this.toggleExpanded();

            // Trigger tap event
            this.emit('card:tap', {
                cardId: this.cardId,
                isExpanded: this.isExpanded,
                target: event.target
            });

        } catch (error) {
            console.error(`Error handling tap for card ${this.cardId}:`, error);
        }
    }

    /**
     * Check if element is interactive (link, button, etc.)
     */
    isInteractiveElement(element) {
        const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
        const interactiveClasses = ['see-more-link', 'btn', 'button'];

        return interactiveTags.includes(element.tagName) ||
               interactiveClasses.some(cls => element.classList.contains(cls)) ||
               element.closest('a, button, .see-more-link');
    }

    /**
     * Toggle card expanded state
     */
    async toggleExpanded() {
        if (!this.element) return;

        this.isExpanded = !this.isExpanded;

        if (this.isExpanded) {
            this.element.classList.add('expanded');
            await this.onExpand();
        } else {
            this.element.classList.remove('expanded');
            await this.onCollapse();
        }
    }

    /**
     * Called when card expands - to be implemented by subclasses
     */
    async onExpand() {
        // Default implementation - subclasses can override
    }

    /**
     * Called when card collapses - to be implemented by subclasses
     */
    async onCollapse() {
        // Default implementation - subclasses can override
    }

    /**
     * Schedule auto-hide timeout
     */
    scheduleAutoHide() {
        this.cancelAutoHide();

        if (this.options.autoHide && this.options.autoHideDelay > 0) {
            this.autoHideTimeout = setTimeout(() => {
                this.hide();
            }, this.options.autoHideDelay);
        }
    }

    /**
     * Cancel auto-hide timeout
     */
    cancelAutoHide() {
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
            this.autoHideTimeout = null;
        }
    }

    /**
     * Start content rotation if supported
     */
    startRotation(rotationFunction) {
        this.stopRotation();

        if (rotationFunction && this.options.rotationInterval > 0) {
            this.rotationInterval = setInterval(rotationFunction, this.options.rotationInterval);
        }
    }

    /**
     * Stop content rotation
     */
    stopRotation() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
            this.rotationInterval = null;
        }
    }

    /**
     * Simple event emitter
     */
    emit(eventName, data) {
        const event = new CustomEvent(eventName, {
            detail: data,
            bubbles: true
        });

        if (this.element) {
            this.element.dispatchEvent(event);
        } else {
            document.dispatchEvent(event);
        }
    }

    /**
     * Add event listener for custom events
     */
    on(eventName, handler) {
        const target = this.element || document;
        target.addEventListener(eventName, handler);

        // Store for cleanup
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName).push(handler);
    }

    /**
     * Remove event listener for custom events
     */
    off(eventName, handler) {
        const target = this.element || document;
        target.removeEventListener(eventName, handler);

        // Remove from stored listeners
        if (this.eventListeners.has(eventName)) {
            const handlers = this.eventListeners.get(eventName);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Utility: Wait for next animation frame
     */
    nextFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }

    /**
     * Utility: Delay execution
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current visibility state
     */
    getVisibility() {
        return {
            isVisible: this.isVisible,
            isExpanded: this.isExpanded,
            element: this.element
        };
    }

    /**
     * Clean up and destroy the card
     */
    destroy() {
        this.cancelAutoHide();
        this.stopRotation();
        this.removeEventListeners();

        if (this.element) {
            this.element.classList.add('hidden');
        }

        this.element = null;
        this.isVisible = false;
        this.isExpanded = false;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContextualCard;
} else {
    window.ContextualCard = ContextualCard;
}