/**
 * Timer Page Test Suite
 * Comprehensive testing for timer functionality, session management, and UI interactions
 */

const FastingForecastTestFramework = require('./TestFramework');

async function runTimerTests() {
    const framework = new FastingForecastTestFramework({
        headless: true,
        verbose: false
    });

    try {
        await framework.setup();
        await framework.navigateToPage('/timer.html');

        console.log('🔍 TIMER PAGE TEST SUITE');
        console.log('='.repeat(40));

        // Core tests
        await framework.runCoreTests();

        // Timer-specific tests
        await framework.runTest('Timer Display Elements', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    hasElapsedTime: !!document.getElementById('timerDisplay'),
                    hasStartTime: !!document.querySelector('.start-time-section'),
                    hasTimerContainer: !!document.querySelector('.timer-display'),
                    hasStartButton: !!document.getElementById('start-timer-btn'),
                    hasEndButton: !!document.getElementById('end-timer-btn')
                };
            });

            if (!result.hasElapsedTime) throw new Error('Elapsed time display not found');
            if (!result.hasStartTime) throw new Error('Start time display not found');
            if (!result.hasTimerContainer) throw new Error('Timer container not found');

            return result;
        });

        await framework.runTest('Timer State Persistence', async (page) => {
            const result = await page.evaluate(() => {
                const timerState = localStorage.getItem('fastingForecast_timerState');
                return {
                    hasTimerState: !!timerState,
                    timerStateValid: timerState ? (() => {
                        try {
                            const parsed = JSON.parse(timerState);
                            return !!(parsed.fastStartTime || parsed.currentFastId);
                        } catch {
                            return false;
                        }
                    })() : false
                };
            });

            return result;
        });

        await framework.runTest('Card System Functionality', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    hasHungerCard: !!document.getElementById('hunger-coach-card'),
                    hasBenefitsCard: !!document.getElementById('benefits-card'),
                    cardRotationManager: !!window.cardRotationManager,
                    hungerCoachLoaded: !!window.HungerCoach
                };
            });

            return result;
        });

        // Test timer button interactions (if no active fast)
        await framework.runTest('Timer Button States', async (page) => {
            const result = await page.evaluate(() => {
                const startBtn = document.getElementById('start-timer-btn');
                const endBtn = document.getElementById('end-timer-btn');

                return {
                    startButtonVisible: startBtn && window.getComputedStyle(startBtn).display !== 'none',
                    endButtonVisible: endBtn && window.getComputedStyle(endBtn).display !== 'none',
                    startButtonEnabled: startBtn && !startBtn.disabled,
                    endButtonEnabled: endBtn && !endBtn.disabled
                };
            });

            return result;
        });

        const report = framework.generateReport();

        if (report.failed === 0) {
            console.log('\n🎉 ALL TIMER TESTS PASSED!');
        } else {
            console.log(`\n⚠️  ${report.failed} timer tests failed`);
        }

        return report;

    } catch (error) {
        console.error('Timer test suite failed:', error);
        throw error;
    } finally {
        await framework.teardown();
    }
}

// Run tests if called directly
if (require.main === module) {
    runTimerTests().then(report => {
        process.exit(report.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
}

module.exports = runTimerTests;