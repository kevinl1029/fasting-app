const BodyLogService = require('./BodyLogService');
const FastEffectivenessService = require('./FastEffectivenessService');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RETENTION_WINDOW_MS = 48 * 60 * 60 * 1000;

class BodyLogAnalyticsService {
  constructor(database, bodyLogService = null, options = {}) {
    this.db = database;
    this.bodyLogService = bodyLogService || new BodyLogService(database, options);
    this.fastEffectivenessService = new FastEffectivenessService();
    this.useEnhancedEffectiveness = options.useEnhancedEffectiveness ?? true; // Feature flag
  }

  formatDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  normalizeEntry(entry) {
    if (!entry) {
      return null;
    }

    return {
      id: entry.id,
      fastId: entry.fast_id,
      loggedAt: entry.logged_at,
      localDate: entry.local_date,
      timezoneOffsetMinutes: entry.timezone_offset_minutes,
      weight: entry.weight !== null && entry.weight !== undefined ? Number(entry.weight) : null,
      bodyFat: entry.body_fat !== null && entry.body_fat !== undefined ? Number(entry.body_fat) : null,
      entryTag: entry.entry_tag,
      source: entry.source,
      notes: entry.notes,
      isCanonical: !!entry.is_canonical,
      canonicalStatus: entry.canonical_status,
      canonicalReason: entry.canonical_reason,
      canonicalOverrideAt: entry.canonical_override_at,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at
    };
  }

  normalizeFast(fast) {
    if (!fast) {
      return null;
    }

    return {
      id: fast.id,
      startTime: fast.start_time,
      endTime: fast.end_time,
      durationHours: fast.duration_hours,
      userProfileId: fast.user_profile_id,
      weight: fast.weight,
      source: fast.source
    };
  }

  buildFastSnapshot(fast, entries = [], allUserEntries = []) {
    if (!fast) {
      return null;
    }

    const safeEntries = Array.isArray(entries) ? entries.slice() : [];

    const weightEntries = safeEntries
      .filter((entry) => entry && entry.logged_at && entry.weight !== null && entry.weight !== undefined)
      .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());

    // Look for explicit fast_start entry first
    let startEntry = weightEntries.find((entry) => entry.entry_tag === 'fast_start' || entry.source === 'fast_start')
      || null;

    // If no fast_start entry, try to use the first entry that's logged BEFORE the fast started
    if (!startEntry && fast.start_time) {
      const fastStartTimestamp = new Date(fast.start_time).getTime();
      if (!Number.isNaN(fastStartTimestamp)) {
        startEntry = weightEntries.find((entry) => {
          const entryTimestamp = new Date(entry.logged_at).getTime();
          return !Number.isNaN(entryTimestamp) && entryTimestamp < fastStartTimestamp;
        }) || null;
      }
    }

