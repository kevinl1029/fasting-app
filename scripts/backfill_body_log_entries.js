const db = require('../database/db');
const BodyLogService = require('../services/BodyLogService');

function createBackfillRunner(database, options = {}) {
  const bodyLogService = options.bodyLogService || new BodyLogService(database, options);
  const manageLifecycle = options.manageLifecycle !== false;

  async function getFastsWithWeights() {
    if (typeof database.getFastsWithWeights !== 'function') {
      throw new Error('Database instance must implement getFastsWithWeights()');
    }
    return database.getFastsWithWeights();
  }

  async function hasExistingStartEntry(fastId) {
    const existing = await database.getBodyLogEntriesByFastId(fastId);
    return existing.some((entry) => entry.source === 'fast_start' || entry.entry_tag === 'fast_start');
  }

  async function run({ dryRun = false } = {}) {
    const summary = {
      dryRun,
      totalFasts: 0,
      created: 0,
      skippedExisting: 0,
      skippedMissingProfile: 0,
      errors: []
    };

    if (manageLifecycle && typeof database.initialize === 'function') {
      await database.initialize();
    }

    try {
      const fasts = await getFastsWithWeights();
      summary.totalFasts = fasts.length;

      for (const fast of fasts) {
        if (!fast.user_profile_id) {
          summary.skippedMissingProfile += 1;
          continue;
        }

        if (await hasExistingStartEntry(fast.id)) {
          summary.skippedExisting += 1;
          continue;
        }

        if (dryRun) {
          summary.created += 1;
          continue;
        }

        try {
          await bodyLogService.recordFastWeight({
            userProfileId: fast.user_profile_id,
            fastId: fast.id,
            phase: 'start',
            weight: fast.weight,
            bodyFat: fast.body_fat || null,
            loggedAt: fast.start_time,
            timezoneOffsetMinutes: null
          });
          summary.created += 1;
        } catch (error) {
          summary.errors.push({ fastId: fast.id, message: error.message });
        }
      }
    } finally {
      if (manageLifecycle && typeof database.close === 'function') {
        await database.close();
      }
    }

    return summary;
  }

  return {
    run,
    getFastsWithWeights,
    hasExistingStartEntry
  };
}

if (require.main === module) {
  const runner = createBackfillRunner(db);
  runner.run()
    .then((summary) => {
      console.log('\nBody log backfill complete');
      console.log(`Total fasts with weight: ${summary.totalFasts}`);
      console.log(`Created body entries: ${summary.created}`);
      console.log(`Skipped (already exists): ${summary.skippedExisting}`);
      console.log(`Skipped (missing profile): ${summary.skippedMissingProfile}`);

      if (summary.errors.length > 0) {
        console.error('Encountered errors while backfilling:');
        summary.errors.forEach((err) => console.error(`  - Fast ${err.fastId}: ${err.message}`));
        process.exit(1);
      }

      process.exit(0);
    })
    .catch((error) => {
      console.error('Backfill failed:', error);
      process.exit(1);
    });
}

module.exports = { createBackfillRunner };
