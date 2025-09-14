/**
 * Global Notification Manager
 * Handles persistent notifications across all pages and browser sessions
 */

class GlobalNotificationManager {
    constructor() {
        this.serviceWorkerRegistration = null;
        this.hungerCoach = null;
        this.scheduledNotifications = new Map();
        this.isInitialized = false;

        // Storage keys
        this.STORAGE_KEYS = {
            ACTIVE_FAST: 'fasting_active_fast_state',
            NOTIFICATION_SCHEDULE: 'fasting_notification_schedule',
            LAST_NOTIFICATION: 'fasting_last_notification',
            USER_SETTINGS: 'hunger_coach_settings'
        };
    }

    /**
     * Initialize the global notification system
     */
    async init() {
        if (this.isInitialized) return;

        try {
            // Register service worker
            await this.registerServiceWorker();

            // Initialize hunger coach
            await this.initializeHungerCoach();

            // Restore notification state from localStorage
            await this.restoreNotificationState();

            // Listen for service worker messages
            this.setupServiceWorkerListeners();

            // Listen for storage changes (other tabs)
            this.setupStorageListeners();

            this.isInitialized = true;
            console.log('🔔 Global Notification Manager initialized');

        } catch (error) {
            console.error('Failed to initialize Global Notification Manager:', error);
        }
    }

    /**
     * Register service worker for background notifications
     */
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                this.serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered successfully');
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    /**
     * Initialize hunger coach instance
     */
    async initializeHungerCoach() {
        if (typeof HungerCoach !== 'undefined') {
            this.hungerCoach = new HungerCoach();
            await this.hungerCoach.init();
        }
    }

    /**
     * Check if user has an active fast and resume notifications if needed
     */
    async restoreNotificationState() {
        const activeFast = this.getActiveFastState();
        const notificationSchedule = this.getStoredNotificationSchedule();

        if (activeFast && activeFast.isActive) {
            console.log('🏃 Resuming notifications for active fast');
            await this.startNotificationsForFast(activeFast.startTime, activeFast.duration);
        } else if (notificationSchedule && notificationSchedule.length > 0) {
            // Clear old schedules if no active fast
            this.clearNotificationSchedule();
        }
    }

    /**
     * Start notifications for an active fast
     */
    async startNotificationsForFast(fastStartTime, duration = null) {
        if (!this.isNotificationAvailable()) {
            console.log('Notifications not available');
            return;
        }

        // Store fast state
        this.setActiveFastState({
            isActive: true,
            startTime: fastStartTime,
            duration: duration,
            startedAt: new Date().toISOString()
        });

        // Get user meal times
        const userSettings = await this.getUserSettings();
        const mealtimes = userSettings?.custom_mealtimes || [
            { name: 'Breakfast', time: '08:00' },
            { name: 'Lunch', time: '12:00' },
            { name: 'Dinner', time: '18:00' }
        ];

        // Schedule notifications for upcoming mealtimes
        this.scheduleHungerNotifications(mealtimes);

        console.log('🔔 Notifications started for fast');
    }

    /**
     * Stop notifications for a fast
     */
    stopNotificationsForFast() {
        // Clear active fast state
        this.clearActiveFastState();

        // Cancel scheduled notifications
        this.cancelAllScheduledNotifications();

        // Tell service worker to cancel notifications
        if (this.serviceWorkerRegistration) {
            this.serviceWorkerRegistration.active?.postMessage({
                type: 'CANCEL_NOTIFICATIONS'
            });
        }

        console.log('🔕 Notifications stopped');
    }

