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
        await framework.seedForecastProfile();
        await framework.page.reload({ waitUntil: 'networkidle0' });
        await framework.page.waitForTimeout(framework.options.waitTime);

        console.log('🔍 TIMER PAGE TEST SUITE');
        console.log('='.repeat(40));

        // Core tests
        await framework.runCoreTests();

        // Timer-specific tests
        await framework.runTest('Timer Display Elements', async (page) => {
            await page.waitForSelector('#timerDisplay', { timeout: 5000 });

            const result = await page.evaluate(() => {
                return {
                    hasElapsedTime: !!document.getElementById('timerDisplay'),
                    hasStartTime: !!document.querySelector('.start-time-section'),
                    hasTimerContainer: !!document.querySelector('.timer-display'),
                    hasStartButton: !!document.getElementById('startFastBtn'),
                    hasDraftCta: !!document.getElementById('addToScheduleBtn')
                };
            });

            if (!result.hasElapsedTime) throw new Error('Elapsed time display not found');
            if (!result.hasStartTime) throw new Error('Start time display not found');
            if (!result.hasTimerContainer) throw new Error('Timer container not found');
            if (!result.hasStartButton) throw new Error('Start button not found');
            if (!result.hasDraftCta) throw new Error('Add to schedule CTA not found');

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
                const startBtn = document.getElementById('startFastBtn');
                const endBtn = document.querySelector('button[onclick="endFast()"]');

                return {
                    startButtonVisible: startBtn && window.getComputedStyle(startBtn).display !== 'none',
                    endButtonVisible: !!endBtn,
                    startButtonEnabled: startBtn && !startBtn.disabled
                };
            });

            return result;
        });

        await framework.runTest('Timer Draft Prefill', async (page) => {
            const result = await page.evaluate(async () => {
                const startBtn = document.getElementById('startFastBtn');
                const draftBadge = document.querySelector('.draft-ready');
                const sessionId = window.getSessionId();
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

                let recommendedDuration = 24;

                const draftDuration = window.timerOnboardingController?.draft?.protocol?.durationHours;

                if (draftDuration) {
                    recommendedDuration = draftDuration;
                } else {
                    try {
                        const response = await fetch(`/api/schedule/upcoming?sessionId=${sessionId}&tz=${encodeURIComponent(tz)}`);
                        if (response.ok) {
                            const windowData = await response.json();
                            if (window.FastingForecastFastDurationResolver) {
                                const resolver = new window.FastingForecastFastDurationResolver({
                                    upcoming: windowData.upcoming,
                                    recent: windowData.recent,
                                    defaultDurationHours: windowData.defaultDurationHours,
                                    now: new Date()
                                });
                                recommendedDuration = resolver.getRecommendedDuration({ respectManual: false });
                            } else if (windowData.upcoming && windowData.upcoming.duration_hours) {
                                recommendedDuration = windowData.upcoming.duration_hours;
                            } else if (windowData.defaultDurationHours) {
                                recommendedDuration = windowData.defaultDurationHours;
                            }
                        }
                    } catch (error) {
                        console.warn('Unable to load schedule window data during test:', error);
                    }
                }

                const startButtonText = startBtn ? startBtn.textContent : '';

                return {
                    startButtonText,
                    draftApplied: !!draftBadge,
                    recommendedDuration
                };
            });

            if (!result.startButtonText.includes(`${result.recommendedDuration}h`)) {
                throw new Error(`Expected start button to include "${result.recommendedDuration}h", got "${result.startButtonText}"`);
            }

            if (!result.draftApplied) {
                throw new Error('Draft styling not applied to timer pre-fast state');
            }

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
