const db = require('../database/db');

class DraftScheduleService {
  constructor(database = db) {
    this.db = database;
  }

  async seedFromForecast(profile) {
    if (!profile) {
      return null;
    }

    const normalizedProfile = this._normalizeProfile(profile);

    // If a schedule already exists, ensure any stale draft is removed
    const existingSchedule = await this.db.getScheduleByUserProfile(normalizedProfile.id);
    if (existingSchedule) {
      await this.db.deleteScheduleDraft(normalizedProfile.id);
      return null;
    }

    const existingDraft = await this.db.getScheduleDraftByUserProfile(normalizedProfile.id, { includeDismissed: true });
    if (existingDraft) {
      if (existingDraft.dismissed_at) {
        // Respect dismissal – do not recreate automatically until explicitly reset
        return null;
      }

      if (existingDraft.payload) {
        return existingDraft.payload;
      }
    }

    const forecastData = normalizedProfile.forecast_data;
    if (!forecastData || !forecastData.currentProtocol) {
      return null;
    }

    const draftPayload = this._buildDraftPayload(normalizedProfile, forecastData);
    await this.db.upsertScheduleDraft(normalizedProfile.id, draftPayload);
    return draftPayload;
  }

  async getDraftBySessionId(sessionId, { autoSeed = true } = {}) {
    if (!sessionId) {
      return null;
    }

    const profile = await this.db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return null;
    }

    const normalizedProfile = this._normalizeProfile(profile);

    const activeSchedule = await this.db.getScheduleByUserProfile(normalizedProfile.id);
    if (activeSchedule) {
      await this.db.deleteScheduleDraft(normalizedProfile.id);
      return null;
    }

    const draftRecord = await this.db.getScheduleDraftByUserProfile(normalizedProfile.id, { includeDismissed: true });

    if (draftRecord && draftRecord.dismissed_at) {
      // Honor user choice to dismiss the draft unless caller explicitly disables this guard
      return null;
    }

    let draft = draftRecord;

    if (!draft && autoSeed) {
      await this.seedFromForecast(normalizedProfile);
      draft = await this.db.getScheduleDraftByUserProfile(normalizedProfile.id);
    }

    if (!draft || !draft.payload) {
      return null;
    }

