const { normalizeTimestamp, getLocalContext: buildLocalContext } = require('./timezone');

const POST_FAST_WINDOW_MINUTES = 120;
const MORNING_WINDOW_START_MINUTES = 4 * 60;
const MORNING_WINDOW_END_MINUTES = 11 * 60 + 59;

class BodyLogService {
  constructor(database, options = {}) {
    this.db = database;
    this.logger = options.logger || console;
  }

  resolveEntryContext(loggedAt, timezoneOffsetMinutes, timeZone) {
    const normalized = normalizeTimestamp({
      loggedAt,
      timezoneOffsetMinutes,
      timeZone
    });

    const localContext = buildLocalContext({
      instant: normalized.instant,
      offsetMinutes: normalized.offsetMinutes,
      timeZone: normalized.timeZone
    });

    return {
      instant: normalized.instant,
      isoString: normalized.isoString,
      offsetMinutes: localContext.offsetMinutes,
      timeZone: localContext.timeZone,
      localDate: localContext.localDate,
      localTime: localContext.localTime
    };
  }

  getLocalContext(loggedAt, timezoneOffsetMinutes, timeZone) {
    return this.resolveEntryContext(loggedAt, timezoneOffsetMinutes, timeZone);
  }

  minutesIntoDay(localTime) {
    return localTime.getUTCHours() * 60 + localTime.getUTCMinutes();
  }

  isWithinMorningWindow(localTime) {
    const minutes = this.minutesIntoDay(localTime);
    return minutes >= MORNING_WINDOW_START_MINUTES && minutes <= MORNING_WINDOW_END_MINUTES;
  }

  async determineEntryTag({
    userProfileId,
    loggedAt,
    timezoneOffsetMinutes,
    timeZone = null,
    fastId = null,
    source = 'manual',
    tagHint = null
  }) {
    if (tagHint) {
      return tagHint;
    }

    const context = this.resolveEntryContext(loggedAt, timezoneOffsetMinutes, timeZone);
    const entryTimestamp = context.instant.getTime();
    const loggedAtIso = context.isoString;

    // Check for explicit pre-fast source
    if (source === 'fast_start') {
      return 'pre_fast';
    }

    // Check for pre-fast timing (within 2 hours before fast start)
    if (fastId) {
      const fast = await this.db.getFastById(fastId);
      if (fast && fast.start_time) {
        const fastStartTime = new Date(fast.start_time).getTime();
        const diffMs = fastStartTime - entryTimestamp;

        // If entry is within 2 hours before fast start
        if (diffMs >= 0 && diffMs <= POST_FAST_WINDOW_MINUTES * 60 * 1000) {
          return 'pre_fast';
        }
      }
    }

    const { localTime } = context;

    if (this.isWithinMorningWindow(localTime)) {
      return 'morning';
    }

    // Check for post-fast timing (within 2 hours after fast end)
    const candidateFastIds = [];
    if (fastId) {
      candidateFastIds.push(fastId);
    }

    let nearestFast = null;
    if (candidateFastIds.length > 0) {
      const fast = await this.db.getFastById(candidateFastIds[0]);
      if (fast && fast.end_time) {
        const diffMs = entryTimestamp - new Date(fast.end_time).getTime();
        if (diffMs >= 0 && diffMs <= POST_FAST_WINDOW_MINUTES * 60 * 1000) {
          nearestFast = fast;
        }
      }
    }

    if (!nearestFast) {
      nearestFast = await this.db.getFastEndingNearTimestamp(
        userProfileId,
        loggedAtIso,
        POST_FAST_WINDOW_MINUTES
      );
    }

    if (nearestFast) {
      const diffMs = entryTimestamp - new Date(nearestFast.end_time).getTime();
      if (diffMs >= 0 && diffMs <= POST_FAST_WINDOW_MINUTES * 60 * 1000) {
        return 'post_fast';
      }
    }

    if (source === 'post_fast_prompt' || source === 'fast_completion') {
      return 'post_fast';
    }

    return 'ad_hoc';
  }

  async autoSelectCanonical(userProfileId, localDate, options = {}) {
    const { force = false } = options;

    const currentCanonical = await this.db.getCanonicalEntryForDate(userProfileId, localDate);
    if (currentCanonical && currentCanonical.canonical_status === 'manual' && !force) {
      return currentCanonical;
    }

    const entries = await this.db.getBodyLogEntriesForDate(userProfileId, localDate);
    if (!entries || entries.length === 0) {
      if (currentCanonical) {
        await this.db.clearCanonicalForDate(userProfileId, localDate);
      }
      return null;
    }

    const morningEntries = entries.filter((entry) => entry.entry_tag === 'morning');
    const postFastEntries = entries.filter((entry) => entry.entry_tag === 'post_fast');

    let target = null;
    if (morningEntries.length > 0) {
      target = morningEntries[0];
    } else if (postFastEntries.length > 0) {
      target = postFastEntries[0];
    } else {
      target = entries[0];
    }

    return this.db.markCanonicalEntry(target.id, {
      canonicalStatus: 'auto',
      canonicalReason: target.entry_tag
    });
  }

