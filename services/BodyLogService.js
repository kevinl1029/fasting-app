const POST_FAST_WINDOW_MINUTES = 120;
const MORNING_WINDOW_START_MINUTES = 4 * 60;
const MORNING_WINDOW_END_MINUTES = 11 * 60 + 59;

class BodyLogService {
  constructor(database, options = {}) {
    this.db = database;
    this.logger = options.logger || console;
  }

  parseIsoOffsetMinutes(loggedAt) {
    if (!loggedAt || typeof loggedAt !== 'string') {
      return null;
    }

    if (loggedAt.endsWith('Z') || loggedAt.endsWith('z')) {
      return 0;
    }

    const match = loggedAt.match(/([+-])(\d{2}):?(\d{2})$/);
    if (!match) {
      return null;
    }

    const sign = match[1] === '-' ? -1 : 1;
    const hours = parseInt(match[2], 10);
    const minutes = parseInt(match[3], 10);
    return sign * (hours * 60 + minutes);
  }

  resolveOffsetMinutes(loggedAt, timezoneOffsetMinutes) {
    if (typeof timezoneOffsetMinutes === 'number' && !Number.isNaN(timezoneOffsetMinutes)) {
      return timezoneOffsetMinutes;
    }

    const parsed = this.parseIsoOffsetMinutes(loggedAt);
    if (parsed !== null) {
      return parsed;
    }

    return 0;
  }

  getLocalContext(loggedAt, timezoneOffsetMinutes) {
    const timestamp = new Date(loggedAt);
    if (Number.isNaN(timestamp.getTime())) {
      throw new Error('Invalid logged_at timestamp for body log entry');
    }

    const offsetMinutes = this.resolveOffsetMinutes(loggedAt, timezoneOffsetMinutes);
    const localTime = new Date(timestamp.getTime() + offsetMinutes * 60 * 1000);

    return {
      offsetMinutes,
      localDate: this.formatDate(localTime),
      localTime
    };
  }

  formatDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    fastId = null,
    source = 'manual',
    tagHint = null
  }) {
    if (tagHint) {
      return tagHint;
    }

    const { localTime } = this.getLocalContext(loggedAt, timezoneOffsetMinutes);

    if (this.isWithinMorningWindow(localTime)) {
      return 'morning';
    }

    // Prefer explicit post-fast cues from source/fast
    const candidateFastIds = [];
    if (fastId) {
      candidateFastIds.push(fastId);
    }

    let nearestFast = null;
    if (candidateFastIds.length > 0) {
      const fast = await this.db.getFastById(candidateFastIds[0]);
      if (fast && fast.end_time) {
        const diffMs = new Date(loggedAt).getTime() - new Date(fast.end_time).getTime();
        if (diffMs >= 0 && diffMs <= POST_FAST_WINDOW_MINUTES * 60 * 1000) {
          nearestFast = fast;
        }
      }
    }

    if (!nearestFast) {
      nearestFast = await this.db.getFastEndingNearTimestamp(
        userProfileId,
        loggedAt,
        POST_FAST_WINDOW_MINUTES
      );
    }

    if (nearestFast) {
      const diffMs = new Date(loggedAt).getTime() - new Date(nearestFast.end_time).getTime();
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

    const { offsetMinutes, localDate } = this.getLocalContext(loggedAt, timezoneOffsetMinutes);
    const entryTag = await this.determineEntryTag({
      userProfileId,
      loggedAt,
      timezoneOffsetMinutes: offsetMinutes,
      fastId,
      source,
      tagHint
    });

    const created = await this.db.createBodyLogEntry({
      user_profile_id: userProfileId,
      fast_id: fastId,
      logged_at: loggedAt,
      local_date: localDate,
      timezone_offset_minutes: offsetMinutes,
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

    await this.autoSelectCanonical(userProfileId, localDate);
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

    if (updates.logged_at || updates.timezone_offset_minutes !== undefined) {
      const loggedAt = updates.logged_at || entry.logged_at;
      const tzOffset =
        updates.timezone_offset_minutes !== undefined
          ? updates.timezone_offset_minutes
          : entry.timezone_offset_minutes;

      const { offsetMinutes, localDate } = this.getLocalContext(loggedAt, tzOffset);
      updates.local_date = localDate;
      updates.timezone_offset_minutes = offsetMinutes;

      if (!updateInput.entry_tag) {
        updates.entry_tag = await this.determineEntryTag({
          userProfileId: entry.user_profile_id,
          loggedAt,
          timezoneOffsetMinutes: offsetMinutes,
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
    timezoneOffsetMinutes = null
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
      fastId,
      source,
      tagHint
    });
  }
}

module.exports = BodyLogService;
