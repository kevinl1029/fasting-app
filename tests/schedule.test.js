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
        await framework.seedForecastProfile();
        await framework.page.reload({ waitUntil: 'networkidle0' });
        await framework.page.waitForTimeout(framework.options.waitTime);

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
                    hasDraftState: !!document.getElementById('draft-state'),
                    hasContainer: !!document.querySelector('.container')
                };
            });

            if (!result.hasLoadingElement) throw new Error('Loading element not found');
            if (!result.hasScheduleContent) throw new Error('Schedule content element not found');
            if (!result.hasEmptyState) throw new Error('Empty state element not found');
            if (!result.hasDraftState) throw new Error('Draft state container not found');

            return result;
        });

        await framework.runTest('Schedule Draft Visibility', async (page) => {
            const result = await page.evaluate(() => {
                const loading = document.getElementById('loading');
                const scheduleContent = document.getElementById('schedule-content');
                const emptyState = document.getElementById('empty-state');
                const draftState = document.getElementById('draft-state');

                return {
                    loadingVisible: loading && loading.offsetParent !== null,
                    scheduleContentVisible: scheduleContent && scheduleContent.offsetParent !== null,
                    emptyStateVisible: emptyState && emptyState.offsetParent !== null,
                    draftVisible: draftState && draftState.offsetParent !== null,
                    loadingDisplay: loading ? window.getComputedStyle(loading).display : 'none',
                    scheduleDisplay: scheduleContent ? window.getComputedStyle(scheduleContent).display : 'none',
                    emptyDisplay: emptyState ? window.getComputedStyle(emptyState).display : 'none',
                    draftDisplay: draftState ? window.getComputedStyle(draftState).display : 'none'
                };
            });

            // Should not have infinite loading spinner
            if (result.loadingVisible) {
                throw new Error('Loading spinner still visible - possible infinite loading');
            }

            if (!result.draftVisible) {
                throw new Error('Draft state should be visible for new onboarding flow');
            }

            if (result.emptyStateVisible) {
                throw new Error('Empty state should be hidden when draft is available');
            }

            return result;
        });

        await framework.runTest('Schedule Draft Actions Present', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    confirmExists: !!document.getElementById('draft-confirm-btn'),
                    customizeExists: !!document.getElementById('draft-customize-btn'),
                    dismissExists: !!document.getElementById('draft-dismiss-btn')
                };
            });

            if (!result.confirmExists) throw new Error('Draft confirm button missing');
            if (!result.dismissExists) throw new Error('Draft dismiss button missing');

            return result;
        });

        await framework.runTest('Schedule Draft Confirmation Flow', async (page) => {
            await page.click('#draft-confirm-btn');
            await page.waitForTimeout(1000);
            await page.waitForFunction(() => {
                const draftState = document.getElementById('draft-state');
                const scheduleContent = document.getElementById('schedule-content');
                return draftState && window.getComputedStyle(draftState).display === 'none' &&
                       scheduleContent && window.getComputedStyle(scheduleContent).display !== 'none';
            }, { timeout: 5000 });

            const result = await page.evaluate(() => {
                const draftState = document.getElementById('draft-state');
                const scheduleContent = document.getElementById('schedule-content');

                return {
                    draftHidden: draftState && window.getComputedStyle(draftState).display === 'none',
                    scheduleVisible: scheduleContent && window.getComputedStyle(scheduleContent).display !== 'none'
                };
            });

            if (!result.scheduleVisible) {
                throw new Error('Schedule content not visible after confirming draft');
            }

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
