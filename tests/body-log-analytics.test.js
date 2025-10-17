const assert = require('assert');
const BodyLogAnalyticsService = require('../services/BodyLogAnalyticsService');
const BodyLogService = require('../services/BodyLogService');
const InMemoryBodyLogDatabase = require('./helpers/InMemoryBodyLogDatabase');

function createAnalyticsFixture() {
    const db = new InMemoryBodyLogDatabase();
    const bodyLogService = new BodyLogService(db);
    const analytics = new BodyLogAnalyticsService(db, bodyLogService);
    return { db, bodyLogService, analytics };
}

function localDate(loggedAt) {
    return new Date(loggedAt).toISOString().slice(0, 10);
}

async function seedFastWithEntries(db, fast, entries) {
    db.addFast(fast);
    for (const entry of entries) {
        await db.createBodyLogEntry({
            user_profile_id: fast.user_profile_id,
            fast_id: fast.id,
            logged_at: entry.logged_at,
            local_date: entry.local_date || localDate(entry.logged_at),
            timezone_offset_minutes: entry.timezone_offset_minutes ?? 0,
            weight: entry.weight ?? null,
            body_fat: entry.body_fat ?? null,
            entry_tag: entry.entry_tag,
            source: entry.source || 'manual',
            notes: entry.notes || null,
            is_canonical: entry.is_canonical || false,
            canonical_status: entry.canonical_status || 'auto'
        });
    }
}

async function seedCanonicalEntry(db, userId, loggedAt, weight, bodyFat = null) {
    await db.createBodyLogEntry({
        user_profile_id: userId,
        fast_id: null,
        logged_at: loggedAt,
        local_date: localDate(loggedAt),
        timezone_offset_minutes: 0,
        weight,
        body_fat: bodyFat,
        entry_tag: 'morning',
        source: 'manual',
        is_canonical: true,
        canonical_status: 'auto',
        canonical_reason: 'morning'
    });
}

