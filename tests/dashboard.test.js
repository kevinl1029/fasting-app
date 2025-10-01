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
            const switched = await page.evaluate(() => {
                const benefitsTab = document.querySelector('[data-tab="benefits"]');
                if (!benefitsTab || benefitsTab.classList.contains('disabled')) {
                    return false;
                }
                benefitsTab.click();
                return true;
            });

            if (!switched) {
                throw new Error('Benefits tab not available');
            }

            await page.waitForFunction(() => {
                const benefitsButton = document.querySelector('[data-tab="benefits"]');
                const benefitsPanel = document.getElementById('benefits-tab');
                return benefitsButton?.classList.contains('active') && benefitsPanel?.classList.contains('active');
            }, { timeout: 5000 });

            await page.waitForTimeout(1000);

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
            // Switch back to log tab first and wait for activation
            await page.evaluate(() => {
                const logTab = document.querySelector('.sub-nav-item[data-tab="log"]');
                if (logTab) {
                    logTab.click();
                }
            });

            await page.waitForFunction(() => {
                const logTabButton = document.querySelector('.sub-nav-item[data-tab="log"]');
                const logTabContent = document.getElementById('log-tab');
                return logTabButton?.classList.contains('active') && logTabContent?.classList.contains('active');
            }, { timeout: 5000 });

            // Ensure the filter is set to fasts so the primary action opens the modal directly
            await page.evaluate(() => {
                const fastFilter = document.querySelector('.log-filter-btn[data-log-filter="fasts"]');
                if (fastFilter && !fastFilter.classList.contains('active')) {
                    fastFilter.click();
                }
            });

            await page.waitForFunction(() => {
                const fastFilter = document.querySelector('.log-filter-btn[data-log-filter="fasts"]');
                return fastFilter?.classList.contains('active');
            }, { timeout: 5000 });

            // Ensure the primary action is present and clickable
            await page.waitForSelector('#log-primary-action', { visible: true, timeout: 8000 });
            await page.evaluate(() => {
                const button = document.getElementById('log-primary-action');
                if (button) {
                    button.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
                }
            });

            // Click add fast button
            const opened = await page.evaluate(() => {
                const primaryAction = document.getElementById('log-primary-action');
                if (!primaryAction) {
                    return false;
                }
                primaryAction.click();
                return true;
            });

            if (!opened) {
                throw new Error('Primary log action button not found');
            }

            await page.waitForSelector('#add-fast-modal.active', { visible: true, timeout: 5000 });

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
            const closed = await page.evaluate(() => {
                const closeBtn = document.querySelector('#add-fast-modal .modal-close');
                if (!closeBtn) {
                    return false;
                }
                closeBtn.click();
                return true;
            });

            if (!closed) {
                throw new Error('Modal close button not found');
            }
            await page.waitForSelector('#add-fast-modal.active', { hidden: true, timeout: 5000 });

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
