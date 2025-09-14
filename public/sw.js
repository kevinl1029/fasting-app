/**
 * Service Worker for Fasting Forecast
 * Handles background notifications and offline functionality
 */

const CACHE_NAME = 'fasting-forecast-v1';
const NOTIFICATION_TAG = 'hunger-coach';

// Install service worker
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    self.skipWaiting();
});

// Activate service worker
self.addEventListener('activate', event => {
    console.log('Service Worker: Activated');
    event.waitUntil(self.clients.claim());
});

// Handle background sync (for when connection is restored)
self.addEventListener('sync', event => {
    if (event.tag === 'hunger-coach-sync') {
        event.waitUntil(checkAndSendHungerNotifications());
    }
});

// Handle notification click events
self.addEventListener('notificationclick', event => {
    console.log('Notification clicked:', event.notification.tag);

    event.notification.close();

    // Focus or open the app when notification is clicked
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(clients => {
            // If app is already open, focus it
            for (const client of clients) {
                if (client.url.includes('timer') && 'focus' in client) {
                    return client.focus();
                }
            }

            // Otherwise open the timer page
            if (self.clients.openWindow) {
                return self.clients.openWindow('/timer');
            }
        })
    );
});

// Handle push notifications (if we add push notifications later)
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();

        const options = {
            body: data.body || 'Time for some hunger support',
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            tag: NOTIFICATION_TAG,
            requireInteraction: false,
            silent: true,
            data: data
        };

        event.waitUntil(
            self.registration.showNotification(data.title || 'Hunger Coach', options)
        );
    }
});

// Periodic background notification check
async function checkAndSendHungerNotifications() {
    try {
        // Get stored fast state and user settings
        const clients = await self.clients.matchAll();

        for (const client of clients) {
            // Ask client pages to check for notifications
            client.postMessage({
                type: 'CHECK_HUNGER_NOTIFICATIONS'
            });
        }

    } catch (error) {
        console.error('Error in background notification check:', error);
    }
}

// Handle messages from main thread
self.addEventListener('message', event => {
    const { type, data } = event.data;

    console.log('📨 SERVICE WORKER: Received message:', type, data);

    switch (type) {
        case 'SCHEDULE_NOTIFICATION':
            console.log('⏰ SERVICE WORKER: Scheduling notification');
            scheduleNotification(data);
            break;

        case 'CANCEL_NOTIFICATIONS':
            console.log('🚫 SERVICE WORKER: Canceling notifications');
            cancelAllNotifications();
            break;

        case 'SEND_HUNGER_TIP':
            console.log('💡 SERVICE WORKER: Sending hunger tip');
            sendHungerTipNotification(data);
            break;

        default:
            console.log('❓ SERVICE WORKER: Unknown message type:', type);
    }
});

// Schedule a notification
function scheduleNotification(data) {
    const { message, delay, tag } = data;

    setTimeout(() => {
        self.registration.showNotification('Hunger Coach', {
            body: message,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            tag: tag || NOTIFICATION_TAG,
            requireInteraction: false,
            silent: true
        });
    }, delay);
}

// Send immediate hunger tip notification
function sendHungerTipNotification(data) {
    const { message, tag } = data;

    console.log('🔥 SERVICE WORKER: Attempting to send hunger tip notification');
    console.log('📝 Message:', message);
    console.log('🏷️ Tag:', tag);

    const notificationPromise = self.registration.showNotification('Hunger Coach', {
        body: message,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: tag || NOTIFICATION_TAG,
        requireInteraction: false,
        silent: false // Changed from true to false to make notifications visible
    });

    notificationPromise.then(() => {
        console.log('✅ SERVICE WORKER: Notification displayed successfully');
    }).catch(error => {
        console.error('❌ SERVICE WORKER: Failed to display notification:', error);
    });
}

// Cancel all active notifications
function cancelAllNotifications() {
    self.registration.getNotifications().then(notifications => {
        notifications.forEach(notification => {
            if (notification.tag === NOTIFICATION_TAG) {
                notification.close();
            }
        });
    });
}