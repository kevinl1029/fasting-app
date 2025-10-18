const db = require('../database/db');
const BodyLogService = require('../services/BodyLogService');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    defaultZone: null,
    userIds: new Set(),
    userZoneOverrides: new Map(),
    verbose: false
  };

  argv.forEach((arg) => {
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg.startsWith('--default-zone=')) {
      const value = arg.split('=')[1]?.trim();
      if (value) {
        options.defaultZone = value;
      }
    } else if (arg.startsWith('--user=')) {
      const raw = arg.split('=')[1];
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) {
        options.userIds.add(parsed);
      }
    } else if (arg.startsWith('--user-zone=')) {
      const payload = arg.split('=')[1] || '';
      const [idPart, zonePart] = payload.split(':');
      const parsedId = Number(idPart);
      if (!Number.isNaN(parsedId) && zonePart && zonePart.trim()) {
        options.userZoneOverrides.set(parsedId, zonePart.trim());
      }
    } else {
      console.warn(`Ignoring unrecognised argument: ${arg}`);
    }
  });

  options.dryRun = !options.apply;
  return options;
}

function buildZoneStats(entries) {
  const stats = new Map();

  entries.forEach((entry) => {
    if (!entry || !entry.time_zone) {
      return;
    }
    const zone = entry.time_zone;
    if (!stats.has(zone)) {
      stats.set(zone, { count: 0, offsets: new Set(), exampleEntryIds: [] });
    }
    const record = stats.get(zone);
    record.count += 1;
    if (entry.timezone_offset_minutes !== null && entry.timezone_offset_minutes !== undefined) {
      record.offsets.add(entry.timezone_offset_minutes);
    }
    if (record.exampleEntryIds.length < 3) {
      record.exampleEntryIds.push(entry.id);
    }
  });

  return stats;
}

function chooseZoneForEntry(entry, zoneStats, overrides) {
  if (!entry) {
    return null;
  }

  const forcedZone = overrides?.forEntry?.(entry);
  if (forcedZone) {
    return forcedZone;
  }

  const { userZone, defaultZone } = overrides || {};

  if (userZone) {
    return userZone;
  }

  if (!zoneStats || zoneStats.size === 0) {
    return defaultZone || null;
  }

  const offset = typeof entry.timezone_offset_minutes === 'number' && !Number.isNaN(entry.timezone_offset_minutes)
    ? entry.timezone_offset_minutes
    : null;

  if (offset !== null) {
    for (const [zone, record] of zoneStats.entries()) {
      if (record.offsets.has(offset)) {
        return zone;
      }
    }
  }

  // Fall back to the most common zone
  const [topZone] = Array.from(zoneStats.entries()).sort((a, b) => b[1].count - a[1].count);
  if (topZone) {
    return topZone[0];
  }

  return defaultZone || null;
}

function formatContextChange(existingEntry, context) {
  if (!existingEntry || !context) {
    return null;
  }

  const changes = [];
  if (existingEntry.time_zone !== context.timeZone) {
    changes.push(`timeZone: ${existingEntry.time_zone || '∅'} -> ${context.timeZone || '∅'}`);
  }
  if (existingEntry.timezone_offset_minutes !== context.offsetMinutes) {
    changes.push(`offsetMinutes: ${existingEntry.timezone_offset_minutes ?? '∅'} -> ${context.offsetMinutes}`);
  }
  if (existingEntry.local_date !== context.localDate) {
    changes.push(`localDate: ${existingEntry.local_date} -> ${context.localDate}`);
  }
  return changes.length > 0 ? changes.join('; ') : null;
}

