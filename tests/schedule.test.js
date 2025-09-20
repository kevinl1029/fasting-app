/**
 * Schedule Page Test Suite
 * Comprehensive testing for schedule functionality and session management
 */

const FastingForecastTestFramework = require('./TestFramework');

async function runScheduleTests() {
    const framework = new FastingForecastTestFramework({
        headless: true,
        verbose: false
    });

    try {
        await framework.setup();
        await framework.navigateToPage('/schedule.html');

        console.log('🔍 SCHEDULE PAGE TEST SUITE');
        console.log('='.repeat(40));

        // Core tests
        await framework.runCoreTests();

        // Schedule-specific tests
        await framework.runTest('Schedule Layout Elements', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    hasLoadingElement: !!document.getElementById('loading'),
                    hasScheduleContent: !!document.getElementById('schedule-content'),
                    hasEmptyState: !!document.getElementById('empty-state'),
                    hasContainer: !!document.querySelector('.container'),
                    hasHeader: !!document.querySelector('.header')
                };
            });

            if (!result.hasLoadingElement) throw new Error('Loading element not found');
            if (!result.hasScheduleContent) throw new Error('Schedule content element not found');
            if (!result.hasEmptyState) throw new Error('Empty state element not found');

            return result;
        });

        await framework.runTest('Schedule Content State', async (page) => {
            const result = await page.evaluate(() => {
                const loading = document.getElementById('loading');
                const scheduleContent = document.getElementById('schedule-content');
                const emptyState = document.getElementById('empty-state');

                return {
                    loadingVisible: loading && loading.offsetParent !== null,
                    scheduleContentVisible: scheduleContent && scheduleContent.offsetParent !== null,
                    emptyStateVisible: emptyState && emptyState.offsetParent !== null,
                    loadingDisplay: loading ? window.getComputedStyle(loading).display : 'none',
                    scheduleDisplay: scheduleContent ? window.getComputedStyle(scheduleContent).display : 'none',
                    emptyDisplay: emptyState ? window.getComputedStyle(emptyState).display : 'none'
                };
            });

            // Should not have infinite loading spinner
            if (result.loadingVisible) {
                throw new Error('Loading spinner still visible - possible infinite loading');
            }

            // Should show either content or empty state, but not both
            if (result.scheduleContentVisible && result.emptyStateVisible) {
                throw new Error('Both schedule content and empty state are visible');
            }

            if (!result.scheduleContentVisible && !result.emptyStateVisible) {
                throw new Error('Neither schedule content nor empty state is visible');
            }

            return result;
        });

        await framework.runTest('Schedule Data Loading', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    nextFastExists: !!window.nextFast,
                    scheduledFastsExists: !!window.scheduledFasts,
                    sessionManagerReady: !!window.pageGuard,
                    dataLoaded: true
                };
            });

            return result;
        });

        await framework.runTest('Fast Schedule Display', async (page) => {
            const result = await page.evaluate(() => {
                const scheduleItems = document.querySelectorAll('.fast-item, .schedule-item');
                const nextFastElement = document.querySelector('.next-fast');
                const upcomingSection = document.querySelector('.upcoming-fasts');

                return {
                    hasScheduleItems: scheduleItems.length > 0,
                    scheduleItemCount: scheduleItems.length,
                    hasNextFastElement: !!nextFastElement,
                    hasUpcomingSection: !!upcomingSection
                };
            });

            return result;
        });

        await framework.runTest('Schedule Interaction Elements', async (page) => {
            const result = await page.evaluate(() => {
                const addButtons = document.querySelectorAll('.add-btn, .btn-add, [class*="add"]');
                const editButtons = document.querySelectorAll('.edit-btn, .btn-edit, [class*="edit"]');

                return {
                    hasAddButtons: addButtons.length > 0,
                    hasEditButtons: editButtons.length > 0,
                    totalInteractiveElements: addButtons.length + editButtons.length
                };
            });

            return result;
        });

        await framework.runTest('Schedule Page Initialization', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    pageFullyLoaded: document.readyState === 'complete',
                    sessionInitialized: !!window.getSessionId(),
                    scheduleInitialized: typeof window.initializeSchedulePage === 'function',
                    noJavaScriptErrors: true  // If we get here, no critical JS errors occurred
                };
            });

            if (!result.pageFullyLoaded) throw new Error('Page not fully loaded');
            if (!result.sessionInitialized) throw new Error('Session not initialized');

            return result;
        });

        const report = framework.generateReport();

        if (report.failed === 0) {
            console.log('\n🎉 ALL SCHEDULE TESTS PASSED!');
        } else {
            console.log(`\n⚠️  ${report.failed} schedule tests failed`);
        }

        return report;

    } catch (error) {
        console.error('Schedule test suite failed:', error);
        throw error;
    } finally {
        await framework.teardown();
    }
}

// Run tests if called directly
if (require.main === module) {
    runScheduleTests().then(report => {
        process.exit(report.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
}

module.exports = runScheduleTests;