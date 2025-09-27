/**
 * Navigation Utility - Standard Web Practices
 * Simple, lightweight navigation management
 */

class NavigationManager {
    constructor() {
        this.navigationLoaded = false;
        this.currentPage = null;
    }

    /**
     * Load navigation HTML into placeholder
     * @param {string} containerId - ID of container element
     * @param {string} currentPage - Current page identifier for active state
     */
    async loadNavigation(containerId = 'navigation-placeholder', currentPage = null) {
        try {
            const container = document.getElementById(containerId);
            if (!container) {
                console.warn(`Navigation container '${containerId}' not found`);
                return false;
            }

            // Fetch navigation HTML
            const response = await fetch('/partials/navigation.html');
            if (!response.ok) {
                throw new Error(`Failed to load navigation: ${response.status}`);
            }

            const navigationHTML = await response.text();
            container.innerHTML = navigationHTML;

            this.navigationLoaded = true;

            // Set active page if provided
            if (currentPage) {
                this.setActivePage(currentPage);
            }

            return true;

        } catch (error) {
            console.error('Error loading navigation:', error);
            return false;
        }
    }

    /**
     * Set active page state
     * @param {string} pageName - Page identifier (matches data-page attribute)
     */
    setActivePage(pageName) {
        if (!pageName) return;

        this.currentPage = pageName;

        // Remove active class from all nav items
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.classList.remove('active');
        });

        // Add active class to current page
        const activeItem = document.querySelector(`[data-page="${pageName}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }

        // Set up Learning Hub click handler to prevent navigation
        this.setupLearningHubHandler();
    }

    /**
     * Set up Learning Hub click handler to show coming soon message
     */
    setupLearningHubHandler() {
        const learningHubLink = document.querySelector('[data-page="learning"]');
        if (learningHubLink) {
            learningHubLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLearningHubMessage();
            });
        }
    }

    /**
     * Show Learning Hub coming soon message
     */
    showLearningHubMessage() {
        // Create modal-style message
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        `;

        const messageBox = document.createElement('div');
        messageBox.style.cssText = `
            background: white;
            border-radius: 20px;
            padding: 30px;
            margin: 20px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        `;

        messageBox.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 20px;">📚</div>
            <h2 style="color: #333; margin-bottom: 15px; font-size: 1.5rem;">Learning Hub Coming Soon!</h2>
            <p style="color: #666; margin-bottom: 25px; line-height: 1.5;">
                We're working on an amazing learning hub with fasting guides, tips, and educational content.
                Stay tuned for this exciting feature!
            </p>
            <button id="learning-hub-close" style="
                background: linear-gradient(135deg, #fcd34d 0%, #fb923c 50%, #ec4899 100%);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 10px;
                font-weight: 600;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.3s;
            ">Got it!</button>
        `;

        modal.appendChild(messageBox);
        document.body.appendChild(modal);

        // Close handlers
        const closeBtn = messageBox.querySelector('#learning-hub-close');
        const closeModal = () => {
            modal.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Add hover effect to button
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.transform = 'translateY(-2px)';
            closeBtn.style.boxShadow = '0 4px 15px rgba(251, 146, 60, 0.3)';
        });

        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.transform = 'translateY(0)';
            closeBtn.style.boxShadow = 'none';
        });
    }

    /**
     * Get current page
     */
    getCurrentPage() {
        return this.currentPage;
    }

    /**
     * Check if navigation is loaded
     */
    isLoaded() {
        return this.navigationLoaded;
    }
}

// Create global instance for easy access
window.navigationManager = new NavigationManager();

// Convenience function for backward compatibility
window.setActivePage = function(pageName) {
    window.navigationManager.setActivePage(pageName);
};

// Convenience function to load navigation
window.loadNavigation = function(containerId, currentPage) {
    return window.navigationManager.loadNavigation(containerId, currentPage);
};

// Auto-initialize when DOM is ready if placeholder exists
document.addEventListener('DOMContentLoaded', function() {
    const placeholder = document.getElementById('navigation-placeholder');
    if (placeholder) {
        // Try to detect current page from URL or body class
        const currentPage = detectCurrentPage();
        window.navigationManager.loadNavigation('navigation-placeholder', currentPage);
    }
});

/**
 * Detect current page from URL or other indicators
 */
function detectCurrentPage() {
    const path = window.location.pathname;

    // Map paths to page identifiers
    const pathMap = {
        '/schedule': 'schedule',
        '/dashboard': 'dashboard',
        '/timer': 'timer',
        '/learning': 'learning',
        '/settings': 'settings',
        '/': 'timer', // Default to timer for home page
        '/index.html': 'timer',
        '/timer.html': 'timer',
        '/dashboard.html': 'dashboard',
        '/schedule.html': 'schedule',
        '/settings.html': 'settings'
    };

    return pathMap[path] || 'timer'; // Default fallback
}