    /**
     * Schedule hunger notifications around meal times
     */
    scheduleHungerNotifications(mealtimes) {
        this.cancelAllScheduledNotifications();

        const now = new Date();
        const lastNotification = this.getLastNotificationTime();
        const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        console.log('🔔 Scheduling notifications for', mealtimes.length, 'meal times');
        console.log('📅 Current time:', now.toLocaleString());
        console.log('🕐 Last notification:', lastNotification ? new Date(lastNotification).toLocaleString() : 'Never');

        mealtimes.forEach(meal => {
            const mealTime = this.getNextMealTime(meal.time);
            console.log(`🍽️ Processing ${meal.name} at ${meal.time} -> Next occurrence: ${mealTime.toLocaleString()}`);

            // Only schedule if meal time is in the future
            if (mealTime > now) {
                const delay = mealTime.getTime() - now.getTime();
                const delayMinutes = Math.round(delay / (1000 * 60));

                // Check cooldown - but be more lenient in development
                const cooldownTime = isDevelopment ? (5 * 60 * 1000) : (60 * 60 * 1000); // 5 min in dev, 1 hour in prod
                const shouldSchedule = !lastNotification ||
                    (mealTime.getTime() - new Date(lastNotification).getTime()) > cooldownTime;

                console.log(`⏱️ ${meal.name}: ${delayMinutes} minutes away, cooldown check: ${shouldSchedule}`);

                if (shouldSchedule) {
                    this.scheduleNotification(meal, delay, mealTime);
                } else {
                    console.log(`🚫 Skipped ${meal.name} due to cooldown period`);
                }
            } else {
                console.log(`⏭️ Skipped ${meal.name} - meal time has passed`);
            }
        });

        // Also schedule for same times tomorrow
        console.log('🌅 Scheduling for tomorrow...');
        mealtimes.forEach(meal => {
            const tomorrowMealTime = this.getNextMealTime(meal.time);
            tomorrowMealTime.setDate(tomorrowMealTime.getDate() + 1);

            const delay = tomorrowMealTime.getTime() - now.getTime();
            const delayHours = Math.round(delay / (1000 * 60 * 60));
            console.log(`🌙 Tomorrow's ${meal.name}: ${delayHours} hours away`);

            this.scheduleNotification(meal, delay, tomorrowMealTime);
        });
    }

    /**
     * Schedule a single notification
     */
    scheduleNotification(meal, delay, scheduledTime) {
        const timeoutId = setTimeout(async () => {
            await this.sendHungerNotification(meal);
            this.scheduledNotifications.delete(timeoutId);

            // Reschedule for next day
            const nextDay = new Date(scheduledTime);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDelay = nextDay.getTime() - new Date().getTime();

            if (nextDelay > 0 && nextDelay < (7 * 24 * 60 * 60 * 1000)) { // Within a week
                this.scheduleNotification(meal, nextDelay, nextDay);
            }

        }, Math.min(delay, 2147483647)); // Max setTimeout value

        this.scheduledNotifications.set(timeoutId, {
            meal,
            scheduledTime: scheduledTime.toISOString()
        });

        // Store schedule in localStorage
        this.storeNotificationSchedule();

        const delayMinutes = Math.round(delay / (1000 * 60));
        console.log(`📅 Scheduled notification for ${meal.name} at ${scheduledTime.toLocaleString()} (in ${delayMinutes} minutes)`);
    }