  async createEntry(entryInput) {
    const {
      userProfileId,
      loggedAt,
      weight,
      bodyFat = null,
      timezoneOffsetMinutes = null,
      timeZone = null,
      fastId = null,
      source = 'manual',
      notes = null,
      tagHint = null,
      makeCanonical = false
    } = entryInput;

    if (!userProfileId) {
      throw new Error('userProfileId is required');
    }
    if (!loggedAt) {
      throw new Error('loggedAt is required');
    }
    if (weight === undefined || weight === null) {
      throw new Error('weight is required');
    }

    const context = this.resolveEntryContext(loggedAt, timezoneOffsetMinutes, timeZone);
    const entryTag = await this.determineEntryTag({
      userProfileId,
      loggedAt: context.isoString,
      timezoneOffsetMinutes: context.offsetMinutes,
      timeZone: context.timeZone,
      fastId,
      source,
      tagHint
    });

    const created = await this.db.createBodyLogEntry({
      user_profile_id: userProfileId,
      fast_id: fastId,
      logged_at: context.isoString,
      local_date: context.localDate,
      timezone_offset_minutes: context.offsetMinutes,
      time_zone: context.timeZone,
      weight,
      body_fat: bodyFat,
      entry_tag: entryTag,
      source,
      notes,
      is_canonical: false,
      canonical_status: 'auto'
    });

    if (makeCanonical) {
      await this.db.markCanonicalEntry(created.id, {
        canonicalStatus: 'manual',
        canonicalReason: entryTag
      });
      return this.db.getBodyLogEntryById(created.id);
    }

    await this.autoSelectCanonical(userProfileId, context.localDate);
    return this.db.getBodyLogEntryById(created.id);
  }

  async listEntries(userProfileId, options = {}) {
    return this.db.getBodyLogEntriesByUser(userProfileId, options);
  }

  async getEntry(entryId) {
    return this.db.getBodyLogEntryById(entryId);
  }

  async updateEntry(entryId, updateInput) {
    const entry = await this.db.getBodyLogEntryById(entryId);
    if (!entry) {
      throw new Error('Body log entry not found');
    }

    const updates = { ...updateInput };

    const timestampChanged = updates.logged_at !== undefined;
    const offsetChanged = updates.timezone_offset_minutes !== undefined;
    const timeZoneChanged = updates.time_zone !== undefined;

    if (timestampChanged || offsetChanged || timeZoneChanged) {
      const loggedAtInput = timestampChanged ? updates.logged_at : entry.logged_at;
      const offsetInput = offsetChanged ? updates.timezone_offset_minutes : entry.timezone_offset_minutes;
      const timeZoneInput = timeZoneChanged ? updates.time_zone : entry.time_zone;

      const context = this.resolveEntryContext(loggedAtInput, offsetInput, timeZoneInput);

      if (timestampChanged) {
        updates.logged_at = context.isoString;
      }

      updates.local_date = context.localDate;
      updates.timezone_offset_minutes = context.offsetMinutes;
      updates.time_zone = context.timeZone;

      if (!updateInput.entry_tag) {
        updates.entry_tag = await this.determineEntryTag({
          userProfileId: entry.user_profile_id,
          loggedAt: context.isoString,
          timezoneOffsetMinutes: context.offsetMinutes,
          timeZone: context.timeZone,
          fastId: updates.fast_id || entry.fast_id,
          source: updates.source || entry.source
        });
      }
    }

    if (updates.entry_tag) {
      // Ensure canonical reason stays in sync when recalculated later
      if (entry.is_canonical && entry.canonical_status === 'auto') {
        updates.canonical_reason = updates.entry_tag;
      }
    }

    await this.db.updateBodyLogEntry(entryId, updates);
    const refreshed = await this.db.getBodyLogEntryById(entryId);

    if (refreshed.is_canonical && refreshed.canonical_status === 'manual') {
      return refreshed;
    }

    await this.autoSelectCanonical(refreshed.user_profile_id, refreshed.local_date);
    return this.db.getBodyLogEntryById(entryId);
  }

  async deleteEntry(entryId) {
    const entry = await this.db.getBodyLogEntryById(entryId);
    if (!entry) {
      return { deleted: false };
    }

    const result = await this.db.deleteBodyLogEntry(entryId);

    if (entry.is_canonical) {
      await this.autoSelectCanonical(entry.user_profile_id, entry.local_date, { force: true });
    }

    return result;
  }

  async setManualCanonical(entryId) {
    const entry = await this.db.getBodyLogEntryById(entryId);
    if (!entry) {
      throw new Error('Body log entry not found');
    }

    const updated = await this.db.markCanonicalEntry(entryId, {
      canonicalStatus: 'manual',
      canonicalReason: entry.entry_tag
    });

    return updated;
  }

  async clearManualCanonical(entryId) {
    const entry = await this.db.getBodyLogEntryById(entryId);
    if (!entry) {
      throw new Error('Body log entry not found');
    }

    await this.db.updateBodyLogEntry(entryId, {
      is_canonical: 0,
      canonical_status: 'auto',
      canonical_reason: null,
      canonical_override_at: null
    });

    return this.autoSelectCanonical(entry.user_profile_id, entry.local_date, { force: true });
  }

  async recordFastWeight({
    userProfileId,
    fastId,
    phase,
    weight,
    bodyFat = null,
    loggedAt,
    timezoneOffsetMinutes = null,
    timeZone = null
  }) {
    if (!userProfileId || !fastId) {
      throw new Error('userProfileId and fastId are required to record fast weight');
    }

    const phaseSourceMap = {
      start: 'fast_start',
      end: 'fast_end',
      completion: 'fast_completion',
      refeed: 'post_fast_prompt'
    };

    const source = phaseSourceMap[phase] || 'fast_linked';

    const tagHint = phase === 'end' || phase === 'completion' ? 'post_fast' : null;

    return this.createEntry({
      userProfileId,
      loggedAt,
      weight,
      bodyFat,
      timezoneOffsetMinutes,
      timeZone,
      fastId,
      source,
      tagHint
    });
  }
}

module.exports = BodyLogService;