    // If no start entry found in fast-linked entries, look backwards in all user entries
    // but only within the same local day as the fast start time
    if (!startEntry && fast.start_time && Array.isArray(allUserEntries) && allUserEntries.length > 0) {
      const fastStartTime = new Date(fast.start_time);
      if (!Number.isNaN(fastStartTime.getTime())) {
        const fastStartTimestamp = fastStartTime.getTime();

        // Determine the local date of the fast start by looking at timezone offset
        // Use the first entry's timezone offset as a proxy for user's timezone
        // (In a real scenario, we'd want to store the fast's timezone explicitly)
        let fastStartLocalDate = null;
        const referenceEntry = allUserEntries.find((e) => e && e.timezone_offset_minutes !== null && e.timezone_offset_minutes !== undefined);
        if (referenceEntry && referenceEntry.timezone_offset_minutes !== null) {
          // Apply the timezone offset to get local time
          // Negative offset means local time is behind UTC (e.g., -240 = UTC-4 = EDT)
          // To convert UTC to local: UTC + offset
          const offsetMs = referenceEntry.timezone_offset_minutes * 60 * 1000;
          const localTime = new Date(fastStartTimestamp + offsetMs);
          fastStartLocalDate = this.formatDate(localTime);
        } else {
          // Fallback to UTC date if no timezone info available
          fastStartLocalDate = this.formatDate(fastStartTime);
        }

        // Find most recent entry before fast start, but with the same local_date
        const candidateEntries = allUserEntries
          .filter((entry) => {
            if (!entry || !entry.logged_at || entry.weight === null || entry.weight === undefined) {
              return false;
            }
            const entryTime = new Date(entry.logged_at);
            if (Number.isNaN(entryTime.getTime())) {
              return false;
            }
            const entryTimestamp = entryTime.getTime();
            // Entry must be before fast start AND have the same local_date
            return entryTimestamp < fastStartTimestamp && entry.local_date === fastStartLocalDate;
          })
          .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()); // Sort descending (most recent first)

        if (candidateEntries.length > 0) {
          startEntry = candidateEntries[0]; // Most recent entry before fast start on same local day
        }
      }
    }

    const postFastEntry = safeEntries
      .filter((entry) => entry && entry.entry_tag === 'post_fast' && entry.weight !== null && entry.weight !== undefined)
      .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime())[0]
      || null;

    const startWeight = startEntry && startEntry.weight !== null && startEntry.weight !== undefined
      ? Number(startEntry.weight)
      : (fast.weight !== null && fast.weight !== undefined ? Number(fast.weight) : null);

    const postWeight = postFastEntry && postFastEntry.weight !== null && postFastEntry.weight !== undefined
      ? Number(postFastEntry.weight)
      : null;

    const startBodyFat = startEntry && startEntry.body_fat !== null && startEntry.body_fat !== undefined
      ? Number(startEntry.body_fat)
      : null;

    const postBodyFat = postFastEntry && postFastEntry.body_fat !== null && postFastEntry.body_fat !== undefined
      ? Number(postFastEntry.body_fat)
      : null;

    return {
      startEntry,
      postEntry: postFastEntry,
      startWeight,
      postWeight,
      startBodyFat,
      postBodyFat
    };
  }

  /**
   * Fetch user profile and fast data for enhanced effectiveness calculation
   */
  async fetchEnhancedEffectivenessData(fast) {
    if (!fast || !fast.user_profile_id) {
      return null;
    }

    try {
      const profile = await this.db.getUserProfileById(fast.user_profile_id);
      return {
        heightCm: profile?.height_cm,
        age: profile?.age,
        sex: profile?.sex,
        ketoAdapted: profile?.keto_adapted || 'none',
        tdeeOverride: profile?.tdee_override,
        startInKetosis: fast.start_in_ketosis || false,
        preFastProteinGrams: fast.pre_fast_protein_grams || 0,
        carbStatus: fast.carb_status || 'normal'
      };
    } catch (error) {
      console.error('Error fetching enhanced effectiveness data:', error);
      return null;
    }
  }

  async computeFastEffectivenessFromSnapshot(fast, snapshot) {
    if (!fast || !snapshot) {
      return {
        status: 'not_found',
        message: 'We could not find this fast entry.'
      };
    }

    const {
      startEntry,
      postEntry,
      startWeight,
      postWeight,
      startBodyFat,
      postBodyFat
    } = snapshot;

    if (startWeight === null || startWeight === undefined || Number.isNaN(startWeight)) {
      return {
        status: 'missing_start',
        fastId: fast.id,
        message: 'Add a start weight to this fast to size up its effectiveness.'
      };
    }

    if (!postEntry || postWeight === null || postWeight === undefined || Number.isNaN(postWeight)) {
      return {
        status: 'missing_post_fast',
        fastId: fast.id,
        message: 'Log your post-fast weight to see what portion came from fat vs. fluid.'
      };
    }

    // Try enhanced effectiveness calculation if enabled
    if (this.useEnhancedEffectiveness && fast.duration_hours) {
      const enhancedData = await this.fetchEnhancedEffectivenessData(fast);

      if (enhancedData) {
        const result = this.fastEffectivenessService.calculateFastEffectiveness({
          startWeight,
          postWeight,
          startBodyFat,
          postBodyFat,
          fastDurationHours: fast.duration_hours,
          tdee: enhancedData.tdeeOverride,
          heightCm: enhancedData.heightCm,
          age: enhancedData.age,
          sex: enhancedData.sex,
          ketoAdapted: enhancedData.ketoAdapted,
          startInKetosis: enhancedData.startInKetosis,
          preFastProteinGrams: enhancedData.preFastProteinGrams,
          carbStatus: enhancedData.carbStatus
        });

        if (result.status === 'ok') {
          // Add legacy fields for compatibility
          return {
            ...result,
            fastId: fast.id,
            startEntryId: startEntry ? startEntry.id : null,
            postEntryId: postEntry.id,
            bodyFatChange: (startBodyFat != null && postBodyFat != null) ? this.round(postBodyFat - startBodyFat) : null,
            bodyFatChangeAbs: (startBodyFat != null && postBodyFat != null) ? Math.abs(this.round(postBodyFat - startBodyFat)) : null,
            bodyFatChangeSignificant: (startBodyFat != null && postBodyFat != null) ? Math.abs(postBodyFat - startBodyFat) >= 0.3 : false,
            message: this.generateEnhancedMessage(result),
            enhanced: true, // Flag to indicate enhanced calculation
            raw: {
              startWeight,
              postWeight,
              startBodyFat,
              postBodyFat,
              weightLost: result.totalWeightLost
            }
          };
        }
      }
    }

    const weightDeltaRaw = postWeight - startWeight;
    const weightLostRaw = startWeight - postWeight;

    let fatLossRaw = null;
    let waterLossRaw = null;
    let breakdownSource = 'estimated';

    if (startBodyFat !== null && startBodyFat !== undefined && postBodyFat !== null && postBodyFat !== undefined) {
      const startFatMass = startWeight * (startBodyFat / 100);
      const postFatMass = postWeight * (postBodyFat / 100);
      const fatMassLost = startFatMass - postFatMass;
      fatLossRaw = fatMassLost >= 0 ? fatMassLost : 0;
      waterLossRaw = weightLostRaw - fatLossRaw;
      if (waterLossRaw < 0) {
        waterLossRaw = 0;
      }
      breakdownSource = 'measured';
    } else if (weightLostRaw > 0) {
      const estimatedFat = Math.min(weightLostRaw, Math.max(0.3, weightLostRaw * 0.25));
      fatLossRaw = estimatedFat;
      waterLossRaw = Math.max(0, weightLostRaw - estimatedFat);
    }

    const bodyFatChange = (startBodyFat !== null && startBodyFat !== undefined && postBodyFat !== null && postBodyFat !== undefined)
      ? this.round(postBodyFat - startBodyFat)
      : null;
    const bodyFatChangeAbs = bodyFatChange !== null ? Math.abs(bodyFatChange) : null;
    const bodyFatChangeSignificant = bodyFatChangeAbs !== null && bodyFatChangeAbs >= 0.3;

    const weightLost = this.round(weightLostRaw);
    const weightDelta = this.round(weightDeltaRaw);
    const fatLoss = fatLossRaw !== null ? this.round(fatLossRaw) : null;
    const waterLoss = waterLossRaw !== null ? this.round(waterLossRaw) : null;

    let message = 'Most of the rapid scale drop is fluid. Keep logging to see what sticks.';
    if (weightLost !== null && weightLost <= 0) {
      message = 'Weight held steady—your body still got the metabolic reset.';
    } else if (fatLoss !== null && fatLoss >= 0.5) {
      message = `Great work—about ${fatLoss} lb look like fat loss. Expect some fluid rebound within a day or two.`;
    } else if (weightLost !== null && weightLost >= 1.5) {
      message = 'Expect part of this drop to rebound as you rehydrate. Morning weigh-ins will confirm the real loss.';
    }

    return {
      status: 'ok',
      fastId: fast.id,
      startWeight: this.round(startWeight),
      postWeight: this.round(postWeight),
      weightLost,
      weightDelta,
      startBodyFat: startBodyFat !== null && startBodyFat !== undefined ? this.round(startBodyFat) : null,
      postBodyFat: postBodyFat !== null && postBodyFat !== undefined ? this.round(postBodyFat) : null,
      bodyFatChange,
      bodyFatChangeAbs,
      bodyFatChangeSignificant,
      fatLoss,
      waterLoss,
      breakdownSource,
      startEntryId: startEntry ? startEntry.id : null,
      postEntryId: postEntry.id,
      message,
      raw: {
        startWeight,
        postWeight,
        weightDelta: weightDeltaRaw,
        weightLost: weightLostRaw,
        fatLoss: fatLossRaw,
        waterLoss: waterLossRaw,
        startBodyFat,
        postBodyFat
      }
    };
  }

  deriveProtocolGroup(fast, snapshot) {
    if (!fast) {
      return {
        key: 'custom',
        label: 'Custom Fast',
        anchorHours: null,
        source: 'unknown',
        plannedHours: null,
        actualHours: null
      };
    }

    const plannedHours = fast.planned_duration_hours !== null && fast.planned_duration_hours !== undefined
      ? Number(fast.planned_duration_hours)
      : null;

    let actualHours = fast.duration_hours !== null && fast.duration_hours !== undefined
      ? Number(fast.duration_hours)
      : null;

    if ((actualHours === null || Number.isNaN(actualHours)) && fast.start_time && fast.end_time) {
      const start = new Date(fast.start_time);
      const end = new Date(fast.end_time);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        actualHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }
    }

    const anchorCandidate = plannedHours && !Number.isNaN(plannedHours)
      ? plannedHours
      : actualHours;

    const normalizedHours = anchorCandidate !== null && anchorCandidate !== undefined && !Number.isNaN(anchorCandidate)
      ? Math.round(anchorCandidate)
      : null;

    const source = plannedHours && !Number.isNaN(plannedHours) ? 'planned' : 'actual';

    if (normalizedHours === null) {
      return {
        key: 'custom',
        label: 'Custom Fast',
        anchorHours: actualHours || null,
        source,
        plannedHours: plannedHours || null,
        actualHours: actualHours || null
      };
    }

    let key = 'custom';
    let label = 'Custom Fast';
    let anchorHours = normalizedHours;

    if (normalizedHours <= 18) {
      key = '18h';
      label = '18h Reset';
      anchorHours = 18;
    } else if (normalizedHours <= 24) {
      key = '24h';
      label = '24h Reset';
      anchorHours = 24;
    } else if (normalizedHours <= 36) {
      key = '36h';
      label = '36h Deep Reset';
      anchorHours = 36;
    } else if (normalizedHours <= 48) {
      key = '48h';
      label = '48h Extended';
      anchorHours = 48;
    } else if (normalizedHours <= 60) {
      key = '60h';
      label = '60h Push';
      anchorHours = 60;
    } else {
      key = '72h_plus';
      label = '72h+ Prolonged';
      anchorHours = 72;
    }

    return {
      key,
      label,
      anchorHours,
      source,
      plannedHours: plannedHours || null,
      actualHours: actualHours || null
    };
  }

  calculateRetentionForFast(fast, snapshot, canonicalEntries = []) {
    if (!fast || !snapshot || !snapshot.postEntry) {
      return null;
    }

    const { startWeight, postWeight, postEntry } = snapshot;
    if (startWeight === null || startWeight === undefined || postWeight === null || postWeight === undefined) {
      return null;
    }

    const postTimestamp = new Date(postEntry.logged_at).getTime();
    if (Number.isNaN(postTimestamp)) {
      return null;
    }

    const lossDuringFastRaw = startWeight - postWeight;
    const cutoff = postTimestamp + RETENTION_WINDOW_MS;

    const candidateCanonical = (canonicalEntries || [])
      .filter((entry) => entry && entry.id !== postEntry.id)
      .map((entry) => {
        const loggedAt = entry.loggedAt || entry.logged_at;
        const timestamp = new Date(loggedAt).getTime();
        return {
          ...entry,
          loggedAt,
          timestamp
        };
      })
      .filter((entry) => !Number.isNaN(entry.timestamp) && entry.timestamp > postTimestamp && entry.timestamp <= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (!candidateCanonical) {
      return {
        status: 'waiting',
        fastId: fast.id,
        message: 'We don’t have a weigh-in to gauge retention yet.',
        postFastWeight: this.round(postWeight),
        postFastLoggedAt: postEntry.logged_at
      };
    }

    const nextWeight = candidateCanonical.weight !== null && candidateCanonical.weight !== undefined
      ? Number(candidateCanonical.weight)
      : null;

    if (nextWeight === null || Number.isNaN(nextWeight)) {
      return null;
    }

    const regainedRaw = nextWeight - postWeight;
    const retainedRaw = lossDuringFastRaw > 0
      ? Math.max(0, lossDuringFastRaw - Math.max(0, regainedRaw))
      : 0;
    const retentionPercentRaw = lossDuringFastRaw > 0
      ? Math.max(0, Math.min(1, retainedRaw / lossDuringFastRaw)) * 100
      : 0;

    return {
      status: 'ok',
      fastId: fast.id,
      postFastWeight: this.round(postWeight),
      postFastLoggedAt: postEntry.logged_at,
      nextCanonicalWeight: this.round(nextWeight),
      nextCanonicalLoggedAt: candidateCanonical.loggedAt,
      weightLostDuringFast: this.round(lossDuringFastRaw),
      weightRegained: this.round(Math.max(0, regainedRaw)),
      retentionPercent: this.round(retentionPercentRaw, 0),
      raw: {
        weightLostDuringFast: lossDuringFastRaw,
        weightRegained: Math.max(0, regainedRaw),
        retentionPercent: retentionPercentRaw
      }
    };
  }

  generateEnhancedMessage(result) {
    const { fatLoss, muscleLoss, fluidLoss, totalWeightLost } = result;

    // No weight lost or gained
    if (totalWeightLost <= 0) {
      return 'Weight held steady—your body still got the metabolic reset.';
    }

    // Significant fat loss
    if (fatLoss >= 1.0) {
      return `Excellent work—${fatLoss} lbs of fat lost. Most fluid will rebound within a day or two.`;
    } else if (fatLoss >= 0.5) {
      return `Good progress—about ${fatLoss} lbs looks like fat loss. Expect some fluid rebound.`;
    }

    // Mostly fluid
    if (fluidLoss / totalWeightLost > 0.7) {
      return 'Most of the drop is temporary fluid. Keep logging to see what sticks.';
    }

    // Default message
    return 'Your body is adapting. Continue tracking to see the real trends.';
  }

  round(value, decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return null;
    }
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  startOfWeekUtc(date) {
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = utcDate.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday as start of week
    utcDate.setUTCDate(utcDate.getUTCDate() + diff);
    return utcDate;
  }

  async getAnalytics(userProfileId, options = {}) {
    const { days = 90 } = options;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * MS_PER_DAY);

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const startDateString = this.formatDate(startDate);
    const endDateString = this.formatDate(endDate);

    const canonicalEntries = await this.db.getCanonicalEntriesByRange(userProfileId, startDateString, endDateString);
    canonicalEntries.sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
    const normalizedCanonical = canonicalEntries.map((entry) => this.normalizeEntry(entry));

    const allEntries = await this.db.getBodyLogEntriesByUser(userProfileId, {
      startDate: startDateString,
      endDate: endDateString,
      includeSecondary: true
    });

    const postFastEntries = allEntries
      .filter((entry) => entry.entry_tag === 'post_fast' && !entry.is_canonical)
      .map((entry) => this.normalizeEntry(entry));

    const fasts = await this.db.getFastsByUserAndDateRange(userProfileId, startIso, endIso);
    const normalizedFasts = fasts.map((fast) => this.normalizeFast(fast));

    const weeklyComposition = this.computeWeeklyComposition(normalizedCanonical);
    const retention = await this.computeRetention(userProfileId, fasts, normalizedCanonical);
    const rollingInsights = await this.computeRollingInsights(userProfileId, fasts, normalizedCanonical, { days });

    let fastEffectiveness = null;
    const completedFasts = fasts
      .filter((fast) => fast && fast.end_time)
      .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());

    if (completedFasts.length > 0) {
      const latestFast = completedFasts[0];
      fastEffectiveness = await this.getFastEffectiveness(userProfileId, latestFast.id, {
        fastRecord: latestFast
      });
    }

    if (!fastEffectiveness) {
      fastEffectiveness = {
        status: 'no-data',
        message: 'Complete a fast with start and post-fast weights to size up effectiveness.'
      };
    }

    return {
      range: {
        start: startIso,
        end: endIso
      },
      canonicalEntries: normalizedCanonical,
      postFastEntries,
      fasts: normalizedFasts,
      weeklyComposition,
      retention,
      fastEffectiveness,
      rollingInsights
    };
  }

  computeWeeklyComposition(canonicalEntries) {
    if (!canonicalEntries || canonicalEntries.length === 0) {
      return [];
    }

    const weeks = new Map();

    canonicalEntries.forEach((entry) => {
      if (!entry || entry.weight === null || entry.localDate === null) {
        return;
      }

      const entryDate = entry.localDate
        ? new Date(`${entry.localDate}T00:00:00Z`)
        : new Date(entry.loggedAt);
      if (Number.isNaN(entryDate.getTime())) {
        return;
      }

      const weekStart = this.startOfWeekUtc(entryDate);
      const key = this.formatDate(weekStart);
      if (!weeks.has(key)) {
        weeks.set(key, {
          weekStart,
          entries: []
        });
      }
      weeks.get(key).entries.push(entry);
    });

    const sortedWeekKeys = Array.from(weeks.keys()).sort();
    const results = [];

    sortedWeekKeys.forEach((key) => {
      const weekData = weeks.get(key);
      const entries = weekData.entries;
      const weightValues = entries
        .map((entry) => entry.weight)
        .filter((value) => value !== null && value !== undefined && !Number.isNaN(value));
      if (weightValues.length === 0) {
        return;
      }

      const avgWeight = weightValues.reduce((sum, value) => sum + value, 0) / weightValues.length;

      const bodyFatValues = entries
        .map((entry) => entry.bodyFat)
        .filter((value) => value !== null && value !== undefined && !Number.isNaN(value));

      const avgBodyFat = bodyFatValues.length > 0
        ? bodyFatValues.reduce((sum, value) => sum + value, 0) / bodyFatValues.length
        : null;

      const fatMass = avgBodyFat !== null ? avgWeight * (avgBodyFat / 100) : null;
      const leanMass = avgBodyFat !== null ? avgWeight - fatMass : null;

      const weekStartDate = new Date(weekData.weekStart.getTime());
      const weekEndDate = new Date(weekStartDate.getTime() + 6 * MS_PER_DAY);

      results.push({
        weekStart: key,
        weekEnd: this.formatDate(weekEndDate),
        averageWeight: this.round(avgWeight),
        averageBodyFat: avgBodyFat !== null ? this.round(avgBodyFat) : null,
        averageFatMass: fatMass !== null ? this.round(fatMass) : null,
        averageLeanMass: leanMass !== null ? this.round(leanMass) : null
      });
    });

    for (let i = 0; i < results.length; i += 1) {
      const current = results[i];
      const previous = results[i - 1] || null;
      if (!previous) {
        current.deltaWeight = null;
        current.deltaFatMass = null;
        current.deltaLeanMass = null;
        continue;
      }

      current.deltaWeight = (current.averageWeight !== null && previous.averageWeight !== null)
        ? this.round(current.averageWeight - previous.averageWeight)
        : null;
      current.deltaFatMass = (current.averageFatMass !== null && previous.averageFatMass !== null)
        ? this.round(current.averageFatMass - previous.averageFatMass)
        : null;
      current.deltaLeanMass = (current.averageLeanMass !== null && previous.averageLeanMass !== null)
        ? this.round(current.averageLeanMass - previous.averageLeanMass)
        : null;
    }

    return results;
  }

  async computeRetention(userProfileId, fasts, canonicalEntries) {
    if (!fasts || fasts.length === 0) {
      return {
        status: 'no-data',
        message: 'Complete a fast with start and post-fast weights to see retention insights.'
      };
    }

    const normalizedCanonical = Array.isArray(canonicalEntries) ? canonicalEntries : [];

    const completedFasts = fasts
      .filter((fast) => fast && fast.user_profile_id === userProfileId && fast.end_time)
      .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());

    // Fetch all user entries once for lookback logic
    const allUserEntries = await this.db.getBodyLogEntriesByUser(userProfileId, { includeSecondary: true });

    for (const fast of completedFasts) {
      const entries = await this.db.getBodyLogEntriesByFastId(fast.id);
      if (!entries || entries.length === 0) {
        continue;
      }

      const snapshot = this.buildFastSnapshot(fast, entries, allUserEntries);
      if (!snapshot || !snapshot.postEntry) {
        continue;
      }

      const retentionInsight = this.calculateRetentionForFast(fast, snapshot, normalizedCanonical);
      if (!retentionInsight) {
        continue;
      }

      if (retentionInsight.status === 'waiting') {
        return retentionInsight;
      }

      if (retentionInsight.status === 'ok') {
        return retentionInsight;
      }
    }

    return {
      status: 'no-data',
      message: 'Complete a fast with start and post-fast weights to see retention insights.'
    };
  }

  async getFastEffectiveness(userProfileId, fastId, options = {}) {
    const { fastRecord = null, entries: preloadedEntries = null } = options;

    let fast = fastRecord && fastRecord.id ? fastRecord : null;
    if (!fast || fast.id !== fastId) {
      fast = await this.db.getFastById(fastId);
    }

    if (!fast || fast.user_profile_id !== userProfileId) {
      return {
        status: 'not_found',
        message: 'We could not find this fast entry.'
      };
    }

    const entries = preloadedEntries || await this.db.getBodyLogEntriesByFastId(fast.id);
    // Fetch all user entries for lookback logic
    const allUserEntries = await this.db.getBodyLogEntriesByUser(userProfileId, { includeSecondary: true });
    const snapshot = this.buildFastSnapshot(fast, entries, allUserEntries);
    return this.computeFastEffectivenessFromSnapshot(fast, snapshot);
  }

  async computeRollingInsights(userProfileId, fasts, canonicalEntries, options = {}) {
    const { days = 90, limitProtocols = 3 } = options;

    if (!fasts || fasts.length === 0) {
      return {
        status: 'no-data',
        message: 'Complete a fast with start and post-fast weights to see protocol insights.'
      };
    }

    const normalizedCanonical = Array.isArray(canonicalEntries) ? canonicalEntries : [];

    const completedFasts = fasts
      .filter((fast) => fast && fast.user_profile_id === userProfileId && fast.end_time)
      .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime());

    // Fetch all user entries once for lookback logic
    const allUserEntries = await this.db.getBodyLogEntriesByUser(userProfileId, { includeSecondary: true });

    const samples = [];

    for (const fast of completedFasts) {
      const entries = await this.db.getBodyLogEntriesByFastId(fast.id);
      if (!entries || entries.length === 0) {
        continue;
      }

      const snapshot = this.buildFastSnapshot(fast, entries, allUserEntries);
      if (!snapshot || snapshot.startWeight === null || snapshot.postWeight === null) {
        continue;
      }

      const effectiveness = this.computeFastEffectivenessFromSnapshot(fast, snapshot);
      if (!effectiveness || effectiveness.status !== 'ok') {
        continue;
      }

      const retention = this.calculateRetentionForFast(fast, snapshot, normalizedCanonical);
      const protocol = this.deriveProtocolGroup(fast, snapshot);

      samples.push({
        fast,
        effectiveness,
        retention,
        protocol
      });
    }

    if (samples.length === 0) {
      return {
        status: 'no-data',
        message: 'Log start and post-fast weights to unlock rolling insights.'
      };
    }

    let totalWeightDelta = 0;
    let totalWeightLossPositive = 0;
    let positiveSamples = 0;
    let totalRetention = 0;
    let retentionSamples = 0;
    let totalFatLoss = 0;
    let fatSamples = 0;

    const protocolGroups = new Map();

    samples.forEach((sample) => {
      const deltaRaw = sample.effectiveness.raw?.weightDelta;
      if (typeof deltaRaw === 'number' && !Number.isNaN(deltaRaw)) {
        totalWeightDelta += deltaRaw;
      }

      const lossRaw = sample.effectiveness.raw?.weightLost;
      if (typeof lossRaw === 'number' && !Number.isNaN(lossRaw)) {
        if (lossRaw > 0) {
          totalWeightLossPositive += lossRaw;
          positiveSamples += 1;
        }
      }

      const fatLossRaw = sample.effectiveness.raw?.fatLoss;
      if (typeof fatLossRaw === 'number' && !Number.isNaN(fatLossRaw)) {
        totalFatLoss += fatLossRaw;
        fatSamples += 1;
      }

      const retentionRaw = sample.retention && sample.retention.status === 'ok'
        ? sample.retention.raw?.retentionPercent
        : null;
      if (typeof retentionRaw === 'number' && !Number.isNaN(retentionRaw)) {
        totalRetention += retentionRaw;
        retentionSamples += 1;
      }

      const key = sample.protocol.key || 'custom';
      if (!protocolGroups.has(key)) {
        protocolGroups.set(key, {
          key,
          label: sample.protocol.label || 'Custom Fast',
          anchorHours: sample.protocol.anchorHours || sample.protocol.actualHours || 0,
          source: sample.protocol.source,
          count: 0,
          totalWeightDelta: 0,
          totalWeightLossPositive: 0,
          positiveSamples: 0,
          totalRetention: 0,
          retentionSamples: 0,
          totalFatLoss: 0,
          fatSamples: 0
        });
      }

      const group = protocolGroups.get(key);
      group.count += 1;

      if (typeof deltaRaw === 'number' && !Number.isNaN(deltaRaw)) {
        group.totalWeightDelta += deltaRaw;
      }

      if (typeof lossRaw === 'number' && !Number.isNaN(lossRaw) && lossRaw > 0) {
        group.totalWeightLossPositive += lossRaw;
        group.positiveSamples += 1;
      }

      if (typeof retentionRaw === 'number' && !Number.isNaN(retentionRaw)) {
        group.totalRetention += retentionRaw;
        group.retentionSamples += 1;
      }

      if (typeof fatLossRaw === 'number' && !Number.isNaN(fatLossRaw)) {
        group.totalFatLoss += fatLossRaw;
        group.fatSamples += 1;
      }
    });

    const protocolSummaries = Array.from(protocolGroups.values())
      .map((group) => ({
        key: group.key,
        label: group.label,
        anchorHours: group.anchorHours,
        count: group.count,
        averageWeightDelta: group.count > 0 ? this.round(group.totalWeightDelta / group.count) : null,
        averageWeightDrop: group.positiveSamples > 0 ? this.round(group.totalWeightLossPositive / group.positiveSamples) : null,
        averageRetentionPercent: group.retentionSamples > 0 ? this.round(group.totalRetention / group.retentionSamples, 0) : null,
        averageFatLoss: group.fatSamples > 0 ? this.round(group.totalFatLoss / group.fatSamples) : null,
        source: group.source
      }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        const aAnchor = a.anchorHours || 0;
        const bAnchor = b.anchorHours || 0;
        return bAnchor - aAnchor;
      });

    const averageWeightDelta = this.round(totalWeightDelta / samples.length);
    const averageWeightDrop = positiveSamples > 0 ? this.round(totalWeightLossPositive / positiveSamples) : null;
    const averageRetentionPercent = retentionSamples > 0 ? this.round(totalRetention / retentionSamples, 0) : null;
    const averageFatLoss = fatSamples > 0 ? this.round(totalFatLoss / fatSamples) : null;

    return {
      status: 'ok',
      sampleSize: samples.length,
      positiveSampleSize: positiveSamples,
      averageWeightDelta,
      averageWeightDrop,
      averageRetentionPercent,
      averageFatLoss,
      protocols: protocolSummaries.slice(0, limitProtocols),
      remainingProtocols: protocolSummaries.length > limitProtocols
        ? protocolSummaries.slice(limitProtocols)
        : [],
      education: {
        headline: 'Repeat protocols to see clearer trends.',
        description: `Based on ${samples.length} fast${samples.length === 1 ? '' : 's'} with start & post-fast weigh-ins in the last ${days} days.`,
        retention: 'Retention compares your post-fast weight to the next canonical weigh-in within 48 hours.'
      }
    };
  }
}

module.exports = BodyLogAnalyticsService;
