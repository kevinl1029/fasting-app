/**
 * PhaseBanner Class
 * Displays current fasting phase information in a compact banner format above the fold
 * Features horizontal layout with expandable description functionality
 */

class PhaseBanner {
    constructor(options = {}) {
        this.element = null;
        this.statusElement = null;
        this.phaseElement = null;
        this.descriptionElement = null;
        this.isExpanded = false;
        this.currentPhase = null;

        // Default options
        this.options = {
            expandOnClick: true,
            animationDuration: 300,
            statusIcon: '🟠',
            phaseIcon: '🌟',
            separator: '|',
            ...options
        };

        this.eventListeners = new Map();
    }

    /**
     * Initialize the banner and set up event listeners
     */
    init() {
        this.element = document.getElementById('phaseBanner');
        if (!this.element) {
            console.error('Phase banner element not found');
            return false;
        }

        // Get references to child elements
        this.phaseElement = document.getElementById('phaseText');
        this.descriptionElement = document.getElementById('bannerDescription');

        this.setupEventListeners();
        this.setupInitialState();

        return true;
    }

    /**
     * Create the banner element dynamically
     */
    createElement() {
        // This method is no longer needed since the banner is now in the HTML
        // The banner structure is pre-defined in the HTML
        console.warn('createElement called but banner should already exist in HTML');
    }

    /**
     * Set up initial banner state
     */
    setupInitialState() {
        if (!this.element) return;

        // Ensure description starts hidden
        if (this.descriptionElement) {
            this.descriptionElement.classList.add('hidden');
        }
        this.isExpanded = false;
    }

    /**
     * Set up event listeners for banner interactions
     */
    setupEventListeners() {
        if (!this.element) return;

        // Remove existing listeners if any
        this.removeEventListeners();

        if (this.options.expandOnClick) {
            this.clickHandler = (event) => this.handleBannerClick(event);
            this.element.addEventListener('click', this.clickHandler);
            this.eventListeners.set('click', this.clickHandler);
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
     * Handle banner click events
     */
    async handleBannerClick(event) {
        // Prevent default behavior
        event.preventDefault();
        event.stopPropagation();

        try {
            // Check if click was on an interactive element
            if (this.isInteractiveElement(event.target)) {
                return;
            }

            // Toggle expanded state
            await this.toggleExpanded();

            // Trigger custom event
            this.emit('banner:toggle', {
                isExpanded: this.isExpanded,
                phase: this.currentPhase
            });

        } catch (error) {
            console.error('Error handling banner click:', error);
        }
    }

    /**
     * Check if element is interactive
     */
    isInteractiveElement(element) {
        const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
        const interactiveClasses = ['btn', 'button'];

        return interactiveTags.includes(element.tagName) ||
               interactiveClasses.some(cls => element.classList.contains(cls)) ||
               element.closest('a, button');
    }

    /**
     * Toggle banner expanded state
     */
    async toggleExpanded() {
        if (!this.element || !this.descriptionElement) return;

        this.isExpanded = !this.isExpanded;

        if (this.isExpanded) {
            await this.expand();
        } else {
            await this.collapse();
        }
    }

    /**
     * Expand the banner to show description
     */
    async expand() {
        if (!this.descriptionElement) return;

        try {
            // Add expanded class to banner
            this.element.classList.add('expanded');

            // Remove hidden class and add slide-down for animation
            this.descriptionElement.classList.remove('hidden');

            // Use requestAnimationFrame to ensure DOM is ready
            await this.nextFrame();
            this.descriptionElement.classList.add('slide-down');

            this.emit('banner:expand', { phase: this.currentPhase });

        } catch (error) {
            console.error('Error expanding banner:', error);
        }
    }

    /**
     * Collapse the banner to hide description
     */
    async collapse() {
        if (!this.descriptionElement) return;

        try {
            // Remove expanded class
            this.element.classList.remove('expanded');

            // Remove slide-down class for animation
            this.descriptionElement.classList.remove('slide-down');

            // Wait for animation before hiding completely
            await this.delay(this.options.animationDuration);
            this.descriptionElement.classList.add('hidden');

            this.emit('banner:collapse', { phase: this.currentPhase });

        } catch (error) {
            console.error('Error collapsing banner:', error);
        }
    }

    /**
     * Update the phase information
     */
    updatePhase(phase) {
        if (!this.element || !phase) return;

        try {
            this.currentPhase = phase;

            // Update phase text
            if (this.phaseElement) {
                this.phaseElement.textContent = phase.title || 'Getting Started';
            }

            // Update description
            const descriptionText = document.getElementById('phaseDescription');
            if (descriptionText && phase.description) {
                descriptionText.textContent = phase.description;
            }

            // Update phase icon if provided
            const phaseIcon = this.element.querySelector('.phase-icon');
            if (phaseIcon && phase.icon) {
                phaseIcon.textContent = phase.icon;
            }

            this.emit('banner:phaseUpdate', { phase });

        } catch (error) {
            console.error('Error updating phase:', error);
        }
    }

    /**
     * Update milestone information (for milestone-specific displays)
     */
    updateMilestone(milestone) {
        if (!milestone) return;

        const milestonePhase = {
            title: milestone.title,
            description: milestone.message,
            icon: milestone.icon
        };

        this.updatePhase(milestonePhase);
    }

    /**
     * Update status text
     */
    updateStatus(statusText) {
        if (this.statusElement && statusText) {
            this.statusElement.textContent = statusText;
        }
    }

    /**
     * Get current state
     */
    getState() {
        return {
            isExpanded: this.isExpanded,
            currentPhase: this.currentPhase,
            element: this.element
        };
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
     * Add event listener
     */
    on(eventName, handler) {
        const target = this.element || document;
        target.addEventListener(eventName, handler);
    }

    /**
     * Remove event listener
     */
    off(eventName, handler) {
        const target = this.element || document;
        target.removeEventListener(eventName, handler);
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
     * Clean up and destroy the banner
     */
    destroy() {
        this.removeEventListeners();

        if (this.element) {
            this.element.classList.remove('expanded');
        }

        this.element = null;
        this.statusElement = null;
        this.phaseElement = null;
        this.descriptionElement = null;
        this.isExpanded = false;
        this.currentPhase = null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhaseBanner;
} else {
    window.PhaseBanner = PhaseBanner;
}