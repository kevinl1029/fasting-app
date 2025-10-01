const assert = require('assert');
const BodyLogAnalyticsService = require('../services/BodyLogAnalyticsService');

class FakeDatabase {
    constructor({ fasts = [], fastEntries = {} } = {}) {
        this.fasts = fasts;
        this.fastEntries = fastEntries;
    }

    async getFastById(fastId) {
        return this.fasts.find((fast) => Number(fast.id) === Number(fastId)) || null;
    }

    async getBodyLogEntriesByFastId(fastId) {
        const entries = this.fastEntries[fastId] || [];
        return entries.map((entry) => ({ ...entry }));
    }
}

async function runBodyLogAnalyticsTests() {
    const results = [];
    let passed = 0;
    let failed = 0;

    function record(name, fn) {
        try {
            fn();
            results.push({ name, status: 'PASS' });
            passed += 1;
        } catch (error) {
            failed += 1;
            results.push({ name, status: 'FAIL', error: error.message });
        }
    }

    const userId = 99;

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

    const fastEntries = {
        1: [
            {
                id: 11,
                logged_at: '2024-01-01T08:00:00Z',
                weight: 180,
                body_fat: 25,
                entry_tag: 'fast_start',
                source: 'fast_start'
            },
            {
                id: 12,
                logged_at: '2024-01-02T20:00:00Z',
                weight: 178,
                body_fat: 24.5,
                entry_tag: 'post_fast'
            }
        ],
        2: [
            {
                id: 21,
                logged_at: '2024-01-05T07:30:00Z',
                weight: 175,
                entry_tag: 'fast_start',
                source: 'manual'
            },
            {
                id: 22,
                logged_at: '2024-01-06T07:30:00Z',
                weight: 173,
                entry_tag: 'post_fast'
            }
        ]
    };

    const fakeDb = new FakeDatabase({ fasts, fastEntries });
    const analytics = new BodyLogAnalyticsService(fakeDb);

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

    const effectiveness = await analytics.getFastEffectiveness(userId, 1);

    record('Fast effectiveness uses measured breakdown when body fat data exists', () => {
        assert.strictEqual(effectiveness.status, 'ok');
        assert.strictEqual(effectiveness.breakdownSource, 'measured');
        assert.strictEqual(effectiveness.weightDelta, -2);
        assert.strictEqual(effectiveness.fatLoss, 1.4);
        assert.strictEqual(effectiveness.waterLoss, 0.6);
        assert.ok(effectiveness.message.includes('Great work'));
    });

    const rollingInsights = await analytics.computeRollingInsights(userId, fasts, canonicalEntries, { days: 30 });

    record('Rolling insights aggregate protocol metrics with retention', () => {
        assert.strictEqual(rollingInsights.status, 'ok');
        assert.strictEqual(rollingInsights.sampleSize, 2);
        assert.strictEqual(rollingInsights.averageWeightDelta, -2);
        assert.strictEqual(rollingInsights.averageRetentionPercent, 65);
        assert.strictEqual(rollingInsights.averageFatLoss, 0.9);
        assert.ok(Array.isArray(rollingInsights.protocols));
        assert.strictEqual(rollingInsights.protocols.length, 2);

        const [deepReset, oneDayReset] = rollingInsights.protocols;
        assert.strictEqual(deepReset.label, '36h Deep Reset');
        assert.strictEqual(deepReset.averageRetentionPercent, 70);
        assert.strictEqual(deepReset.averageWeightDrop, 2);

        assert.strictEqual(oneDayReset.label, '24h Reset');
        assert.strictEqual(oneDayReset.averageRetentionPercent, 60);
        assert.strictEqual(oneDayReset.averageWeightDrop, 2);

        assert.ok(rollingInsights.education.description.includes('last 30 days'));
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
