/**
 * Fasting Forecast Test Framework
 *
 * A comprehensive testing framework for end-to-end testing of the Fasting Forecast application.
 * Based on successful patterns developed during session management fixes.
 */

const puppeteer = require('puppeteer');

class FastingForecastTestFramework {
    constructor(options = {}) {
        this.options = {
            headless: options.headless ?? true,
            timeout: options.timeout ?? 10000,
            sessionId: options.sessionId ?? 'fs_1758256447228_me25dyacv',
            baseUrl: options.baseUrl ?? 'http://localhost:3000',
            waitTime: options.waitTime ?? 3000,
            ...options
        };

        this.browser = null;
        this.page = null;
        this.testResults = [];
    }

    async setup() {
        console.log('🚀 Setting up Fasting Forecast Test Framework...');

        this.browser = await puppeteer.launch({
            headless: this.options.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        this.page = await this.browser.newPage();

        await this.page.evaluateOnNewDocument((sessionId) => {
            try {
                localStorage.setItem('fastingForecast_sessionId', sessionId);
                localStorage.setItem('fastingForecast_profileSaved', 'true');
            } catch (error) {
                console.warn('Unable to seed session storage before navigation:', error);
            }
        }, this.options.sessionId);

        // Grant notification permissions
        const context = this.browser.defaultBrowserContext();
        await context.overridePermissions(this.options.baseUrl, ['notifications']);

        // Set up console and error logging
        this.page.on('console', msg => {
            // Show all console messages for debugging
            console.log(`[${msg.type().toUpperCase()}]`, msg.text());
        });

        this.page.on('pageerror', error => {
            console.log('PAGE ERROR:', error.message);
        });

        console.log('✅ Test framework setup complete');
    }

    async teardown() {
        if (this.browser) {
            await this.browser.close();
            console.log('🧹 Test framework teardown complete');
        }
    }

    async navigateToPage(pagePath) {
        console.log(`📍 Navigating to ${pagePath}...`);

        await this.page.goto(`${this.options.baseUrl}${pagePath}`, {
            waitUntil: 'networkidle0',
            timeout: this.options.timeout
        });

        // Set session ID for authenticated testing
        await this.page.evaluate((sessionId) => {
            localStorage.setItem('fastingForecast_sessionId', sessionId);
            localStorage.setItem('fastingForecast_profileSaved', 'true');
        }, this.options.sessionId);

        // Reload with session
        await this.page.reload({ waitUntil: 'networkidle0' });
        await new Promise(resolve => setTimeout(resolve, this.options.waitTime));

        console.log(`✅ Successfully loaded ${pagePath}`);
    }

    async runTest(testName, testFunction) {
        console.log(`\n🧪 Running test: ${testName}`);
        const startTime = Date.now();

        try {
            const result = await testFunction(this.page);
            const duration = Date.now() - startTime;

            this.testResults.push({
                name: testName,
                status: 'PASS',
                duration,
                result
            });

            console.log(`✅ ${testName} - PASSED (${duration}ms)`);
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;

            this.testResults.push({
                name: testName,
                status: 'FAIL',
                duration,
                error: error.message
            });

            console.log(`❌ ${testName} - FAILED (${duration}ms)`);
            console.log(`   Error: ${error.message}`);
            throw error;
        }
    }

    // Core test utilities
    async testSessionManagement() {
        return await this.runTest('Session Management', async (page) => {
            // Wait a reasonable time for page initialization to complete
            await new Promise(resolve => setTimeout(resolve, 3000));

            const result = await page.evaluate(() => {
                return {
                    sessionIdFunction: typeof window.getSessionId === 'function',
                    sessionIdValue: window.getSessionId ? window.getSessionId() : null,
                    sessionManagerAvailable: !!window.FastingForecastSessionManager,
                    sessionFetchAvailable: typeof window.sessionFetch === 'function'
                };
            });

            if (!result.sessionIdFunction) throw new Error('Session ID function not available');
            if (!result.sessionIdValue) throw new Error('Session ID not set');
            if (!result.sessionManagerAvailable) throw new Error('Session manager not available');

            return result;
        });
    }

    async testPageLoad() {
        return await this.runTest('Page Load', async (page) => {
            const result = await page.evaluate(() => {
                return {
                    title: document.title,
                    hasMainContent: !!document.querySelector('.dashboard-card, .timer-card, .container'),
                    hasNavigation: !!document.querySelector('.bottom-nav'),
                    bodyLoaded: document.readyState === 'complete'
                };
            });

            if (!result.hasMainContent) throw new Error('Main content not loaded');
            if (!result.bodyLoaded) throw new Error('Page not fully loaded');

            return result;
        });
    }

    async testNoInfiniteSpinners() {
        return await this.runTest('No Infinite Spinners', async (page) => {
            const result = await page.evaluate(() => {
                const spinners = document.querySelectorAll('.loading-spinner, .spinner, [class*="spin"]');
                const visibleSpinners = [];

                spinners.forEach(spinner => {
                    if (spinner.offsetParent !== null) {
                        visibleSpinners.push({
                            className: spinner.className,
                            id: spinner.id || 'no-id',
                            parent: spinner.parentElement?.className || 'no-parent'
                        });
                    }
                });

                return {
                    totalSpinners: spinners.length,
                    visibleSpinners: visibleSpinners.length,
                    spinnerDetails: visibleSpinners
                };
            });

            if (result.visibleSpinners > 0) {
                throw new Error(`Found ${result.visibleSpinners} visible spinners: ${JSON.stringify(result.spinnerDetails)}`);
            }

            return result;
        });
    }

    async testNavigationFunctionality() {
        return await this.runTest('Navigation Functionality', async (page) => {
            const result = await page.evaluate(() => {
                const navItems = document.querySelectorAll('.nav-item');
                const activeItem = document.querySelector('.nav-item.active');

                return {
                    navItemCount: navItems.length,
                    hasActiveItem: !!activeItem,
                    activeItemHref: activeItem?.getAttribute('href'),
                    activeItemText: activeItem?.querySelector('.nav-label')?.textContent
                };
            });

            if (result.navItemCount === 0) throw new Error('No navigation items found');

            return result;
        });
    }

    async seedForecastProfile(overrides = {}) {
        const sessionId = this.options.sessionId;
        const weight = overrides.weight ?? 180;
        const weightUnit = overrides.weightUnit ?? 'lb';
        const bodyFat = overrides.bodyFat ?? 28;
        const targetBodyFat = overrides.targetBodyFat ?? 18;
        const activityLevel = overrides.activityLevel ?? 1.375;
        const weeks = overrides.weeks ?? 8;
        const startDate = overrides.startDate ?? new Date().toISOString().split('T')[0];
        const goalDate = overrides.goalDate ?? this._addDaysAsIso(startDate, weeks * 7);
        const protocol = Object.assign({ duration: 36, ketosis: false, frequency: 2 }, overrides.currentProtocol);

        const weightKg = weightUnit === 'lb' ? weight * 0.453592 : weight;
        const weeklyResults = this._generateWeeklyResults({ startDate, weeks, weightKg, bodyFat });
        const summary = {
            totalWeeks: weeks,
            finalWeight: weeklyResults[weeklyResults.length - 1].weight,
            finalBodyFat: weeklyResults[weeklyResults.length - 1].bodyFat,
            totalFatLost: Number((weightKg * (bodyFat / 100) - (weeklyResults[weeklyResults.length - 1].fatMass)).toFixed(2)),
            totalFFMLost: Number(((weightKg * (1 - bodyFat / 100)) - weeklyResults[weeklyResults.length - 1].fatFreeMass).toFixed(2)),
            totalWeightLost: Number((weightKg - weeklyResults[weeklyResults.length - 1].weight).toFixed(2))
        };

        const forecastData = Object.assign({
            weeks,
            fastingBlocks: overrides.fastingBlocks || this._protocolToBlocks(protocol),
            ketosisStates: overrides.ketosisStates || this._protocolToKetosisStates(protocol),
            fastingExperience: overrides.fastingExperience || 'intermediate',
            insulinSensitivity: overrides.insulinSensitivity || 'normal',
            startDate,
            currentProtocol: protocol,
            results: {
                weeklyResults,
                summary
            }
        }, overrides.forecastData || {});

        const profilePayload = {
            sessionId,
            weight,
            weightUnit,
            bodyFat,
            targetBodyFat,
            activityLevel,
            goalDate,
            forecastData
        };

        await this.page.evaluate(async (payload) => {
            await fetch('/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }, profilePayload);

        await this.page.waitForTimeout(300);
    }

    _addDaysAsIso(baseDate, days) {
        const [year, month, day] = baseDate.split('-').map(Number);
        const date = new Date(year, month - 1, day + days);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    _generateWeeklyResults({ startDate, weeks, weightKg, bodyFat }) {
        const results = [];
        let currentWeight = weightKg;
        let currentBodyFat = bodyFat;
        let currentFatMass = currentWeight * (currentBodyFat / 100);
        let currentFFM = currentWeight - currentFatMass;

        for (let week = 0; week <= weeks; week++) {
            const date = this._addDaysAsIso(startDate, week * 7);
            const totalWeightLoss = week === 0 ? 0 : Number((week * 0.53).toFixed(2));
            const weeklyFatLoss = week === 0 ? 0 : Number(0.45.toFixed(2));
            const weeklyFFMLoss = week === 0 ? 0 : Number(0.08.toFixed(2));

            results.push({
                week,
                date,
                weight: Number(currentWeight.toFixed(2)),
                bodyFat: Number(currentBodyFat.toFixed(2)),
                fatMass: Number(currentFatMass.toFixed(2)),
                fatFreeMass: Number(currentFFM.toFixed(2)),
                weeklyFatLoss,
                weeklyFFMLoss,
                totalWeightLoss,
                ketosisPhase: 'optimalKetosis',
                proteinMaintenance: 120,
                ffmPreservation: 35
            });

            if (week < weeks) {
                currentWeight -= 0.53;
                currentFatMass -= 0.45;
                currentFFM -= 0.08;
                currentBodyFat = (currentFatMass / currentWeight) * 100;
            }
        }

        return results;
    }

    _protocolToBlocks(protocol) {
        const blocks = [0, 0, 0];
        for (let i = 0; i < Math.min(protocol.frequency || 1, blocks.length); i++) {
            blocks[i] = protocol.duration || 24;
        }
        return blocks;
    }

    _protocolToKetosisStates(protocol) {
        const states = [false, false, false];
        for (let i = 0; i < Math.min(protocol.frequency || 1, states.length); i++) {
            states[i] = Boolean(protocol.ketosis);
        }
        return states;
    }

    async testTabSwitching(tabs) {
        return await this.runTest('Tab Switching', async (page) => {
            const results = {};

            for (const tab of tabs) {
                await page.waitForSelector(`[data-tab="${tab}"]`, { visible: true, timeout: 5000 });

                const clicked = await page.evaluate((tabName) => {
                    const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
                    if (!tabButton) {
                        return false;
                    }
                    tabButton.click();
                    return true;
                }, tab);

                if (!clicked) {
                    throw new Error(`Tab ${tab} not found`);
                }

                await page.waitForFunction((tabName) => {
                    const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
                    const tabContent = document.getElementById(`${tabName}-tab`);
                    return tabButton?.classList.contains('active') && tabContent?.classList.contains('active');
                }, { timeout: 5000 }, tab);

                const tabState = await page.evaluate((tabName) => {
                    const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
                    const tabContent = document.getElementById(`${tabName}-tab`);

                    return {
                        buttonActive: tabButton?.classList.contains('active'),
                        contentVisible: tabContent?.classList.contains('active')
                    };
                }, tab);

                results[tab] = tabState;
            }

            return results;
        });
    }

    async testFormFunctionality(formSelector, testData) {
        return await this.runTest('Form Functionality', async (page) => {
            // Fill form fields
            for (const [field, value] of Object.entries(testData)) {
                await page.type(`${formSelector} [name="${field}"]`, value);
            }

            // Test form validation and submission readiness
            const formState = await page.evaluate((selector) => {
                const form = document.querySelector(selector);
                const inputs = form.querySelectorAll('input[required]');
                let allValid = true;

                inputs.forEach(input => {
                    if (!input.value.trim()) allValid = false;
                });

                return {
                    formExists: !!form,
                    requiredFieldsFilled: allValid,
                    submitButtonEnabled: !form.querySelector('button[type="submit"]')?.disabled
                };
            }, formSelector);

            if (!formState.formExists) throw new Error('Form not found');
            if (!formState.requiredFieldsFilled) throw new Error('Required fields not filled');

            return formState;
        });
    }

    async testToggleFunctionality(toggleSelector) {
        return await this.runTest('Toggle Functionality', async (page) => {
            const initialState = await page.evaluate((selector) => {
                const toggle = document.querySelector(selector);
                return {
                    exists: !!toggle,
                    active: toggle?.classList.contains('active') || toggle?.checked
                };
            }, toggleSelector);

            if (!initialState.exists) throw new Error('Toggle not found');

            // Click toggle
            await page.click(toggleSelector);
            await new Promise(resolve => setTimeout(resolve, 1000));

            const newState = await page.evaluate((selector) => {
                const toggle = document.querySelector(selector);
                return toggle?.classList.contains('active') || toggle?.checked;
            }, toggleSelector);

            if (initialState.active === newState) {
                throw new Error('Toggle state did not change');
            }

            return {
                initialState: initialState.active,
                newState,
                changed: true
            };
        });
    }

    // Convenience method to run all core tests
    async runCoreTests() {
        console.log('\n🎯 Running Core Test Suite...');

        const results = {
            sessionManagement: await this.testSessionManagement(),
            pageLoad: await this.testPageLoad(),
            noInfiniteSpinners: await this.testNoInfiniteSpinners(),
            navigation: await this.testNavigationFunctionality()
        };

        return results;
    }

    // Generate test report
    generateReport() {
        const passed = this.testResults.filter(t => t.status === 'PASS');
        const failed = this.testResults.filter(t => t.status === 'FAIL');
        const totalDuration = this.testResults.reduce((sum, t) => sum + t.duration, 0);

        console.log('\n📊 TEST REPORT');
        console.log('='.repeat(50));
        console.log(`Total Tests: ${this.testResults.length}`);
        console.log(`Passed: ${passed.length} ✅`);
        console.log(`Failed: ${failed.length} ❌`);
        console.log(`Total Duration: ${totalDuration}ms`);
        console.log(`Success Rate: ${((passed.length / this.testResults.length) * 100).toFixed(1)}%`);

        if (failed.length > 0) {
            console.log('\n❌ Failed Tests:');
            failed.forEach(test => {
                console.log(`  - ${test.name}: ${test.error}`);
            });
        }

        return {
            total: this.testResults.length,
            passed: passed.length,
            failed: failed.length,
            duration: totalDuration,
            successRate: (passed.length / this.testResults.length) * 100,
            details: this.testResults
        };
    }
}

module.exports = FastingForecastTestFramework;
