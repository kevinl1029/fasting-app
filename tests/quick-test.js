/**
 * Quick Test Runner
 * Runs a fast subset of tests for rapid development feedback
 */

const FastingForecastTestFramework = require('./TestFramework');

async function runQuickTests() {
    console.log('⚡ QUICK TEST SUITE - Core Functionality Check');
    console.log('='.repeat(50));

    const framework = new FastingForecastTestFramework({
        headless: true,
        verbose: false
    });

    try {
        await framework.setup();

        const pages = [
            { path: '/timer.html', name: 'Timer' },
            { path: '/dashboard.html', name: 'Dashboard' },
            { path: '/settings.html', name: 'Settings' },
            { path: '/schedule.html', name: 'Schedule' }
        ];

        for (const page of pages) {
            console.log(`\n🔍 Testing ${page.name} page...`);
            await framework.navigateToPage(page.path);

            // Run only core tests for speed
            await framework.testSessionManagement();
            await framework.testPageLoad();
            await framework.testNoInfiniteSpinners();

            console.log(`✅ ${page.name} core functionality verified`);
        }

        const report = framework.generateReport();

        if (report.failed === 0) {
            console.log('\n🎉 QUICK TESTS PASSED! Core functionality is working.');
            console.log('💡 Run "npm run test" for comprehensive testing.');
        } else {
            console.log(`\n⚠️  ${report.failed} quick tests failed.`);
        }

        return report;

    } catch (error) {
        console.error('Quick test failed:', error);
        throw error;
    } finally {
        await framework.teardown();
    }
}

// Run if called directly
if (require.main === module) {
    runQuickTests().then(report => {
        process.exit(report.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('Quick test error:', error);
        process.exit(1);
    });
}

module.exports = runQuickTests;