    /**
     * Send a hunger notification
     */
    async sendHungerNotification(meal) {
        console.log(`🔥 ATTEMPTING to send hunger notification for ${meal.name} at ${new Date().toLocaleString()}`);

        if (!this.isNotificationAvailable()) {
            console.log('❌ Notifications not available - permission denied or not supported');
            return;
        }

        try {
            // Get active fast to determine if notifications should still be sent
            const activeFast = this.getActiveFastState();
            if (!activeFast || !activeFast.isActive) {
                console.log('❌ No active fast, skipping notification');
                return;
            }
            console.log('✅ Active fast confirmed');

            // Check if user has notifications enabled
            const userSettings = await this.getUserSettings();
            if (userSettings?.hunger_coach_enabled === false) {
                console.log('❌ User has disabled hunger coach notifications');
                return;
            }
            console.log('✅ User has notifications enabled');

            // Get hunger tip
            const message = this.hungerCoach ?
                this.hungerCoach.getNotificationMessage(meal.name.toLowerCase(), activeFast.startTime) :
                'Hunger pangs are often habit signals — most waves pass within 15–20 minutes.';

            // Send via service worker if available, otherwise use direct notification
            if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
                console.log('🔄 Using SERVICE WORKER for notification');
                console.log('📤 Sending message to service worker:', {
                    type: 'SEND_HUNGER_TIP',
                    data: { message, tag: 'hunger-coach-' + meal.name.toLowerCase() }
                });
                this.serviceWorkerRegistration.active.postMessage({
                    type: 'SEND_HUNGER_TIP',
                    data: { message, tag: 'hunger-coach-' + meal.name.toLowerCase() }
                });
                console.log('✅ Message sent to service worker');
            } else {
                console.log('🔄 Using DIRECT NOTIFICATION (no service worker)');
                console.log('📊 Service worker registration:', this.serviceWorkerRegistration);
                console.log('🔍 Service worker active:', this.serviceWorkerRegistration?.active);

                const notification = new Notification(message, {
                    icon: '/favicon.svg',
                    badge: '/favicon.svg',
                    tag: 'hunger-coach-' + meal.name.toLowerCase(),
                    requireInteraction: false,
                    silent: false // Changed to match service worker setting
                });

                console.log('📢 Direct notification created:', notification);
                setTimeout(() => notification.close(), 6000);
            }

            // Record notification time
            this.setLastNotificationTime(new Date().toISOString());

            console.log(`🎉 SUCCESS! Sent hunger notification for ${meal.name}: ${message}`);

        } catch (error) {
            console.error('Error sending hunger notification:', error);
        }
    }

    /**
     * Get next occurrence of a meal time
     */
    getNextMealTime(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        const now = new Date();
        const mealTime = new Date();

        mealTime.setHours(hours, minutes, 0, 0);

        // Only move to tomorrow if the meal time has actually passed (not equal)
        if (mealTime < now) {
            mealTime.setDate(mealTime.getDate() + 1);
        }

        return mealTime;
    }

    /**
     * Cancel all scheduled notifications
     */
    cancelAllScheduledNotifications() {
        this.scheduledNotifications.forEach((data, timeoutId) => {
            clearTimeout(timeoutId);
        });
        this.scheduledNotifications.clear();
        this.clearNotificationSchedule();
    }

    /**
     * Check if notifications are available
     */
    isNotificationAvailable() {
        return 'Notification' in window && Notification.permission === 'granted';
    }

    /**
     * Request notification permission
     */
    async requestNotificationPermission() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return false;
    }

    // === Storage Methods ===

    getActiveFastState() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.ACTIVE_FAST);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            return null;
        }
    }

    setActiveFastState(fastState) {
        localStorage.setItem(this.STORAGE_KEYS.ACTIVE_FAST, JSON.stringify(fastState));
    }

    clearActiveFastState() {
        localStorage.removeItem(this.STORAGE_KEYS.ACTIVE_FAST);
    }

    getStoredNotificationSchedule() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.NOTIFICATION_SCHEDULE);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    }

    storeNotificationSchedule() {
        const schedule = Array.from(this.scheduledNotifications.values());
        localStorage.setItem(this.STORAGE_KEYS.NOTIFICATION_SCHEDULE, JSON.stringify(schedule));
    }

    clearNotificationSchedule() {
        localStorage.removeItem(this.STORAGE_KEYS.NOTIFICATION_SCHEDULE);
    }

    getLastNotificationTime() {
        return localStorage.getItem(this.STORAGE_KEYS.LAST_NOTIFICATION);
    }

    setLastNotificationTime(timestamp) {
        localStorage.setItem(this.STORAGE_KEYS.LAST_NOTIFICATION, timestamp);
    }

    async getUserSettings() {
        const sessionId = localStorage.getItem('fastingForecast_sessionId');
        if (!sessionId) return null;

        try {
            const response = await fetch(`/api/user/${sessionId}/hunger-settings`);
            return response.ok ? await response.json() : null;
        } catch (error) {
            console.error('Error loading user settings:', error);
            return null;
        }
    }

    // === Event Listeners ===

    setupServiceWorkerListeners() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', event => {
                const { type } = event.data;

                switch (type) {
                    case 'CHECK_HUNGER_NOTIFICATIONS':
                        this.checkAndSendPendingNotifications();
                        break;
                }
            });
        }
    }

    setupStorageListeners() {
        // Listen for changes from other tabs
        window.addEventListener('storage', event => {
            if (event.key === this.STORAGE_KEYS.ACTIVE_FAST) {
                // Active fast state changed in another tab
                this.restoreNotificationState();
            }
        });

        // Listen for page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Page became visible, check for pending notifications
                this.checkAndSendPendingNotifications();
            }
        });
    }

    async checkAndSendPendingNotifications() {
        const activeFast = this.getActiveFastState();
        if (!activeFast || !activeFast.isActive) return;

        // Check if we have any scheduled notifications that should have fired
        const now = new Date();
        const userSettings = await this.getUserSettings();
        const mealtimes = userSettings?.custom_mealtimes || [];

        for (const meal of mealtimes) {
            const mealTime = new Date();
            const [hours, minutes] = meal.time.split(':').map(Number);
            mealTime.setHours(hours, minutes, 0, 0);

            // Check if we're within 5 minutes of a meal time
            const timeDiff = Math.abs(now.getTime() - mealTime.getTime());
            if (timeDiff <= (5 * 60 * 1000)) { // 5 minutes
                const lastNotification = this.getLastNotificationTime();
                const shouldSend = !lastNotification ||
                    (now.getTime() - new Date(lastNotification).getTime()) > (60 * 60 * 1000);

                if (shouldSend) {
                    await this.sendHungerNotification(meal);
                }
            }
        }
    }

    // === Public API ===

    /**
     * Check if there's an active fast
     */
    hasActiveFast() {
        const fastState = this.getActiveFastState();
        return fastState && fastState.isActive;
    }

    /**
     * Get notification status info
     */
    async getNotificationStatus() {
        const activeFast = this.getActiveFastState();
        const schedule = this.getStoredNotificationSchedule();
        const lastNotification = this.getLastNotificationTime();

        // Get actual user meal times count
        const userSettings = await this.getUserSettings();
        const mealtimes = userSettings?.custom_mealtimes || [];

        // Calculate next scheduled notification more accurately
        let nextScheduled = null;
        if (activeFast && activeFast.isActive && mealtimes.length > 0) {
            const now = new Date();
            const upcomingMeals = [];

            for (const meal of mealtimes) {
                // Check if meal is within tolerance window today
                const todayMealTime = new Date();
                const [hours, minutes] = meal.time.split(':').map(Number);
                todayMealTime.setHours(hours, minutes, 0, 0);

                const timeDiff = Math.abs(now.getTime() - todayMealTime.getTime());

                if (timeDiff <= (5 * 60 * 1000) && todayMealTime >= now) {
                    // Within 5 minutes and still upcoming today
                    upcomingMeals.push({ meal, time: todayMealTime });
                } else {
                    // Use regular next meal time logic
                    const nextTime = this.getNextMealTime(meal.time);
                    upcomingMeals.push({ meal, time: nextTime });
                }
            }

            upcomingMeals.sort((a, b) => a.time - b.time);

            if (upcomingMeals.length > 0) {
                nextScheduled = upcomingMeals[0].time;
            }
        }

        return {
            isAvailable: this.isNotificationAvailable(),
            hasActiveFast: activeFast && activeFast.isActive,
            scheduledCount: mealtimes.length,
            lastNotification: lastNotification ? new Date(lastNotification) : null,
            nextScheduled: nextScheduled
        };
    }
}

// Create global instance
const globalNotificationManager = new GlobalNotificationManager();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        globalNotificationManager.init();
    });
} else {
    globalNotificationManager.init();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GlobalNotificationManager;
} else {
    window.GlobalNotificationManager = GlobalNotificationManager;
    window.globalNotificationManager = globalNotificationManager;
}