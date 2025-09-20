# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the "fasting-forecast" project - a web application for forecasting fat loss from water fasting. It features a Node.js/Express backend with complex metabolic calculations and a frontend web interface.

## Technology Stack

- **Backend**: Node.js with Express.js
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Dependencies**: express, cors
- **Dev Dependencies**: nodemon for development

## Development Commands

```bash
# Install dependencies
npm install

# Start production server
npm start

# Start development server with auto-restart
npm run dev
```

## Architecture

### Backend (server.js)
- Express server serving on port 3000 (configurable via PORT env var)
- Static file serving from `public/` directory
- CORS enabled for cross-origin requests
- JSON parsing middleware

### API Endpoints
- `GET /api/hello` - Health check endpoint
- `GET /api/time` - Returns current server time
- `POST /api/calculate` - Complex fasting forecast calculations with multi-phase ketosis modeling

### Calculation Engine
The `/api/calculate` endpoint implements sophisticated metabolic modeling:
- Multi-phase ketosis transitions (glycogen depletion → early → full → optimal ketosis)
- Personalized adjustments for insulin sensitivity, fasting experience, and body fat percentage
- Fat oxidation limitations for lean individuals (≤10% body fat)
- FFM preservation factors that improve with deeper ketosis states
- Weekly simulation with hour-by-hour metabolic state tracking

### Frontend (public/index.html)
- Single-page application with form-based input
- Real-time calculation results display
- Responsive design with modern CSS styling

## Project Structure

```
fasting-forecast/
├── server.js          # Express server with calculation engine
├── package.json       # Dependencies and npm scripts
├── public/
│   └── index.html     # Frontend web interface
└── README.md          # Project documentation
```

## Key Calculation Parameters

The application uses research-based constants for metabolic modeling:
- Fat energy: 7700 kcal/kg
- FFM energy: 1000 kcal/kg  
- Fat oxidation cap: 69 kcal/kg-fat/day (for lean individuals)
- Ketosis phase transitions: 16h → 24h → 48h → 72h (with personalization adjustments)
- FFM preservation improves from 0% → 40% across ketosis phases

## Testing Requirements

**IMPORTANT**: This project has a comprehensive automated testing framework. Always use the testing framework to validate changes before committing.

### Automated Testing Framework

**CRITICAL**: Use the automated testing framework for all feature development and bug fixes. The framework prevents session management race conditions and UI regressions.

#### Daily Development Workflow
```bash
# Start of coding session (verify baseline)
npm run test:quick          # 5-10 seconds - fast core functionality check

# During feature development (page-specific testing)
npm run test:timer          # Test timer page specifically
npm run test:dashboard      # Test dashboard page specifically
npm run test:settings       # Test settings page specifically
npm run test:schedule       # Test schedule page specifically

# Before committing (comprehensive validation)
npm run validate            # 20-25 seconds - full validation + duplicate checks
```

#### When to Use Each Test Command
- **`npm run test:quick`** - Daily development, fast feedback (5-10s)
- **`npm run test`** - Full comprehensive testing before important commits (15-20s)
- **`npm run validate`** - Complete validation including duplicate checks (20-25s)
- **`npm run test:timer`** - When working on timer functionality (3-5s)
- **`npm run test:dashboard`** - When working on dashboard features (3-5s)
- **`npm run test:settings`** - When working on settings functionality (3-5s)
- **`npm run test:schedule`** - When working on schedule features (3-5s)

#### Testing Workflow for Different Changes
| **Change Type** | **Recommended Command** | **Why** |
|----------------|------------------------|---------|
| **Small fixes/tweaks** | `npm run test:quick` | Fast validation of core functionality |
| **New features** | `npm run validate` | Full validation including duplicate checks |
| **Bug fixes** | `npm run test` + page-specific | Ensure fix works + no regressions |
| **Session management changes** | `npm run test` | Critical - these affect all pages |
| **UI component changes** | `npm run test:quick` + page-specific | Verify component + page integration |

#### Pre-commit Protection
The framework automatically runs `npm run test:quick` before every commit as a safety net.

### Manual Testing Guidelines (Legacy - Use Automated Tests Instead)
- **PREFER AUTOMATED TESTS**: Use `npm run test` instead of manual browser testing
- When manual testing is needed, test complete user experience at http://localhost:3000
- Consider timezone differences between server-side and client-side date handling
- Test edge cases that affect user experience (date boundaries, timezone conversions)
- Verify dates display correctly in user's timezone

### JavaScript Code Quality Checks

**Before committing changes that add new JavaScript variables:**

```bash
# Quick duplicate variable check for timer.html
npm run check-duplicates:timer

# Check specific lines after editing (efficient for large files)
npm run check-duplicates:timer "500,510-520,530"

# Full project duplicate check
npm run check-duplicates
```

**When to run duplicate checks:**
- After adding new `const`, `let`, or `var` declarations
- Before committing JavaScript changes
- When encountering "Identifier already declared" errors
- After refactoring functions with multiple variable scopes

### Testing Checklist

**ALWAYS use automated tests first** - they catch 90% of issues faster than manual testing.

#### For Any Code Changes:
- [ ] Run `npm run test:quick` (fast baseline check)
- [ ] Run page-specific tests for areas you modified
- [ ] Run `npm run validate` before committing important changes

