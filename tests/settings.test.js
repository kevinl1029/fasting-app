/**
 * Settings Page Test Suite
 * Comprehensive testing for settings functionality, toggles, and session management
 */

const FastingForecastTestFramework = require('./TestFramework');

async function runSettingsTests() {
    const framework = new FastingForecastTestFramework({
        headless: true,
        verbose: false
    });

    try {
        await framework.setup();
        await framework.navigateToPage('/settings.html');

        console.log('🔍 SETTINGS PAGE TEST SUITE');
        console.log('='.repeat(40));

        // Core tests
        await framework.runCoreTests();

        // Settings-specific tests
        await framework.runTest('Settings Layout Elements', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    hasPageHeader: !!document.querySelector('.page-header'),
                    hasHungerCoachSection: !!document.querySelector('.settings-section'),
                    hasNotificationToggle: !!document.getElementById('notificationToggle'),
                    hasBenefitsToggle: !!document.getElementById('benefitsToggle'),
                    hasMealtimeList: !!document.getElementById('mealtimeList'),
                    hasAvgMealCost: !!document.getElementById('avgMealCost'),
                    hasAvgMealDuration: !!document.getElementById('avgMealDuration')
                };
            });

            if (!result.hasPageHeader) throw new Error('Page header not found');
            if (!result.hasNotificationToggle) throw new Error('Notification toggle not found');

            return result;
        });

        await framework.runTest('Hunger Coach Toggle', async (page) => {
            const result = await page.evaluate(() => {
                const toggle = document.getElementById('notificationToggle');
                if (!toggle) return { error: 'Toggle not found' };

                const initialState = toggle.classList.contains('active');
                toggle.click();
                const newState = toggle.classList.contains('active');

                return {
                    initialState,
                    newState,
                    changed: initialState !== newState,
                    toggleExists: true
                };
            });

            if (!result.toggleExists) throw new Error('Hunger coach toggle not found');
            if (!result.changed) throw new Error('Toggle state did not change');

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Check persistence
            const persistenceResult = await page.evaluate(() => {
                const toggle = document.getElementById('notificationToggle');
                return toggle ? toggle.classList.contains('active') : null;
            });

            return { ...result, finalState: persistenceResult };
        });

        await framework.runTest('Benefits Toggle', async (page) => {
            const result = await page.evaluate(() => {
                const toggle = document.getElementById('benefitsToggle');
                if (!toggle) return { error: 'Toggle not found' };

                const initialState = toggle.classList.contains('active');
                toggle.click();

                return {
                    initialState,
                    toggleExists: true,
                    clicked: true
                };
            });

            if (!result.toggleExists) throw new Error('Benefits toggle not found');

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 2000));

            const finalState = await page.evaluate(() => {
                const toggle = document.getElementById('benefitsToggle');
                return toggle ? toggle.classList.contains('active') : null;
            });

            return { ...result, finalState };
        });

        await framework.runTest('Meal Cost Input', async (page) => {
            const result = await page.evaluate(() => {
                const input = document.getElementById('avgMealCost');
                if (!input) return { error: 'Input not found' };

                const originalValue = input.value;
                input.value = '15.50';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));

                return {
                    inputExists: true,
                    originalValue,
                    newValue: input.value,
                    valueSet: input.value === '15.50'
                };
            });

            if (!result.inputExists) throw new Error('Meal cost input not found');
            if (!result.valueSet) throw new Error('Failed to set meal cost value');

            return result;
        });

        await framework.runTest('Meal Duration Input', async (page) => {
            const result = await page.evaluate(() => {
                const input = document.getElementById('avgMealDuration');
                if (!input) return { error: 'Input not found' };

                const originalValue = input.value;
                input.value = '45';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));

                return {
                    inputExists: true,
                    originalValue,
                    newValue: input.value,
                    valueSet: input.value === '45'
                };
            });

            if (!result.inputExists) throw new Error('Meal duration input not found');
            if (!result.valueSet) throw new Error('Failed to set meal duration value');

            return result;
        });

        await framework.runTest('Mealtime List Display', async (page) => {
            const result = await page.evaluate(() => {
                const list = document.getElementById('mealtimeList');
                if (!list) return { error: 'Mealtime list not found' };

                const items = list.querySelectorAll('.mealtime-item');
                return {
                    listExists: true,
                    itemCount: items.length,
                    hasItems: items.length > 0
                };
            });

            if (!result.listExists) throw new Error('Mealtime list not found');

            return result;
        });

        await framework.runTest('User Settings Persistence', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    userSettingsExists: !!window.userSettings,
                    sessionIdSet: !!window.getSessionId(),
                    settingsLoaded: true
                };
            });

            if (!result.sessionIdSet) throw new Error('Session ID not available');

            return result;
        });

        const report = framework.generateReport();

        if (report.failed === 0) {
            console.log('\n🎉 ALL SETTINGS TESTS PASSED!');
        } else {
            console.log(`\n⚠️  ${report.failed} settings tests failed`);
        }

        return report;

    } catch (error) {
        console.error('Settings test suite failed:', error);
        throw error;
    } finally {
        await framework.teardown();
    }
}

// Run tests if called directly
if (require.main === module) {
    runSettingsTests().then(report => {
        process.exit(report.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
}

module.exports = runSettingsTests;