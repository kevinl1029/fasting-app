const assert = require('assert');
const BodyLogService = require('../services/BodyLogService');
const InMemoryBodyLogDatabase = require('./helpers/InMemoryBodyLogDatabase');

function createServiceFixture() {
  const db = new InMemoryBodyLogDatabase();
  const service = new BodyLogService(db);
  return { db, service };
}

async function runBodyLogServiceTests() {
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

  await record('determineEntryTag applies hints, windows, and fast proximity', async () => {
    const { db, service } = createServiceFixture();
    db.addFast({
      id: 10,
      user_profile_id: 1,
      start_time: '2024-01-01T12:00:00Z',
      end_time: '2024-01-01T20:00:00Z',
      planned_duration_hours: 36,
      duration_hours: 36
    });

    const hinted = await service.determineEntryTag({
      userProfileId: 1,
      loggedAt: '2024-01-01T05:00:00Z',
      timezoneOffsetMinutes: 0,
      tagHint: 'manual_override'
    });
    assert.strictEqual(hinted, 'manual_override');

    const preFast = await service.determineEntryTag({
      userProfileId: 1,
      fastId: 10,
      loggedAt: '2024-01-01T11:00:00Z',
      timezoneOffsetMinutes: 0
    });
    assert.strictEqual(preFast, 'pre_fast');

    const morning = await service.determineEntryTag({
      userProfileId: 1,
      loggedAt: '2024-01-01T06:30:00Z',
      timezoneOffsetMinutes: 0
    });
    assert.strictEqual(morning, 'morning');

    const postFast = await service.determineEntryTag({
      userProfileId: 1,
      fastId: 10,
      loggedAt: '2024-01-01T21:15:00Z',
      timezoneOffsetMinutes: 0
    });
    assert.strictEqual(postFast, 'post_fast');

    const postFastSource = await service.determineEntryTag({
      userProfileId: 1,
      loggedAt: '2024-01-01T23:00:00Z',
      timezoneOffsetMinutes: 0,
      source: 'post_fast_prompt'
    });
    assert.strictEqual(postFastSource, 'post_fast');

    const adHoc = await service.determineEntryTag({
      userProfileId: 1,
      loggedAt: '2024-01-01T15:00:00Z',
      timezoneOffsetMinutes: 0
    });
    assert.strictEqual(adHoc, 'ad_hoc');
  });

  await record('createEntry auto-selects morning canonical entry', async () => {
    const { db, service } = createServiceFixture();

    const morningEntry = await service.createEntry({
      userProfileId: 7,
      loggedAt: '2024-02-01T06:45:00Z',
      timezoneOffsetMinutes: 0,
      weight: 188.2
    });

    assert.strictEqual(morningEntry.entry_tag, 'morning');
    assert.strictEqual(morningEntry.is_canonical, true);
    assert.strictEqual(morningEntry.canonical_reason, 'morning');

    const eveningEntry = await service.createEntry({
      userProfileId: 7,
      loggedAt: '2024-02-01T20:15:00Z',
      timezoneOffsetMinutes: 0,
      weight: 191.0
    });

    assert.strictEqual(eveningEntry.entry_tag, 'ad_hoc');
    assert.strictEqual(eveningEntry.is_canonical, false);

    const canonical = await db.getCanonicalEntryForDate(7, '2024-02-01');
    assert.ok(canonical, 'Expected a canonical entry for 2024-02-01');
    assert.strictEqual(canonical.id, morningEntry.id);
  });

  await record('makeCanonical enforces manual override and retains reason', async () => {
    const { db, service } = createServiceFixture();

    await service.createEntry({
      userProfileId: 9,
      loggedAt: '2024-02-10T07:15:00Z',
      timezoneOffsetMinutes: 0,
      weight: 172.4
    });

    const override = await service.createEntry({
      userProfileId: 9,
      loggedAt: '2024-02-10T19:45:00Z',
      timezoneOffsetMinutes: 0,
      weight: 175.1,
      makeCanonical: true
    });

    assert.strictEqual(override.is_canonical, true);
    assert.strictEqual(override.canonical_status, 'manual');
    assert.strictEqual(override.canonical_reason, 'ad_hoc');

    const canonical = await db.getCanonicalEntryForDate(9, '2024-02-10');
    assert.strictEqual(canonical.id, override.id);
    assert.strictEqual(canonical.canonical_status, 'manual');
  });

  await record('updateEntry recalculates local context when timestamp changes', async () => {
    const { service } = createServiceFixture();

    const entry = await service.createEntry({
      userProfileId: 12,
      loggedAt: '2024-03-05T18:30:00Z',
      timezoneOffsetMinutes: 0,
      weight: 166.3
    });

    assert.strictEqual(entry.entry_tag, 'ad_hoc');

    const updated = await service.updateEntry(entry.id, {
      logged_at: '2024-03-05T06:10:00Z'
    });

    assert.strictEqual(updated.entry_tag, 'morning');
    assert.strictEqual(updated.local_date, '2024-03-05');
    assert.strictEqual(updated.timezone_offset_minutes, 0);
    assert.strictEqual(updated.is_canonical, true);
  });

  await record('createEntry infers offset from provided time zone', async () => {
    const { service } = createServiceFixture();

    const entry = await service.createEntry({
      userProfileId: 30,
      loggedAt: '2024-08-01T22:00:00Z',
      timeZone: 'America/New_York',
      weight: 154.2
    });

    assert.strictEqual(entry.time_zone, 'America/New_York');
    assert.strictEqual(entry.timezone_offset_minutes, -240);
    assert.strictEqual(entry.local_date, '2024-08-01');
  });

  await record('deleteEntry reassigns canonical to remaining candidate', async () => {
    const { db, service } = createServiceFixture();

    db.addFast({
      id: 25,
      user_profile_id: 20,
      start_time: '2024-04-01T12:00:00Z',
      end_time: '2024-04-01T19:00:00Z'
    });

    const morning = await service.createEntry({
      userProfileId: 20,
      loggedAt: '2024-04-01T07:00:00Z',
      timezoneOffsetMinutes: 0,
      weight: 182.1
    });

    const postFast = await service.createEntry({
      userProfileId: 20,
      fastId: 25,
      loggedAt: '2024-04-01T19:45:00Z',
      timezoneOffsetMinutes: 0,
      weight: 179.3
    });

    let canonical = await db.getCanonicalEntryForDate(20, '2024-04-01');
    assert.strictEqual(canonical.id, morning.id);

    await service.deleteEntry(morning.id);

    canonical = await db.getCanonicalEntryForDate(20, '2024-04-01');
    assert.ok(canonical, 'Expected canonical reassignment after delete');
    assert.strictEqual(canonical.id, postFast.id);
    assert.strictEqual(canonical.canonical_reason, 'post_fast');
  });

  return {
    passed,
    failed,
    total: passed + failed,
    details: results
  };
}

if (require.main === module) {
  runBodyLogServiceTests().then((report) => {
    if (report.failed > 0) {
      console.error('❌ Body Log service tests failed');
      report.details
        .filter((test) => test.status === 'FAIL')
        .forEach((test) => console.error(`   - ${test.name}: ${test.error}`));
      process.exit(1);
    }
    console.log('✅ Body Log service tests passed');
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Body Log service test suite error:', error);
    process.exit(1);
  });
}

module.exports = runBodyLogServiceTests;