#### For JavaScript Changes:
- [ ] Run `npm run check-duplicates:timer` for duplicate variable checks
- [ ] Run `npm run test:timer` (or relevant page) for functionality validation
- [ ] Automated tests will catch console errors and function issues

#### For Date/Time Changes:
- [ ] Run `npm run test` (comprehensive testing includes date/timezone handling)
- [ ] Manual verification only if automated tests don't cover your specific case
- [ ] Automated tests validate user timezone display and edge cases

#### For Session Management or Core Changes:
- [ ] **ALWAYS** run `npm run test` (full comprehensive suite)
- [ ] These changes affect all pages - automated tests prevent race conditions
- [ ] Manual testing cannot reliably catch session management race conditions

### Available Test Commands
```bash
# Automated Testing (PREFERRED)
npm run test:quick          # 5-10s - Fast core functionality validation
npm run test               # 15-20s - Comprehensive functionality testing
npm run validate           # 20-25s - Full validation including duplicate checks

# Page-Specific Testing
npm run test:timer         # Timer page functionality
npm run test:dashboard     # Dashboard page functionality
npm run test:settings      # Settings page functionality
npm run test:schedule      # Schedule page functionality

# Code Quality Checks
npm run check-duplicates:timer    # Check timer.html for duplicate variables
npm run check-duplicates          # Check all files for duplicates

# Manual Testing (Legacy - use only when automated tests insufficient)
npm start                  # Start server for manual browser testing
```

#### Why Automated Tests Are Critical
- **Session Management**: Manual testing cannot reliably reproduce race conditions
- **Cross-Page Impact**: Changes affect multiple pages - automated tests catch regressions
- **Speed**: 5-10 seconds vs minutes of manual clicking
- **Consistency**: Same tests every time, no human error
- **Coverage**: Tests scenarios you might forget to check manually

### Testing Framework Maintenance

**CRITICAL**: Always maintain and extend the testing framework when adding new features. The framework is only as good as its coverage.

#### When Adding New Features
Always add corresponding tests to ensure the feature works correctly:

```bash
# After implementing a new feature, extend the relevant test file
# Example: Adding new timer functionality
vim tests/timer.test.js

# Add new test case:
await framework.runTest('New Feature Test', async (page) => {
    // Test your new feature
    const result = await page.evaluate(() => {
        return {
            featureExists: !!document.querySelector('.new-feature'),
            functionalityWorks: /* your validation logic */
        };
    });

    if (!result.featureExists) {
        throw new Error('New feature not found');
    }

    return result;
});
```

#### Test Framework Extension Guidelines

1. **Add Tests for New UI Elements**
   - New buttons, forms, modals, toggles
   - Page navigation and routing
   - Interactive components

2. **Add Tests for New Data Flow**
   - API integrations
   - Data persistence
   - State management

3. **Add Tests for New User Workflows**
   - Multi-step processes
   - Feature interactions
   - Edge cases and error handling

#### Testing Framework Maintenance Checklist

**When adding new pages:**
- [ ] Create new test file: `tests/newpage.test.js`
- [ ] Add to master test runner: `tests/run-all-tests.js`
- [ ] Add npm script: `"test:newpage": "node tests/newpage.test.js"`
- [ ] Update this CLAUDE.md file with new testing commands

**When adding new features to existing pages:**
- [ ] Extend existing test file (e.g., `tests/timer.test.js`)
- [ ] Add feature-specific test cases
- [ ] Test both positive and negative scenarios
- [ ] Verify integration with existing functionality

**When modifying core functionality:**
- [ ] Update affected test files
- [ ] Ensure all existing tests still pass
- [ ] Add tests for new behavior
- [ ] Test regression scenarios

#### Test Quality Standards

**Every new test should:**
- Have a clear, descriptive name
- Test one specific functionality
- Provide useful error messages on failure
- Be independent of other tests
- Clean up after itself

**Test Coverage Goals:**
- All user-facing features have automated tests
- All critical user workflows are covered
- Session management changes are always tested
- UI interactions are validated
- Data persistence is verified

#### Framework Architecture Files

**Core Framework Files to Maintain:**
- `tests/TestFramework.js` - Core testing utilities
- `tests/run-all-tests.js` - Master test runner
- `tests/*.test.js` - Page-specific test suites
- `package.json` - npm scripts for testing
- `tests/README.md` - Detailed testing documentation

**When extending the framework:**
- Add reusable utilities to `TestFramework.js`
- Update the master runner for new test suites
- Keep documentation synchronized
- Follow existing patterns and conventions

#### Testing Integration with Feature Development

**Standard Feature Development Process:**
1. **Plan Feature** - Consider what needs testing
2. **Implement Feature** - Build the functionality
3. **Add Tests** - Create automated validation
4. **Validate** - Run `npm run validate`
5. **Document** - Update test documentation if needed
6. **Commit** - Include both feature and test code

**Red Flags - Always Update Tests When:**
- Adding new pages or major UI components
- Changing session management or core architecture
- Modifying user workflows or interactions
- Adding new API endpoints or data flows
- Fixing bugs (add regression tests)

**Framework Health Check:**
Periodically run `npm run test` and ensure:
- All tests pass consistently
- Test execution time remains reasonable (under 30s)
- New features have corresponding test coverage
- Test failures provide clear, actionable error messages