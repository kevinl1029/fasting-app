#!/usr/bin/env node

/**
 * Benefits Expansion Test
 * Tests the new expanded benefits functionality
 */

const TestFramework = require('./TestFramework');

async function testExpandedBenefits() {
    console.log('🧪 BENEFITS EXPANSION TEST');
    console.log('='.repeat(40));

    const framework = new TestFramework();

    try {
        await framework.setup();

        // Navigate to timer page which loads benefits components
        console.log('📍 Loading timer page...');
        await framework.page.goto('http://localhost:3000/timer.html', {
            waitUntil: 'networkidle0',
            timeout: 10000
        });

        // Test 1: Verify BenefitsCalculator loads correctly
        await framework.runTest('BenefitsCalculator Loading', async (page) => {
            const calculatorExists = await page.evaluate(() => {
                return typeof window.BenefitsCalculator !== 'undefined';
            });

            if (!calculatorExists) {
                throw new Error('BenefitsCalculator not loaded');
            }

            return { loaded: true };
        });

        // Test 2: Test new physiological benefits calculation
        await framework.runTest('Physiological Benefits Calculation', async (page) => {
            const testResults = await page.evaluate(() => {
                const calculator = new window.BenefitsCalculator();

                // Test with 12 hour fast (should trigger growth hormone and autophagy)
                const benefits = calculator.calculatePhysiologicalBenefits(12);

                return {
                    hasHormonalChanges: benefits.hormonalChanges.length > 0,
                    hasCellularHealth: benefits.cellularHealth.length > 0,
                    hasBrainBenefits: benefits.brainBenefits.length > 0,
                    hasMetabolicBenefits: benefits.metabolicBenefits.length > 0,
                    growthHormoneFound: benefits.hormonalChanges.some(h => h.type === 'growth_hormone'),
                    dnaRepairFound: benefits.cellularHealth.some(c => c.type === 'dna_repair'),
                    mentalClarityFound: benefits.brainBenefits.some(b => b.type === 'mental_clarity'),
                    fatBurningFound: benefits.metabolicBenefits.some(m => m.type === 'fat_burning')
                };
            });

            if (!testResults.hasHormonalChanges) {
                throw new Error('No hormonal changes calculated for 12h fast');
            }

            if (!testResults.growthHormoneFound) {
                throw new Error('Growth hormone benefit not found for 12h fast');
            }

            if (!testResults.dnaRepairFound) {
                throw new Error('DNA repair benefit not found for 12h fast');
            }

            return testResults;
        });

        // Test 3: Test lifestyle benefits calculation
        await framework.runTest('Lifestyle Benefits Calculation', async (page) => {
            const testResults = await page.evaluate(() => {
                const calculator = new window.BenefitsCalculator();

                // Test with 3 meals skipped, 8 hours duration
                const benefits = calculator.calculateLifestyleBenefits(3, 8);

                return {
                    hasTimeReclamation: benefits.timeReclamation.length > 0,
                    hasMentalBenefits: benefits.mentalBenefits.length > 0,
                    hasEnvironmentalImpact: benefits.environmentalImpact.length > 0,
                    mealPrepFound: benefits.timeReclamation.some(t => t.type === 'meal_prep'),
                    stressResilienceFound: benefits.mentalBenefits.some(m => m.type === 'stress_resilience'),
                    carbonFootprintFound: benefits.environmentalImpact.some(e => e.type === 'carbon_footprint')
                };
            });

            if (!testResults.hasTimeReclamation) {
                throw new Error('No time reclamation benefits calculated');
            }

            if (!testResults.mealPrepFound) {
                throw new Error('Meal prep time saving not found');
            }

            return testResults;
        });

        // Test 4: Test full benefits integration
        await framework.runTest('Full Benefits Integration', async (page) => {
            const testResults = await page.evaluate(() => {
                const calculator = new window.BenefitsCalculator();
                calculator.init();

                // Simulate 16 hour fast starting 16 hours ago
                const now = new Date();
                const fastStart = new Date(now.getTime() - (16 * 60 * 60 * 1000));

                const fullBenefits = calculator.calculateCurrentFastBenefits(fastStart.toISOString(), now);

                return {
                    hasPhysiological: !!fullBenefits.physiological,
                    hasLifestyle: !!fullBenefits.lifestyle,
                    fastDuration: fullBenefits.fastDurationHours,
                    physiologicalCount: fullBenefits.physiological ?
                        Object.values(fullBenefits.physiological).reduce((sum, arr) => sum + arr.length, 0) : 0,
                    lifestyleCount: fullBenefits.lifestyle ?
                        Object.values(fullBenefits.lifestyle).reduce((sum, arr) => sum + arr.length, 0) : 0
                };
            });

            if (!testResults.hasPhysiological) {
                throw new Error('Physiological benefits not included in full calculation');
            }

            if (!testResults.hasLifestyle) {
                throw new Error('Lifestyle benefits not included in full calculation');
            }

            if (testResults.physiologicalCount === 0) {
                throw new Error('No physiological benefits calculated for 16h fast');
            }

            if (testResults.lifestyleCount === 0) {
                throw new Error('No lifestyle benefits calculated');
            }

            return testResults;
        });

        // Test 5: Test BenefitsCard expanded displays
        await framework.runTest('BenefitsCard Expanded Displays', async (page) => {
            const testResults = await page.evaluate(() => {
                // Check if BenefitsCard class exists and can be instantiated
                if (typeof window.BenefitsCard === 'undefined') {
                    return { error: 'BenefitsCard not loaded' };
                }

                try {
                    const card = new window.BenefitsCard();

                    // Test helper methods exist
                    const hasHelperMethods = typeof card.getMoneyEquivalence === 'function' &&
                                           typeof card.getTimeActivity === 'function' &&
                                           typeof card.getHormonalExtended === 'function' &&
                                           typeof card.getCellularExtended === 'function';

                    // Test equivalence methods
                    const moneyTest = card.getMoneyEquivalence(150);
                    const timeTest = card.getTimeActivity(90);
                    const hormonalTest = card.getHormonalExtended('growth_hormone');

                    return {
                        hasHelperMethods,
                        moneyEquivalence: moneyTest,
                        timeActivity: timeTest,
                        hormonalExtended: hormonalTest,
                        success: true
                    };
                } catch (error) {
                    return { error: error.message };
                }
            });

            if (testResults.error) {
                throw new Error(`BenefitsCard test failed: ${testResults.error}`);
            }

            if (!testResults.hasHelperMethods) {
                throw new Error('BenefitsCard missing helper methods');
            }

            if (!testResults.moneyEquivalence) {
                throw new Error('Money equivalence method not working');
            }

            return testResults;
        });

        console.log('\n✅ All expanded benefits tests passed!');
        console.log('\n🎯 Key Features Verified:');
        console.log('   • Physiological benefits calculation (growth hormone, autophagy, etc.)');
        console.log('   • Lifestyle benefits calculation (meal prep time, mental bandwidth, etc.)');
        console.log('   • Full benefits integration');
        console.log('   • BenefitsCard helper methods');
        console.log('   • Extended content generation');

    } catch (error) {
        console.error('❌ Expanded benefits test failed:', error.message);
        process.exit(1);
    } finally {
        await framework.teardown();
    }
}

// Run tests if called directly
if (require.main === module) {
    testExpandedBenefits().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = testExpandedBenefits;