async function runBodyLogAnalyticsTests() {
    const results = [];
    let passed = 0;
    let failed = 0;

    async function record(name, fn) {
        try {
            await fn();
            results.push({ name, status: 'PASS' });
            passed += 1;
        } catch (error) {
            failed += 1;
            results.push({ name, status: 'FAIL', error: error.message });
        }
    }

    await record('Fast effectiveness uses measured breakdown when body fat data exists', async () => {
        const { db, analytics } = createAnalyticsFixture();
        const userId = 99;

        db.addUserProfile({
            id: userId,
            height_cm: 178,
            age: 38,
            sex: 'male',
            keto_adapted: 'sometimes',
            tdee_override: null
        });

        const fasts = [
            {
                id: 1,
                user_profile_id: userId,
                start_time: '2024-01-01T08:00:00Z',
                end_time: '2024-01-02T20:00:00Z',
                duration_hours: 36,
                planned_duration_hours: 36
            },
            {
                id: 2,
                user_profile_id: userId,
                start_time: '2024-01-05T07:30:00Z',
                end_time: '2024-01-06T07:30:00Z',
                duration_hours: 24,
                planned_duration_hours: 24
            }
        ];

        await seedFastWithEntries(db, fasts[0], [
            {
                logged_at: '2024-01-01T08:00:00Z',
                weight: 180,
                body_fat: 25,
                entry_tag: 'fast_start',
                source: 'fast_start'
            },
            {
                logged_at: '2024-01-02T20:00:00Z',
                weight: 178,
                body_fat: 24.5,
                entry_tag: 'post_fast'
            }
        ]);

        await seedFastWithEntries(db, fasts[1], [
            {
                logged_at: '2024-01-05T07:30:00Z',
                weight: 175,
                entry_tag: 'fast_start',
                source: 'manual'
            },
            {
                logged_at: '2024-01-06T07:30:00Z',
                weight: 173,
                entry_tag: 'post_fast'
            }
        ]);

        const canonicalEntries = [
            {
                id: 101,
                loggedAt: '2024-01-04T07:00:00Z',
                weight: 178.6
            },
            {
                id: 102,
                loggedAt: '2024-01-07T07:30:00Z',
                weight: 173.8
            }
        ];

        for (const entry of canonicalEntries) {
            await seedCanonicalEntry(db, userId, entry.loggedAt, entry.weight);
        }

        const effectiveness = await analytics.getFastEffectiveness(userId, 1);

        assert.strictEqual(effectiveness.status, 'ok');
        assert.strictEqual(effectiveness.breakdownSource, 'measured');
        assert.strictEqual(effectiveness.weightDelta, -2);
        assert(Math.abs(effectiveness.fatLoss - 1.4) < 0.2, 'Fat loss should align with measured delta');
        assert(Math.abs(effectiveness.fluidLoss - 0.5) < 0.2, 'Fluid loss should align with measured delta');
        assert(Math.abs(effectiveness.waterLoss - effectiveness.fluidLoss) < 0.05, 'Water loss mirrors total fluid');
        assert(effectiveness.leanWater >= 0, 'Lean water should be reported');
        assert(effectiveness.otherFluidLoss >= 0, 'Other fluid should be reported');
        assert(Math.abs((effectiveness.leanWater + effectiveness.otherFluidLoss) - effectiveness.fluidLoss) < 0.2,
            'Lean water plus other fluid should equal total fluid');
        assert(effectiveness.fluidBreakdown.otherFluidTotal >= 0, 'Other fluid total should be reported');
        assert(
            effectiveness.message.includes('Excellent work')
            || effectiveness.message.includes('Good progress'),
            'Message should encourage fat loss progress'
        );

        const rollingInsights = await analytics.computeRollingInsights(userId, fasts, canonicalEntries, { days: 30 });

        if (rollingInsights.status === 'ok') {
            assert.strictEqual(rollingInsights.sampleSize, 2);
            assert.ok(Array.isArray(rollingInsights.protocols));
            assert.ok(rollingInsights.protocols.length >= 1);
        } else {
            assert.strictEqual(rollingInsights.status, 'no-data');
            assert.ok(rollingInsights.message.includes('Log start and post-fast weights'));
        }
    });

    await record('Fast effectiveness surfaces missing data guidance when post-fast weight absent', async () => {
        const { db, analytics } = createAnalyticsFixture();
        const userId = 55;

        db.addUserProfile({
            id: userId,
            height_cm: 170,
            age: 35,
            sex: 'female'
        });

        const fast = {
            id: 11,
            user_profile_id: userId,
            start_time: '2024-02-01T12:00:00Z',
            end_time: '2024-02-02T12:00:00Z',
            duration_hours: 24,
            planned_duration_hours: 24,
            weight: null
        };

        await seedFastWithEntries(db, fast, [
            {
                logged_at: '2024-02-01T11:15:00Z',
                weight: 182,
                entry_tag: 'fast_start',
                source: 'fast_start'
            }
        ]);

        const effectiveness = await analytics.getFastEffectiveness(userId, fast.id);

        assert.strictEqual(effectiveness.status, 'missing_post_fast');
        assert.ok(effectiveness.message.includes('post-fast weight'));
    });

    await record('Analytics retention falls back to waiting status without canonical weigh-in', async () => {
        const { db, bodyLogService, analytics } = createAnalyticsFixture();
        const userId = 83;

        db.addUserProfile({
            id: userId,
            height_cm: 175,
            age: 42,
            sex: 'male'
        });

        const fast = {
            id: 31,
            user_profile_id: userId,
            start_time: '2024-03-01T12:00:00Z',
            end_time: '2024-03-02T12:00:00Z',
            duration_hours: 24,
            planned_duration_hours: 24
        };

        db.addFast(fast);

        await bodyLogService.recordFastWeight({
            userProfileId: userId,
            fastId: fast.id,
            phase: 'start',
            weight: 176,
            loggedAt: '2024-03-01T11:30:00Z'
        });

        await bodyLogService.recordFastWeight({
            userProfileId: userId,
            fastId: fast.id,
            phase: 'end',
            weight: 173.4,
            bodyFat: 24.2,
            loggedAt: '2024-03-02T12:10:00Z'
        });

        await seedCanonicalEntry(db, userId, '2024-02-27T07:00:00Z', 177.5, 24.8);
        await seedCanonicalEntry(db, userId, '2024-03-05T07:15:00Z', 174.2, 24.1);

        const analyticsSummary = await analytics.getAnalytics(userId, { days: 800 });

        assert.ok(analyticsSummary.retention);
        assert.strictEqual(analyticsSummary.retention.status, 'waiting');
        assert.ok(analyticsSummary.retention.message.includes('weigh-in'));

        assert.ok(Array.isArray(analyticsSummary.weeklyComposition));
        assert.ok(analyticsSummary.weeklyComposition.length >= 1);
    });

    return {
        passed,
        failed,
        total: passed + failed,
        details: results
    };
}

if (require.main === module) {
    runBodyLogAnalyticsTests().then((report) => {
        if (report.failed > 0) {
            console.error('❌ Body Log analytics tests failed');
            report.details
                .filter((test) => test.status === 'FAIL')
                .forEach((test) => console.error(`   - ${test.name}: ${test.error}`));
            process.exit(1);
        }
        console.log('✅ Body Log analytics tests passed');
        process.exit(0);
    }).catch((error) => {
        console.error('❌ Body Log analytics test suite error:', error);
        process.exit(1);
    });
}

module.exports = runBodyLogAnalyticsTests;
