const db = require('../database/db');
const BodyLogService = require('../services/BodyLogService');

async function getFastsWithWeights() {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT id, user_profile_id, start_time, end_time, weight
      FROM fasts
      WHERE user_profile_id IS NOT NULL
        AND weight IS NOT NULL
    `;

    db.db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

async function hasExistingStartEntry(fastId) {
  const existing = await db.getBodyLogEntriesByFastId(fastId);
  return existing.some((entry) => entry.source === 'fast_start' || entry.entry_tag === 'fast_start');
}

async function backfill() {
  await db.initialize();
  const bodyLogService = new BodyLogService(db);

  const fasts = await getFastsWithWeights();
  let created = 0;
  let skippedExisting = 0;
  let skippedMissingProfile = 0;

  for (const fast of fasts) {
    if (!fast.user_profile_id) {
      skippedMissingProfile += 1;
      continue;
    }

    if (await hasExistingStartEntry(fast.id)) {
      skippedExisting += 1;
      continue;
    }

    try {
      await bodyLogService.recordFastWeight({
        userProfileId: fast.user_profile_id,
        fastId: fast.id,
        phase: 'start',
        weight: fast.weight,
        bodyFat: null,
        loggedAt: fast.start_time,
        timezoneOffsetMinutes: null
      });
      created += 1;
    } catch (error) {
      console.error(`Failed to backfill body entry for fast ${fast.id}:`, error);
    }
  }

  console.log('\nBody log backfill complete');
  console.log(`Total fasts with weight: ${fasts.length}`);
  console.log(`Created body entries: ${created}`);
  console.log(`Skipped (already exists): ${skippedExisting}`);
  console.log(`Skipped (missing profile): ${skippedMissingProfile}`);

  await db.close();
}

backfill().catch(async (error) => {
  console.error('Backfill failed:', error);
  try {
    await db.close();
  } catch (closeError) {
    console.error('Failed to close database after error:', closeError);
  }
  process.exit(1);
});