    return {
      userProfileId: normalizedProfile.id,
      payload: draft.payload,
      metadata: {
        id: draft.id,
        createdAt: draft.created_at,
        updatedAt: draft.updated_at,
        dismissedAt: draft.dismissed_at || null
      }
    };
  }

  async confirmDraft(sessionId, { blocks = null, weekAnchor = 1 } = {}) {
    if (!sessionId) {
      throw this._createError('SESSION_ID_REQUIRED');
    }

    const profile = await this.db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      throw this._createError('PROFILE_NOT_FOUND');
    }

    const normalizedProfile = this._normalizeProfile(profile);

    const existingSchedule = await this.db.getScheduleByUserProfile(normalizedProfile.id);
    if (existingSchedule) {
      const existingBlocks = await this.db.getFastingBlocksBySchedule(existingSchedule.id);
      return {
        schedule: existingSchedule,
        blocks: existingBlocks,
        draftCleared: false,
        alreadyActive: true
      };
    }

    const draft = await this.db.getScheduleDraftByUserProfile(normalizedProfile.id);
    if (!draft || !draft.payload) {
      throw this._createError('DRAFT_NOT_FOUND');
    }

    const draftBlocks = blocks && Array.isArray(blocks) && blocks.length > 0
      ? blocks
      : draft.payload.blocks;

    if (!draftBlocks || draftBlocks.length === 0) {
      throw this._createError('DRAFT_BLOCKS_EMPTY');
    }

    const scheduleRecord = await this.db.createSchedule({
      user_profile_id: normalizedProfile.id,
      week_anchor: weekAnchor,
      is_paused: false
    });

    for (const block of draftBlocks) {
      const normalizedBlock = this._normalizeBlock(block, scheduleRecord.id);
      await this.db.createFastingBlock(normalizedBlock);
    }

    await this.db.deleteScheduleDraft(normalizedProfile.id);

    const createdSchedule = await this.db.getScheduleByUserProfile(normalizedProfile.id);
    const scheduleBlocks = await this.db.getFastingBlocksBySchedule(createdSchedule.id);

    return {
      schedule: createdSchedule,
      blocks: scheduleBlocks,
      draftCleared: true,
      alreadyActive: false
    };
  }

  async dismissDraft(sessionId) {
    if (!sessionId) {
      throw this._createError('SESSION_ID_REQUIRED');
    }

    const profile = await this.db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      throw this._createError('PROFILE_NOT_FOUND');
    }

    const normalizedProfile = this._normalizeProfile(profile);

    const result = await this.db.markScheduleDraftDismissed(normalizedProfile.id);

    return { dismissed: result.dismissed, userProfileId: normalizedProfile.id };
  }

  _normalizeProfile(rawProfile) {
    if (!rawProfile) {
      return null;
    }

    const profile = { ...rawProfile };

    if (profile.forecast_data && typeof profile.forecast_data === 'string') {
      try {
        profile.forecast_data = JSON.parse(profile.forecast_data);
      } catch (error) {
        console.error('Failed to parse profile.forecast_data:', error);
        profile.forecast_data = null;
      }
    }

    return profile;
  }

  _buildDraftPayload(profile, forecastData) {
    const protocol = forecastData.currentProtocol || {};
    const durationHours = Number(protocol.duration) || 24;
    const frequency = Math.max(1, Math.min(Number(protocol.frequency) || 1, 3));
    const ketosis = Boolean(protocol.ketosis);

    const suggestedBlocks = this._buildSuggestedBlocks(durationHours, frequency);

    return {
      seededAt: new Date().toISOString(),
      protocol: {
        durationHours,
        frequency,
        ketosis,
        label: this._buildProtocolLabel(protocol)
      },
      blocks: suggestedBlocks,
      forecastSummary: this._buildForecastSummary(profile, forecastData)
    };
  }

  _buildSuggestedBlocks(durationHours, frequency) {
    const templates = [
      { start_dow: 1, start_time: '20:00' }, // Monday 8 PM
      { start_dow: 3, start_time: '20:00' }, // Wednesday 8 PM
      { start_dow: 5, start_time: '20:00' }  // Friday 8 PM
    ];

    const blocks = [];

    for (let i = 0; i < frequency && i < templates.length; i++) {
      const template = templates[i];
      const timing = this._calculateEndFromDuration(template.start_dow, template.start_time, durationHours);

      blocks.push({
        name: `Protocol Fast ${i + 1}`,
        start_dow: template.start_dow,
        start_time: template.start_time,
        end_dow: timing.end_dow,
        end_time: timing.end_time,
        duration_hours: durationHours,
        tz_mode: 'local',
        anchor_tz: null,
        notifications: {
          pre_start: [180, 30],
          start: true,
          completion: true
        }
      });
    }

    return blocks;
  }

  _calculateEndFromDuration(startDow, startTime, durationHours) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startMinutesTotal = (startDow * 24 * 60) + (startHour * 60) + startMinute;
    const addedMinutes = Math.round(durationHours * 60);
    const endMinutesTotal = startMinutesTotal + addedMinutes;

    const endDow = Math.floor((endMinutesTotal / (24 * 60)) % 7);
    const endMinutesInDay = ((endMinutesTotal % (24 * 60)) + (24 * 60)) % (24 * 60);
    const endHour = Math.floor(endMinutesInDay / 60);
    const endMinute = endMinutesInDay % 60;

    return {
      end_dow: endDow < 0 ? endDow + 7 : endDow,
      end_time: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
    };
  }

  _buildForecastSummary(profile, forecastData) {
    const summary = forecastData.results?.summary || {};
    const weeklyResults = forecastData.results?.weeklyResults || [];

    const sparkline = weeklyResults.slice(0, 12).map((week) => ({
      week: week.week,
      date: week.date,
      weightKg: this._toFixedNumber(week.weight, 2),
      bodyFat: this._toFixedNumber(week.bodyFat, 2)
    }));

    return {
      goalDate: profile.goal_date || null,
      targetBodyFat: profile.target_body_fat || summary.finalBodyFat || null,
      finalWeightKg: this._toFixedNumber(summary.finalWeight, 2),
      totalWeightLostKg: this._toFixedNumber(summary.totalWeightLost, 2),
      sparkline
    };
  }

  _buildProtocolLabel(protocol) {
    const duration = protocol.duration ? `${protocol.duration}-hour` : 'Custom';
    const ketosisText = protocol.ketosis ? 'Ketosis-primed' : 'Standard';
    const frequency = protocol.frequency ? `${protocol.frequency}x/week` : '1x/week';

    return `${duration} • ${ketosisText} • ${frequency}`;
  }

  _normalizeBlock(block, scheduleId) {
    if (!block) {
      throw this._createError('BLOCK_INVALID');
    }

    if (block.schedule_id && block.schedule_id !== scheduleId) {
      console.warn('Overriding block schedule_id to match new schedule');
    }

    return {
      schedule_id: scheduleId,
      name: block.name || 'Scheduled Fast',
      start_dow: Number(block.start_dow),
      start_time: block.start_time,
      end_dow: Number(block.end_dow),
      end_time: block.end_time,
      tz_mode: block.tz_mode || 'local',
      anchor_tz: block.anchor_tz || null,
      notifications: block.notifications || null,
      is_active: block.is_active === undefined ? true : !!block.is_active
    };
  }

  _toFixedNumber(value, decimals) {
    if (value === undefined || value === null || Number.isNaN(Number(value))) {
      return null;
    }

    return Number.parseFloat(Number(value).toFixed(decimals));
  }

  _createError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }
}

module.exports = DraftScheduleService;
