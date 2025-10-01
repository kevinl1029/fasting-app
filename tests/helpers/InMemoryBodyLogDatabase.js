class InMemoryBodyLogDatabase {
  constructor(options = {}) {
    this.fasts = new Map();
    this.entries = new Map();
    this.entrySequence = 1;
    this.nowProvider = options.nowProvider || (() => new Date().toISOString());
  }

  async initialize() {
    return;
  }

  async close() {
    return;
  }

  setNowProvider(fn) {
    this.nowProvider = fn;
  }

  _now() {
    return typeof this.nowProvider === 'function'
      ? this.nowProvider()
      : new Date().toISOString();
  }

  _clone(value) {
    if (value === null || value === undefined) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  }

  addFast(fast) {
    if (!fast || fast.id === undefined || fast.id === null) {
      throw new Error('Fast must have an id');
    }
    const stored = {
      duration_hours: fast.duration_hours || null,
      planned_duration_hours: fast.planned_duration_hours || null,
      ...fast
    };
    this.fasts.set(Number(fast.id), stored);
    return this._clone(stored);
  }

  async getFastById(id) {
    const fast = this.fasts.get(Number(id)) || null;
    return this._clone(fast);
  }

  async getFastEndingNearTimestamp(userProfileId, loggedAt, windowMinutes) {
    const timestamp = new Date(loggedAt).getTime();
    if (Number.isNaN(timestamp)) {
      return null;
    }
    let best = null;
    let bestDiff = Infinity;
    for (const fast of this.fasts.values()) {
      if (fast.user_profile_id !== userProfileId || !fast.end_time) {
        continue;
      }
      const endTs = new Date(fast.end_time).getTime();
      if (Number.isNaN(endTs)) {
        continue;
      }
      const diff = timestamp - endTs;
      if (diff >= 0 && diff <= windowMinutes * 60 * 1000 && diff < bestDiff) {
        best = fast;
        bestDiff = diff;
      }
    }
    return this._clone(best);
  }

  async getFastsByUserAndDateRange(userProfileId, startIso, endIso) {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    return Array.from(this.fasts.values())
      .filter((fast) => {
        if (fast.user_profile_id !== userProfileId) {
          return false;
        }
        const startTime = new Date(fast.start_time).getTime();
        const endTime = fast.end_time ? new Date(fast.end_time).getTime() : null;
        if (Number.isNaN(startTime)) {
          return false;
        }
        if (endTime !== null && Number.isNaN(endTime)) {
          return false;
        }
        const overlapsStart = startTime >= start && startTime <= end;
        const overlapsEnd = endTime !== null && endTime >= start && endTime <= end;
        const spansRange = startTime <= start && (endTime === null || endTime >= end);
        return overlapsStart || overlapsEnd || spansRange;
      })
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .map((fast) => this._clone(fast));
  }

  async getFastsWithWeights() {
    return Array.from(this.fasts.values())
      .filter((fast) => fast.user_profile_id && fast.weight !== null && fast.weight !== undefined)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .map((fast) => this._clone(fast));
  }

  async createBodyLogEntry(input) {
    const id = this.entrySequence++;
    const timestamp = this._now();
    const entry = {
      id,
      created_at: timestamp,
      updated_at: timestamp,
      canonical_override_at: null,
      ...input,
      is_canonical: Boolean(input.is_canonical)
    };
    this.entries.set(id, entry);
    return this._clone(entry);
  }

  async getBodyLogEntryById(id) {
    const entry = this.entries.get(Number(id)) || null;
    return this._clone(entry);
  }

  async getBodyLogEntriesByFastId(fastId) {
    return Array.from(this.entries.values())
      .filter((entry) => Number(entry.fast_id) === Number(fastId))
      .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at))
      .map((entry) => this._clone(entry));
  }

  async getBodyLogEntriesForDate(userProfileId, localDate) {
    return Array.from(this.entries.values())
      .filter((entry) => entry.user_profile_id === userProfileId && entry.local_date === localDate)
      .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at))
      .map((entry) => this._clone(entry));
  }

  async getBodyLogEntriesByUser(userProfileId, options = {}) {
    const {
      startDate = null,
      endDate = null,
      limit = null,
      offset = 0,
      includeSecondary = true
    } = options;

    let entries = Array.from(this.entries.values())
      .filter((entry) => entry.user_profile_id === userProfileId);

    if (startDate) {
      entries = entries.filter((entry) => entry.local_date >= startDate);
    }

    if (endDate) {
      entries = entries.filter((entry) => entry.local_date <= endDate);
    }

    if (!includeSecondary) {
      entries = entries.filter((entry) => entry.is_canonical);
    }

    entries.sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));

    if (limit !== null && limit !== undefined) {
      entries = entries.slice(offset, offset + limit);
    }

    return entries.map((entry) => this._clone(entry));
  }

  async getCanonicalEntryForDate(userProfileId, localDate) {
    const entry = Array.from(this.entries.values()).find(
      (item) => item.user_profile_id === userProfileId && item.local_date === localDate && item.is_canonical
    ) || null;
    return this._clone(entry);
  }

  async getCanonicalEntriesByRange(userProfileId, startDate, endDate) {
    return Array.from(this.entries.values())
      .filter((entry) => entry.user_profile_id === userProfileId
        && entry.is_canonical
        && (!startDate || entry.local_date >= startDate)
        && (!endDate || entry.local_date <= endDate))
      .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at))
      .map((entry) => this._clone(entry));
  }

  async clearCanonicalForDate(userProfileId, localDate, excludeEntryId = null) {
    let changes = 0;
    for (const entry of this.entries.values()) {
      if (entry.user_profile_id === userProfileId && entry.local_date === localDate) {
        if (excludeEntryId !== null && entry.id === excludeEntryId) {
          continue;
        }
        if (entry.is_canonical) {
          entry.is_canonical = false;
          entry.canonical_reason = null;
          entry.canonical_override_at = null;
          entry.updated_at = this._now();
          changes += 1;
        }
      }
    }
    return { changes };
  }

  async markCanonicalEntry(entryId, options = {}) {
    const entry = this.entries.get(Number(entryId));
    if (!entry) {
      throw new Error('Body log entry not found');
    }

    const {
      canonicalStatus = 'auto',
      canonicalReason = entry.entry_tag,
      overrideAt = canonicalStatus === 'manual' ? this._now() : null
    } = options;

    await this.clearCanonicalForDate(entry.user_profile_id, entry.local_date, entry.id);

    entry.is_canonical = true;
    entry.canonical_status = canonicalStatus;
    entry.canonical_reason = canonicalReason;
    entry.canonical_override_at = overrideAt;
    entry.updated_at = this._now();

    this.entries.set(entry.id, entry);
    return this._clone(entry);
  }

  async updateBodyLogEntry(entryId, updateData) {
    const entry = this.entries.get(Number(entryId));
    if (!entry) {
      return { id: entryId, changes: 0 };
    }
    Object.entries(updateData).forEach(([key, value]) => {
      if (key === 'id') {
        return;
      }
      if (key === 'is_canonical') {
        entry[key] = Boolean(value);
      } else {
        entry[key] = value;
      }
    });
    entry.updated_at = this._now();
    this.entries.set(entry.id, entry);
    return { id: entry.id, changes: 1 };
  }

  async deleteBodyLogEntry(entryId) {
    const existing = this.entries.get(Number(entryId));
    if (!existing) {
      return { deleted: false };
    }
    this.entries.delete(Number(entryId));
    return { deleted: true };
  }
}

module.exports = InMemoryBodyLogDatabase;
