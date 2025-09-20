/**
 * Dashboard Page Test Suite
 * Comprehensive testing for dashboard functionality, tabs, stats, and session management
 */

const FastingForecastTestFramework = require('./TestFramework');

async function runDashboardTests() {
    const framework = new FastingForecastTestFramework({
        headless: true,
        verbose: false
    });

    try {
        await framework.setup();
        await framework.navigateToPage('/dashboard.html');

        console.log('🔍 DASHBOARD PAGE TEST SUITE');
        console.log('='.repeat(40));

        // Core tests
        await framework.runCoreTests();

        // Dashboard-specific tests
        await framework.runTest('Dashboard Layout Elements', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    hasDashboardCard: !!document.querySelector('.dashboard-card'),
                    hasHeader: !!document.querySelector('.header'),
                    hasSubNav: !!document.querySelector('.sub-nav'),
                    hasLogTab: !!document.querySelector('[data-tab="log"]'),
                    hasBenefitsTab: !!document.querySelector('[data-tab="benefits"]'),
                    hasPhotosTab: !!document.querySelector('[data-tab="photos"]')
                };
            });

            if (!result.hasDashboardCard) throw new Error('Dashboard card not found');
            if (!result.hasSubNav) throw new Error('Sub navigation not found');

            return result;
        });

        await framework.runTest('Stats Display', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    totalFasts: document.getElementById('total-fasts')?.textContent || 'missing',
                    currentStreak: document.getElementById('current-streak')?.textContent || 'missing',
                    totalHours: document.getElementById('total-hours')?.textContent || 'missing',
                    statsLoaded: document.getElementById('total-fasts')?.textContent !== '-'
                };
            });

            if (result.totalFasts === 'missing') throw new Error('Total fasts stat not found');
            if (result.currentStreak === 'missing') throw new Error('Current streak stat not found');
            if (result.totalHours === 'missing') throw new Error('Total hours stat not found');

            return result;
        });

        // Test tab switching between Log and Benefits
        await framework.testTabSwitching(['log', 'benefits']);

        await framework.runTest('Benefits Tab Functionality', async (page) => {
            // Switch to benefits tab
            await page.click('[data-tab="benefits"]');
            await new Promise(resolve => setTimeout(resolve, 2000));

            const result = await page.evaluate(() => {
                return {
                    benefitsHero: !!document.querySelector('.benefits-hero'),
                    timeframeToggle: !!document.querySelector('.timeframe-toggle'),
                    moneySavedElement: !!document.getElementById('total-money-saved'),
                    timeReclaimedElement: !!document.getElementById('total-time-reclaimed'),
                    benefitsDataService: !!window.benefitsDataService
                };
            });

            if (!result.benefitsHero) throw new Error('Benefits hero section not found');
            if (!result.timeframeToggle) throw new Error('Timeframe toggle not found');

            return result;
        });

        await framework.runTest('Add Fast Modal', async (page) => {
            // Switch back to log tab first
            await page.click('[data-tab="log"]');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Click add fast button
            await page.click('.add-fast-btn');
            await new Promise(resolve => setTimeout(resolve, 500));

            const result = await page.evaluate(() => {
                const modal = document.getElementById('add-fast-modal');
                return {
                    modalVisible: modal && window.getComputedStyle(modal).display !== 'none',
                    hasForm: !!document.getElementById('add-fast-form'),
                    hasStartDate: !!document.getElementById('start-date'),
                    hasStartTime: !!document.getElementById('start-time'),
                    hasEndDate: !!document.getElementById('end-date'),
                    hasEndTime: !!document.getElementById('end-time')
                };
            });

            if (!result.modalVisible) throw new Error('Add fast modal not visible');
            if (!result.hasForm) throw new Error('Add fast form not found');

            // Close modal
            await page.click('.modal-close');
            await new Promise(resolve => setTimeout(resolve, 500));

            return result;
        });

        await framework.runTest('Active Fast Section', async (page) => {
            const result = await page.evaluate(() => {
                const activeFastSection = document.getElementById('activeFastSection');
                return {
                    sectionExists: !!activeFastSection,
                    isHidden: activeFastSection?.classList.contains('hidden'),
                    hasHungerCard: !!document.getElementById('dashboardHungerCard'),
                    hasBenefitsCard: !!document.getElementById('dashboardBenefitsCard'),
                    hasCardRotationManager: !!window.dashboardCardRotationManager
                };
            });

            if (!result.sectionExists) throw new Error('Active fast section not found');

            return result;
        });

        const report = framework.generateReport();

        if (report.failed === 0) {
            console.log('\n🎉 ALL DASHBOARD TESTS PASSED!');
        } else {
            console.log(`\n⚠️  ${report.failed} dashboard tests failed`);
        }

        return report;

    } catch (error) {
        console.error('Dashboard test suite failed:', error);
        throw error;
    } finally {
        await framework.teardown();
    }
}

// Run tests if called directly
if (require.main === module) {
    runDashboardTests().then(report => {
        process.exit(report.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
}

module.exports = runDashboardTests;