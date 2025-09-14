/**
 * Notification Service Module
 * Handles browser notifications for Hunger Coach during active fasts
 */

class NotificationService {
    constructor() {
        this.isSupported = 'Notification' in window;
        this.permission = this.isSupported ? Notification.permission : 'denied';
        this.lastNotificationTime = null;
        this.notificationInterval = null;
        this.isActive = false;
    }

    /**
     * Request notification permissions from the user
     */
    async requestPermission() {
        if (!this.isSupported) {
            console.warn('Browser notifications are not supported');
            return false;
        }

        if (this.permission === 'granted') {
            return true;
        }

        if (this.permission === 'denied') {
            console.warn('Notification permission previously denied');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;

            if (permission === 'granted') {
                console.log('Notification permission granted');
                return true;
            } else {
                console.warn('Notification permission denied by user');
                return false;
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }

    /**
     * Check if notifications are available and permitted
     */
    isAvailable() {
        return this.isSupported && this.permission === 'granted';
    }

    /**
     * Send a hunger coach notification
     */
    sendHungerNotification(message, options = {}) {
        if (!this.isAvailable()) {
            console.log('Notifications not available, skipping:', message);
            return null;
        }

        const defaultOptions = {
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'hunger-coach',
            renotify: false,
            requireInteraction: false,
            silent: true,
            ...options
        };

        try {
            const notification = new Notification(message, defaultOptions);

            // Auto-close after 6 seconds
            setTimeout(() => {
                if (notification) {
                    notification.close();
                }
            }, 6000);

            // Update last notification time
            this.lastNotificationTime = new Date();

            console.log('Hunger coach notification sent:', message);
            return notification;
        } catch (error) {
            console.error('Error sending notification:', error);
            return null;
        }
    }

    /**
     * Start the notification service for an active fast
     */
    startForFast(fastStartTime, hungerCoach, userMealtimes = null) {
        if (!this.isAvailable()) {
            console.log('Notifications not available, service not started');
            return;
        }

        if (this.isActive) {
            console.log('Notification service already active');
            return;
        }

        this.isActive = true;
        console.log('Starting hunger coach notification service');

        // Check for notifications every minute
        this.notificationInterval = setInterval(() => {
            this.checkAndSendNotification(fastStartTime, hungerCoach, userMealtimes);
        }, 60 * 1000); // Check every minute

        // Initial check
        setTimeout(() => {
            this.checkAndSendNotification(fastStartTime, hungerCoach, userMealtimes);
        }, 1000);
    }

    /**
     * Stop the notification service
     */
    stop() {
        if (this.notificationInterval) {
            clearInterval(this.notificationInterval);
            this.notificationInterval = null;
        }
        this.isActive = false;
        console.log('Hunger coach notification service stopped');
    }

    /**
     * Check if we should send a notification and send it
     */
    checkAndSendNotification(fastStartTime, hungerCoach, userMealtimes) {
        if (!hungerCoach || !this.isAvailable()) return;

        // Use default mealtimes if user hasn't set custom ones
        const mealtimes = userMealtimes || {
            breakfast: '08:00',
            lunch: '12:00',
            dinner: '18:00'
        };

        const shouldShow = hungerCoach.shouldShowNotification(mealtimes, this.lastNotificationTime);

        if (shouldShow && shouldShow.shouldShow) {
            const message = hungerCoach.getNotificationMessage(shouldShow.mealType, fastStartTime);
            this.sendHungerNotification(message);
        }
    }

    /**
     * Get the current permission status
     */
    getPermissionStatus() {
        return {
            supported: this.isSupported,
            permission: this.permission,
            available: this.isAvailable()
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationService;
} else {
    window.NotificationService = NotificationService;
}