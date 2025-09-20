# Fasting Forecast Test Suite

A comprehensive end-to-end testing framework for the Fasting Forecast application, designed to ensure robust functionality across all core pages and features.

## Overview

This test suite was developed based on real-world debugging sessions where session management race conditions were causing critical bugs across multiple pages. The framework provides:

- 🔒 **Session Management Testing** - Ensures bulletproof session handling
- 🎯 **Page-Specific Tests** - Comprehensive coverage for each core page
- 🧪 **Reusable Framework** - Consistent testing patterns across the application
- 📊 **Detailed Reporting** - Clear test results and failure diagnostics
- ⚡ **Fast Execution** - Optimized for development workflow

## Quick Start

```bash
# Install dependencies (includes Puppeteer for browser automation)
npm install

# Run all tests
npm run test

# Run specific page tests
npm run test:timer
npm run test:dashboard
npm run test:settings
npm run test:schedule

# Validate everything (duplicates + tests)
npm run validate
```

## Test Suite Architecture

### Core Framework (`TestFramework.js`)

The `FastingForecastTestFramework` class provides:

- **Browser Management** - Puppeteer setup with notifications permissions
- **Session Management** - Automatic session ID setup and validation
- **Test Utilities** - Reusable test functions for common patterns
- **Result Tracking** - Comprehensive test result collection and reporting

### Test Patterns

Each test follows this pattern:

```javascript
await framework.runTest('Test Name', async (page) => {
    const result = await page.evaluate(() => {
        // Browser-side testing logic
        return { /* test results */ };
    });

    if (!result.expectedCondition) {
        throw new Error('Test failure message');
    }

    return result;
});
```

## Core Test Categories

### 1. Session Management Tests

Validates that all pages properly handle session initialization:

```javascript
await framework.testSessionManagement();
```

**Checks:**
- ✅ `window.getSessionId()` function available
- ✅ Session ID properly set
- ✅ `window.pageGuard` available globally
- ✅ Page guard ready state

### 2. Page Load Tests

Ensures pages load correctly without race conditions:

```javascript
await framework.testPageLoad();
```

**Checks:**
- ✅ Main content elements present
- ✅ Navigation loaded
- ✅ Document ready state complete
- ✅ No critical JavaScript errors

### 3. No Infinite Spinners

Validates that loading states resolve properly:

```javascript
await framework.testNoInfiniteSpinners();
```

**Checks:**
- ✅ No visible loading spinners after page load
- ✅ Proper loading state management
- ✅ Content displays instead of infinite loading

### 4. Page-Specific Functionality

Each page has custom tests for its unique features:

#### Timer Page (`timer.test.js`)
- Timer display elements
- Start/end button states
- Card system functionality
- Timer state persistence

#### Dashboard Page (`dashboard.test.js`)
- Tab switching (Log ↔ Benefits)
- Stats display and loading
- Add Fast modal functionality
- Active fast section management

#### Settings Page (`settings.test.js`)
- Hunger coach toggle persistence
- Benefits toggle functionality
- Input field validation
- Mealtime list display

#### Schedule Page (`schedule.test.js`)
- Schedule content loading
- Empty state vs content display
- Fast schedule interactions
- No infinite loading states

## Integration with Development Workflow

### Pre-commit Testing

```bash
# Automatically run before commits
npm run precommit
```

### CI/CD Integration

```bash
# For CI/CD pipelines
npm run test:ci
```

Generates `test-results.json` with detailed results for build systems.

### Feature Development Workflow

1. **Before Starting**: Run `npm run test` to ensure baseline
2. **During Development**: Run specific page tests as you work
3. **Before Committing**: Run `npm run validate` to check everything
4. **After Major Changes**: Run full test suite

## Test Results Format

Tests generate comprehensive reports:

```
📊 COMPREHENSIVE TEST REPORT
============================================================
Total Test Suites: 4
Total Tests: 28
Passed: 28 ✅
Failed: 0 ❌
Success Rate: 100.0%
Total Duration: 15.23s

📋 PER-PAGE BREAKDOWN
----------------------------------------
✅ TIMER: 7/7 (100.0%)
✅ DASHBOARD: 8/8 (100.0%)
✅ SETTINGS: 7/7 (100.0%)
✅ SCHEDULE: 6/6 (100.0%)

🎉 ALL TESTS PASSED! Your application is working perfectly! 🎉
```