function createBackfillContext(database, options = {}) {
  const bodyLogService = new BodyLogService(database, options);

  async function getUserIds(targetIds) {
    if (targetIds && targetIds.size > 0) {
      return Array.from(targetIds.values());
    }
    return database.getBodyLogUserIds();
  }

  async function run({
    dryRun = true,
    defaultZone = null,
    userZoneOverrides = new Map(),
    verbose = false
  } = {}) {
    const summary = {
      dryRun,
      scannedUsers: 0,
      usersWithUpdates: 0,
      entriesEvaluated: 0,
      entriesUpdated: 0,
      entriesSkipped: 0,
      profilesUpdated: 0,
      unresolvedUsers: [],
      unresolvedEntries: [],
      logs: []
    };

    if (options.manageLifecycle !== false && typeof database.initialize === 'function') {
      await database.initialize();
    }

    try {
      const userIds = await getUserIds(options.userIds);
      for (const rawUserId of userIds) {
        const userId = Number(rawUserId);
        if (Number.isNaN(userId)) {
          continue;
        }

        summary.scannedUsers += 1;
        const entries = await database.getBodyLogEntriesByUser(userId, { includeSecondary: true });
        const missingZoneEntries = entries.filter((entry) => !entry.time_zone);
        if (missingZoneEntries.length === 0) {
          if (verbose) {
            console.log(`User ${userId}: no missing time zones`);
          }
          continue;
        }

        const zoneStats = buildZoneStats(entries);
        const overrideZone = userZoneOverrides.get(userId) || null;
        const hasKnownZone = zoneStats.size > 0 || overrideZone || defaultZone;
        const appliedZones = new Set();

        if (!hasKnownZone) {
          summary.unresolvedUsers.push({ userProfileId: userId, missing: missingZoneEntries.length });
          summary.unresolvedEntries.push(...missingZoneEntries.map((entry) => entry.id));
          if (verbose) {
            console.warn(`User ${userId}: unable to determine time zone (missing ${missingZoneEntries.length} entries)`);
          }
          continue;
        }

        summary.usersWithUpdates += 1;

        for (const entry of missingZoneEntries) {
          summary.entriesEvaluated += 1;

          const chosenZone = overrideZone
            || chooseZoneForEntry(entry, zoneStats, {
              userZone: overrideZone,
              defaultZone
            });

          if (!chosenZone) {
            summary.entriesSkipped += 1;
            summary.unresolvedEntries.push(entry.id);
            if (verbose) {
              console.warn(`  Entry ${entry.id}: no zone determined`);
            }
            continue;
          }

          appliedZones.add(chosenZone);

          const context = bodyLogService.resolveEntryContext(
            entry.logged_at,
            entry.timezone_offset_minutes,
            chosenZone
          );

          const changeSummary = formatContextChange(entry, {
            timeZone: context.timeZone,
            offsetMinutes: context.offsetMinutes,
            localDate: context.localDate
          });

          if (dryRun) {
            summary.entriesUpdated += 1;
            if (verbose) {
              console.log(`  (dry) Entry ${entry.id}: set timeZone -> ${chosenZone}${changeSummary ? ` [${changeSummary}]` : ''}`);
            }
            continue;
          }

          try {
            const updated = await bodyLogService.updateEntry(entry.id, {
              time_zone: chosenZone
            });
            summary.entriesUpdated += 1;
            if (verbose) {
              console.log(`  Entry ${entry.id}: timeZone set to ${chosenZone}${changeSummary ? ` [${changeSummary}]` : ''}`);
            }
            if (!updated.time_zone) {
              summary.unresolvedEntries.push(entry.id);
            }
          } catch (error) {
            summary.entriesSkipped += 1;
            summary.unresolvedEntries.push(entry.id);
            console.error(`  Entry ${entry.id}: failed to update (${error.message})`);
          }
        }

        let profileTargetZone = null;
        if (overrideZone) {
          profileTargetZone = overrideZone;
        } else if (appliedZones.size === 1) {
          profileTargetZone = appliedZones.values().next().value;
        } else if (appliedZones.size === 0 && zoneStats.size === 1) {
          profileTargetZone = zoneStats.keys().next().value;
        } else if (!overrideZone && appliedZones.size === 0 && defaultZone) {
          profileTargetZone = defaultZone;
        }

        if (profileTargetZone) {
          summary.profilesUpdated += 1;
          if (verbose) {
            const modeLabel = dryRun ? '(dry)' : '';
            console.log(`  ${modeLabel} Profile timezone -> ${profileTargetZone}`);
          }

          if (!dryRun) {
            try {
              const profile = await database.getUserProfileById(userId);
              if (profile && profile.session_id) {
                await database.updateUserProfile(profile.session_id, { time_zone: profileTargetZone });
              } else {
                summary.unresolvedUsers.push({ userProfileId: userId, missing: missingZoneEntries.length, reason: 'missing_session' });
              }
            } catch (error) {
              console.error(`  Failed to update user ${userId} timezone:`, error.message);
              summary.unresolvedUsers.push({ userProfileId: userId, missing: missingZoneEntries.length, reason: 'update_failed' });
            }
          }
        }
      }
    } finally {
      if (options.manageLifecycle !== false && typeof database.close === 'function') {
        await database.close();
      }
    }

    return summary;
  }

  return {
    run
  };
}

async function main() {
  const cliOptions = parseArgs();
  const backfill = createBackfillContext(db, {
    manageLifecycle: true,
    userIds: cliOptions.userIds
  });

  const summary = await backfill.run({
    dryRun: cliOptions.dryRun,
    defaultZone: cliOptions.defaultZone,
    userZoneOverrides: cliOptions.userZoneOverrides,
    verbose: cliOptions.verbose
  });

  console.log('\nBody log timezone backfill summary');
  console.log('=================================');
  console.log(`Mode: ${summary.dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Users scanned: ${summary.scannedUsers}`);
  console.log(`Users with updates: ${summary.usersWithUpdates}`);
  console.log(`Entries evaluated: ${summary.entriesEvaluated}`);
  console.log(`Entries ${summary.dryRun ? 'matched' : 'updated'}: ${summary.entriesUpdated}`);
  console.log(`Entries skipped/unresolved: ${summary.entriesSkipped}`);
  console.log(`Profiles ${summary.dryRun ? 'eligible' : 'updated'}: ${summary.profilesUpdated}`);

  if (summary.unresolvedUsers.length > 0) {
    console.log('\nUsers requiring manual attention:');
    summary.unresolvedUsers.forEach((item) => {
      const reason = item.reason ? ` (reason: ${item.reason})` : '';
      console.log(`  - User ${item.userProfileId}: ${item.missing} entries without time zone${reason}`);
    });
  }

  if (!summary.dryRun && summary.unresolvedEntries.length > 0) {
    console.log('\nEntries still unresolved after apply:');
    summary.unresolvedEntries.forEach((entryId) => {
      console.log(`  - Entry ${entryId}`);
    });
  }

  if (!summary.dryRun && summary.unresolvedEntries.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Timezone backfill failed:', error);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  createBackfillContext
};
