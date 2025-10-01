const assert = require('assert');
const { createBackfillRunner } = require('../scripts/backfill_body_log_entries');
const InMemoryBodyLogDatabase = require('./helpers/InMemoryBodyLogDatabase');

function localDate(loggedAt) {
    return new Date(loggedAt).toISOString().slice(0, 10);
}

async function runBodyLogBackfillTests() {
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

    await record('Backfill dry run reports expected actions without mutating data', async () => {
        const db = new InMemoryBodyLogDatabase();

        const fastCreate = {
            id: 1,
            user_profile_id: 10,
            start_time: '2024-06-01T12:00:00Z',
            end_time: '2024-06-02T12:00:00Z',
            weight: 180
        };

        const fastExisting = {
            id: 2,
            user_profile_id: 11,
            start_time: '2024-06-03T12:00:00Z',
            end_time: '2024-06-04T12:00:00Z',
            weight: 190
        };

        db.addFast(fastCreate);
        db.addFast(fastExisting);

        await db.createBodyLogEntry({
            user_profile_id: fastExisting.user_profile_id,
            fast_id: fastExisting.id,
            logged_at: fastExisting.start_time,
            local_date: localDate(fastExisting.start_time),
            timezone_offset_minutes: 0,
            weight: fastExisting.weight,
            entry_tag: 'fast_start',
            source: 'fast_start',
            is_canonical: false
        });

        const runner = createBackfillRunner(db, { manageLifecycle: false });
        const summary = await runner.run({ dryRun: true });

        assert.strictEqual(summary.totalFasts, 2);
        assert.strictEqual(summary.created, 1);
        assert.strictEqual(summary.skippedExisting, 1);
        assert.strictEqual(summary.skippedMissingProfile, 0);

        const entriesAfter = await db.getBodyLogEntriesByFastId(fastCreate.id);
        assert.strictEqual(entriesAfter.length, 0, 'Dry run should not create entries');
    });

    await record('Backfill creates missing start entries and skips existing ones', async () => {
        const db = new InMemoryBodyLogDatabase();

        const fastCreate = {
            id: 5,
            user_profile_id: 21,
            start_time: '2024-07-01T15:00:00Z',
            end_time: '2024-07-02T15:00:00Z',
            weight: 172.4,
            body_fat: 24.5
        };

        const fastExisting = {
            id: 6,
            user_profile_id: 22,
            start_time: '2024-07-03T15:00:00Z',
            end_time: '2024-07-04T15:00:00Z',
            weight: 168.9
        };

        db.addFast(fastCreate);
        db.addFast(fastExisting);

        await db.createBodyLogEntry({
            user_profile_id: fastExisting.user_profile_id,
            fast_id: fastExisting.id,
            logged_at: fastExisting.start_time,
            local_date: localDate(fastExisting.start_time),
            timezone_offset_minutes: 0,
            weight: fastExisting.weight,
            entry_tag: 'fast_start',
            source: 'fast_start',
            is_canonical: false
        });

        const runner = createBackfillRunner(db, { manageLifecycle: false });
        const summary = await runner.run();

        assert.strictEqual(summary.created, 1);
        assert.strictEqual(summary.skippedExisting, 1);
        assert.strictEqual(summary.errors.length, 0);

        const newEntries = await db.getBodyLogEntriesByFastId(fastCreate.id);
        assert.strictEqual(newEntries.length, 1);
        const [entry] = newEntries;
        assert.strictEqual(entry.user_profile_id, fastCreate.user_profile_id);
        assert.strictEqual(entry.fast_id, fastCreate.id);
        assert.strictEqual(entry.entry_tag, 'pre_fast');
        assert.strictEqual(entry.source, 'fast_start');
        assert.strictEqual(entry.weight, fastCreate.weight);
    });

    return {
        passed,
        failed,
        total: passed + failed,
        details: results
    };
}

if (require.main === module) {
    runBodyLogBackfillTests().then((report) => {
        if (report.failed > 0) {
            console.error('❌ Body Log backfill tests failed');
            report.details
                .filter((test) => test.status === 'FAIL')
                .forEach((test) => console.error(`   - ${test.name}: ${test.error}`));
            process.exit(1);
        }
        console.log('✅ Body Log backfill tests passed');
        process.exit(0);
    }).catch((error) => {
        console.error('❌ Body Log backfill test suite error:', error);
        process.exit(1);
    });
}

module.exports = runBodyLogBackfillTests;