## Common Test Scenarios

### Testing New Features

When adding new features, extend existing test files:

```javascript
await framework.runTest('New Feature Test', async (page) => {
    // Test your new feature
    const result = await page.evaluate(() => {
        return {
            featureWorks: !!document.querySelector('.new-feature'),
            functionalityCorrect: /* validation logic */
        };
    });

    if (!result.featureWorks) {
        throw new Error('New feature not working');
    }

    return result;
});
```

### Testing UI Interactions

```javascript
await framework.testToggleFunctionality('#my-toggle');
await framework.testFormFunctionality('#my-form', {
    field1: 'test value',
    field2: 'another value'
});
```

### Testing Tab Navigation

```javascript
await framework.testTabSwitching(['tab1', 'tab2', 'tab3']);
```

## Configuration Options

Customize the test framework:

```javascript
const framework = new FastingForecastTestFramework({
    headless: false,          // Show browser during tests
    verbose: true,            // Log all console messages
    timeout: 15000,           // Increase timeout for slow tests
    sessionId: 'custom_id',   // Use specific session ID
    waitTime: 5000            // Longer wait for slow pages
});
```

## Debugging Test Failures

### Common Issues and Solutions

1. **Session Management Failures**
   ```
   Error: Session ID function not available
   ```
   - Check that `session-manager.js` is loaded
   - Verify `window.pageGuard` is assigned globally

2. **Element Not Found**
   ```
   Error: Toggle not found
   ```
   - Increase wait time for slow loading
   - Check element selectors are correct
   - Verify element is actually rendered

3. **Infinite Spinners**
   ```
   Error: Found 1 visible spinners
   ```
   - Check that loading states are properly managed
   - Verify session management fixes are applied

### Running Tests in Debug Mode

```bash
# Run with browser visible
node -e "
const Framework = require('./tests/TestFramework');
const f = new Framework({ headless: false, verbose: true });
// Your debug code here
"
```

## Best Practices

### Writing Tests

1. **Use Descriptive Names** - Test names should clearly indicate what's being tested
2. **Test One Thing** - Each test should focus on a single concern
3. **Provide Good Error Messages** - Make failures easy to understand
4. **Use Framework Utilities** - Leverage existing test patterns

### Maintaining Tests

1. **Update Tests with Features** - Keep tests in sync with code changes
2. **Review Test Failures** - Don't ignore failing tests
3. **Refactor Common Patterns** - Extract reusable test utilities
4. **Document New Patterns** - Update this README for new test types

## Test Coverage

Current test coverage includes:

### Session Management (All Pages)
- ✅ Session initialization
- ✅ Global session access
- ✅ Race condition prevention

### Timer Page
- ✅ Display elements
- ✅ Button states
- ✅ Card system
- ✅ State persistence

### Dashboard Page
- ✅ Tab navigation
- ✅ Stats loading
- ✅ Modal functionality
- ✅ Active fast display

### Settings Page
- ✅ Toggle persistence
- ✅ Form inputs
- ✅ User preferences
- ✅ Mealtime management

### Schedule Page
- ✅ Content loading
- ✅ State management
- ✅ Empty states
- ✅ Fast scheduling

## Contributing

When adding new tests:

1. Follow existing patterns in the test files
2. Use the framework utilities when possible
3. Add documentation for new test types
4. Update npm scripts if needed
5. Test your tests! 😄

## Performance

Test suite performance metrics:
- **Average Runtime**: ~15-20 seconds for full suite
- **Per-Page Tests**: ~3-5 seconds each
- **Memory Usage**: Minimal impact on development
- **Parallelization**: Tests run sequentially for stability

The test suite is optimized for development speed while maintaining comprehensive coverage.

---

## Need Help?

If you encounter issues with the test framework:

1. Check this README for common solutions
2. Look at existing test files for patterns
3. Run tests in non-headless mode for debugging
4. Check test output for specific error messages

Happy testing! 🧪✨