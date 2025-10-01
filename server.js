const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/db');
const DraftScheduleService = require('./services/DraftScheduleService');
const BodyLogService = require('./services/BodyLogService');
const BodyLogAnalyticsService = require('./services/BodyLogAnalyticsService');
const draftScheduleService = new DraftScheduleService(db);
const bodyLogService = new BodyLogService(db);
const bodyLogAnalyticsService = new BodyLogAnalyticsService(db, bodyLogService);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Session validation middleware
function validateSessionFormat(sessionId) {
    return sessionId &&
           typeof sessionId === 'string' &&
           sessionId.startsWith('fs_') &&
           sessionId.length > 10 &&
           sessionId.length < 50 &&
           /^fs_\d+_[a-z0-9]+$/.test(sessionId);
}

async function validateSessionMiddleware(req, res, next) {
    const sessionId = req.query.sessionId || req.headers['x-session-id'] || req.body.sessionId;

    if (!sessionId) {
        return res.status(400).json({
            error: 'Session required',
            code: 'MISSING_SESSION',
            message: 'Valid session ID required for this operation'
        });
    }

    if (!validateSessionFormat(sessionId)) {
        return res.status(400).json({
            error: 'Invalid session format',
            code: 'INVALID_SESSION_FORMAT',
            message: 'Session ID format is invalid'
        });
    }

    try {
        const profile = await db.getUserProfileBySessionId(sessionId);
        if (!profile) {
            // Valid session format but no user profile - this could be due to database reset
            // Return a special code that the frontend can handle for profile recovery
            return res.status(200).json({
                error: 'Profile recovery needed',
                code: 'PROFILE_RECOVERY_NEEDED',
                message: 'Session valid but user profile missing. Recovery needed.',
                sessionId,
                requiresRecovery: true,
                redirectTo: '/welcome.html'
            });
        }

        req.userProfile = profile;
        req.sessionId = sessionId;
        next();
    } catch (error) {
        console.error('Session validation error:', error);
        return res.status(500).json({
            error: 'Session validation failed',
            code: 'VALIDATION_ERROR',
            message: 'Unable to validate session'
        });
    }
}

// API Routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

app.get('/api/time', (req, res) => {
  res.json({
    currentTime: new Date().toISOString(),
    message: 'Current server time'
  });
});

// TEMPORARY DEBUG: List user profiles (remove after debugging)
app.get('/api/debug/profiles', async (req, res) => {
  try {
    const profiles = await new Promise((resolve, reject) => {
      db.db.all('SELECT id, session_id, created_at, updated_at, onboarded_at FROM user_profiles ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json({
      count: profiles.length,
      profiles: profiles,
      requestedSession: req.query.check || 'none'
    });
  } catch (error) {
    console.error('Debug profiles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Session validation endpoint
app.get('/api/session/validate', async (req, res) => {
    const sessionId = req.query.sessionId || req.sessionId;

    if (!validateSessionFormat(sessionId)) {
        return res.status(400).json({
            valid: false,
            reason: 'INVALID_FORMAT',
            message: 'Session ID format is invalid'
        });
    }

    try {
        const profile = await db.getUserProfileBySessionId(sessionId);
        return res.json({
            valid: !!profile,
            hasProfile: !!profile,
            profileId: profile?.id,
            message: profile ? 'Session is valid' : 'No profile found for session'
        });
    } catch (error) {
        console.error('Session validation error:', error);
        return res.status(500).json({
            valid: false,
            reason: 'VALIDATION_ERROR',
            message: 'Unable to validate session'
        });
    }
});

// Fasting Log API Endpoints
app.get('/api/fasts', validateSessionMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Session is guaranteed valid here - use req.userProfile
    const userFasts = await db.getFastsByUserProfile(req.userProfile.id, limit, offset);
    res.json(userFasts);
  } catch (error) {
    console.error('Error fetching fasts:', error);
    res.status(500).json({ error: 'Failed to fetch fasts' });
  }
});

app.get('/api/fasts/active', validateSessionMiddleware, async (req, res) => {
  try {
    // Session is guaranteed valid here - use req.userProfile
    const activeFast = await db.getActiveFastByUserId(req.userProfile.id);
    res.json(activeFast);
  } catch (error) {
    console.error('Error fetching active fast:', error);
    res.status(500).json({ error: 'Failed to fetch active fast' });
  }
});

app.get('/api/fasts/:id', validateSessionMiddleware, async (req, res) => {
  try {
    const fastId = parseInt(req.params.id);
    const fast = await db.getFastById(fastId);

    if (!fast) {
      return res.status(404).json({ error: 'Fast not found' });
    }

    // Ensure user can only access their own fasts
    if (fast.user_profile_id !== req.userProfile.id) {
      return res.status(403).json({ error: 'Access denied: You can only access your own fasts' });
    }

    const milestones = await db.getFastMilestones(fastId);
    const bodyLogEntries = await db.getBodyLogEntriesByFastId(fastId);

    // Extract start and end weights from body log entries
    let startWeight = null, startBodyFat = null, endWeight = null, endBodyFat = null;

    for (const entry of bodyLogEntries) {
      const entryTime = new Date(entry.logged_at).getTime();
      const startTime = new Date(fast.start_time).getTime();
      const endTime = fast.end_time ? new Date(fast.end_time).getTime() : null;

      // Check if this is a start weight (within 2 hours before start)
      if (Math.abs(entryTime - startTime) <= 2 * 60 * 60 * 1000 && entryTime <= startTime) {
        startWeight = entry.weight;
        startBodyFat = entry.body_fat;
      }

      // Check if this is an end weight (within 2 hours after end, or tagged as post_fast)
      if (endTime && (entry.entry_tag === 'post_fast' || (entryTime >= endTime && entryTime - endTime <= 2 * 60 * 60 * 1000))) {
        endWeight = entry.weight;
        endBodyFat = entry.body_fat;
      }
    }

    res.json({
      ...fast,
      milestones,
      start_weight: startWeight,
      start_body_fat: startBodyFat,
      end_weight: endWeight,
      end_body_fat: endBodyFat,
      body_log_entries: bodyLogEntries
    });
  } catch (error) {
    console.error('Error fetching fast:', error);
    res.status(500).json({ error: 'Failed to fetch fast' });
  }
});

app.post('/api/fasts', validateSessionMiddleware, async (req, res) => {
  try {
    const { start_time, end_time, notes, weight, photos, is_manual = true } = req.body;

    if (!start_time) {
      return res.status(400).json({ error: 'start_time is required' });
    }

    // Calculate duration if end_time is provided
    let duration_hours = null;
    if (end_time) {
      const start = new Date(start_time);
      const end = new Date(end_time);
      duration_hours = (end - start) / (1000 * 60 * 60);
    }

    // Session is guaranteed valid here - use req.userProfile.id
    const userProfileId = req.userProfile.id;
    
    const fastData = {
      start_time,
      end_time,
      duration_hours,
      notes,
      weight,
      photos,
      is_manual,
      is_active: !end_time,
      user_profile_id: userProfileId
    };
    
    const newFast = await db.createFast(fastData);

    const startWeight = weight ?? req.body.start_weight ?? req.body.startWeight;
    const startBodyFat = req.body.body_fat ?? req.body.bodyFat ?? req.body.start_body_fat ?? req.body.startBodyFat;
    const endWeight = req.body.end_weight ?? req.body.endWeight;
    const endBodyFat = req.body.end_body_fat ?? req.body.endBodyFat;
    const timezoneOffsetMinutes = req.body.timezone_offset_minutes ?? req.body.timezoneOffsetMinutes;

    if (startWeight !== undefined && startWeight !== null) {
      try {
        await bodyLogService.recordFastWeight({
          userProfileId,
          fastId: newFast.id,
          phase: 'start',
          weight: startWeight,
          bodyFat: startBodyFat,
          loggedAt: start_time,
          timezoneOffsetMinutes
        });
      } catch (syncError) {
        console.error('Body log sync error (fast create - start):', syncError);
      }
    }

    if (end_time && endWeight !== undefined && endWeight !== null) {
      try {
        await bodyLogService.recordFastWeight({
          userProfileId,
          fastId: newFast.id,
          phase: 'end',
          weight: endWeight,
          bodyFat: endBodyFat,
          loggedAt: end_time,
          timezoneOffsetMinutes
        });
      } catch (syncError) {
        console.error('Body log sync error (fast create - end):', syncError);
      }
    }

    res.status(201).json(newFast);
  } catch (error) {
    console.error('Error creating fast:', error);
    res.status(500).json({ error: 'Failed to create fast' });
  }
});

app.post('/api/fasts/start', validateSessionMiddleware, async (req, res) => {
  try {
    const { start_time, notes, weight } = req.body;

    // Session is guaranteed valid here - use req.userProfile.id
    const userProfileId = req.userProfile.id;

    // Check if there's already an active fast for this user
    const activeFast = await db.getActiveFastByUserId(userProfileId);
    if (activeFast) {
      return res.status(400).json({ error: 'There is already an active fast' });
    }

    const fastData = {
      start_time: start_time || new Date().toISOString(),
      notes,
      weight,
      is_manual: false,
      is_active: true,
      user_profile_id: userProfileId
    };
    
    console.log('Creating fast with data:', fastData);
    const newFast = await db.createFast(fastData);
    console.log('Fast created:', newFast);

    if (weight !== undefined && weight !== null) {
      const timezoneOffsetMinutes = req.body.timezone_offset_minutes ?? req.body.timezoneOffsetMinutes;
      const bodyFat = req.body.body_fat ?? req.body.bodyFat ?? null;

      try {
        await bodyLogService.recordFastWeight({
          userProfileId,
          fastId: newFast.id,
          phase: 'start',
          weight,
          bodyFat,
          loggedAt: fastData.start_time,
          timezoneOffsetMinutes
        });
      } catch (syncError) {
        console.error('Body log sync error (fast start):', syncError);
      }
    }

    res.status(201).json(newFast);
  } catch (error) {
    console.error('Error starting fast:', error);
    res.status(500).json({ error: 'Failed to start fast' });
  }
});

app.post('/api/fasts/:id/end', validateSessionMiddleware, async (req, res) => {
  try {
    const fastId = parseInt(req.params.id);
    const endTime = req.body.end_time || new Date().toISOString();

    // Verify ownership before ending fast
    const fast = await db.getFastById(fastId);
    if (!fast) {
      return res.status(404).json({ error: 'Fast not found' });
    }
    if (fast.user_profile_id !== req.userProfile.id) {
      return res.status(403).json({ error: 'Access denied: You can only end your own fasts' });
    }

    const updatedFast = await db.endFast(fastId, endTime);

    const weight = req.body.weight ?? req.body.end_weight ?? req.body.endWeight;
    const bodyFat = req.body.body_fat ?? req.body.end_body_fat ?? req.body.bodyFat ?? null;
    const timezoneOffsetMinutes = req.body.timezone_offset_minutes ?? req.body.timezoneOffsetMinutes;

    if (weight !== undefined && weight !== null) {
      try {
        const fastRecord = await db.getFastById(fastId);
        await bodyLogService.recordFastWeight({
          userProfileId: req.userProfile.id,
          fastId,
          phase: 'end',
          weight,
          bodyFat,
          loggedAt: fastRecord?.end_time || endTime,
          timezoneOffsetMinutes
        });
      } catch (syncError) {
        console.error('Body log sync error (fast end):', syncError);
      }
    }

    res.json(updatedFast);
  } catch (error) {
    console.error('Error ending fast:', error);
    res.status(500).json({ error: 'Failed to end fast' });
  }
});

// Body Log API Endpoints
app.get('/api/body-log', validateSessionMiddleware, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      limit,
      offset,
      includeSecondary
    } = req.query;

    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    const includeSecondaryFlag = includeSecondary === undefined
      ? true
      : includeSecondary !== 'false' && includeSecondary !== '0';

    const entries = await bodyLogService.listEntries(req.userProfile.id, {
      startDate,
      endDate,
      limit: parsedLimit,
      offset: parsedOffset,
      includeSecondary: includeSecondaryFlag
    });

    res.json(entries);
  } catch (error) {
    console.error('Error fetching body log entries:', error);
    res.status(500).json({ error: 'Failed to fetch body log entries' });
  }
});

app.post('/api/body-log', validateSessionMiddleware, async (req, res) => {
  try {
    const {
      loggedAt,
      weight,
      bodyFat,
      timezoneOffsetMinutes,
      fastId,
      source,
      notes,
      tag,
      makeCanonical
    } = req.body;

    const tzOffset = timezoneOffsetMinutes !== undefined
      ? Number(timezoneOffsetMinutes)
      : undefined;

    if (tzOffset !== undefined && Number.isNaN(tzOffset)) {
      return res.status(400).json({ error: 'Invalid timezoneOffsetMinutes value' });
    }

    const entry = await bodyLogService.createEntry({
      userProfileId: req.userProfile.id,
      loggedAt,
      weight,
      bodyFat,
      timezoneOffsetMinutes: tzOffset,
      fastId,
      source,
      notes,
      tagHint: tag,
      makeCanonical: !!makeCanonical
    });

    res.status(201).json(entry);
  } catch (error) {
    console.error('Error creating body log entry:', error);
    res.status(400).json({ error: error.message || 'Failed to create body log entry' });
  }
});

app.put('/api/body-log/:id', validateSessionMiddleware, async (req, res) => {
  try {
    const entryId = parseInt(req.params.id, 10);
    const entry = await bodyLogService.getEntry(entryId);

    if (!entry || entry.user_profile_id !== req.userProfile.id) {
      return res.status(404).json({ error: 'Body log entry not found' });
    }

    const updates = {};

    if (req.body.loggedAt !== undefined) {
      updates.logged_at = req.body.loggedAt;
    }
    if (req.body.weight !== undefined) {
      updates.weight = req.body.weight;
    }
    if (req.body.bodyFat !== undefined) {
      updates.body_fat = req.body.bodyFat;
    }
    if (req.body.fastId !== undefined) {
      updates.fast_id = req.body.fastId;
    }
    if (req.body.source !== undefined) {
      updates.source = req.body.source;
    }
    if (req.body.notes !== undefined) {
      updates.notes = req.body.notes;
    }
    if (req.body.tag !== undefined) {
      updates.entry_tag = req.body.tag;
    }

    if (req.body.timezoneOffsetMinutes !== undefined) {
      const tzOffset = Number(req.body.timezoneOffsetMinutes);
      if (Number.isNaN(tzOffset)) {
        return res.status(400).json({ error: 'Invalid timezoneOffsetMinutes value' });
      }
      updates.timezone_offset_minutes = tzOffset;
    }

    const updatedEntry = await bodyLogService.updateEntry(entryId, updates);
    res.json(updatedEntry);
  } catch (error) {
    console.error('Error updating body log entry:', error);
    res.status(400).json({ error: error.message || 'Failed to update body log entry' });
  }
});

app.delete('/api/body-log/:id', validateSessionMiddleware, async (req, res) => {
  try {
    const entryId = parseInt(req.params.id, 10);
    const entry = await bodyLogService.getEntry(entryId);

    if (!entry || entry.user_profile_id !== req.userProfile.id) {
      return res.status(404).json({ error: 'Body log entry not found' });
    }

    const result = await bodyLogService.deleteEntry(entryId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting body log entry:', error);
    res.status(500).json({ error: 'Failed to delete body log entry' });
  }
});

app.post('/api/body-log/:id/canonical', validateSessionMiddleware, async (req, res) => {
  try {
    const entryId = parseInt(req.params.id, 10);
    const entry = await bodyLogService.getEntry(entryId);

    if (!entry || entry.user_profile_id !== req.userProfile.id) {
      return res.status(404).json({ error: 'Body log entry not found' });
    }

    const updated = await bodyLogService.setManualCanonical(entryId);
    res.json(updated);
  } catch (error) {
    console.error('Error setting canonical body log entry:', error);
    res.status(500).json({ error: 'Failed to set canonical body log entry' });
  }
});

app.delete('/api/body-log/:id/canonical', validateSessionMiddleware, async (req, res) => {
  try {
    const entryId = parseInt(req.params.id, 10);
    const entry = await bodyLogService.getEntry(entryId);

    if (!entry || entry.user_profile_id !== req.userProfile.id) {
      return res.status(404).json({ error: 'Body log entry not found' });
    }

    const updated = await bodyLogService.clearManualCanonical(entryId);
    res.json(updated || { success: true });
  } catch (error) {
    console.error('Error clearing canonical body log entry:', error);
    res.status(500).json({ error: 'Failed to clear canonical body log entry' });
  }
});

app.get('/api/body-log/analytics', validateSessionMiddleware, async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 90;

    if (Number.isNaN(days) || days <= 0) {
      return res.status(400).json({ error: 'Invalid days parameter' });
    }

    const analytics = await bodyLogAnalyticsService.getAnalytics(req.userProfile.id, { days });
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching body log analytics:', error);
    res.status(500).json({ error: 'Failed to fetch body log analytics' });
  }
});

app.put('/api/fasts/:id', validateSessionMiddleware, async (req, res) => {
  try {
    const fastId = parseInt(req.params.id);
    const { start_time, end_time, notes, weight, photos, start_weight, start_body_fat, end_weight, end_body_fat, timezone_offset_minutes } = req.body;

    let updateData = { start_time, end_time, notes, weight, photos };

    // Remove undefined values
    Object.keys(updateData).forEach(key =>
      updateData[key] === undefined && delete updateData[key]
    );

    // Verify ownership and recalculate duration if times are being updated
    const fast = await db.getFastById(fastId);
    if (!fast) {
      return res.status(404).json({ error: 'Fast not found' });
    }
    if (fast.user_profile_id !== req.userProfile.id) {
      return res.status(403).json({ error: 'Access denied: You can only update your own fasts' });
    }

    if (updateData.start_time || updateData.end_time) {

      const startTime = updateData.start_time || fast.start_time;
      const endTime = updateData.end_time || fast.end_time;

      // Only mark as inactive and calculate duration if we're actually setting an end_time
      if (startTime && endTime && updateData.end_time) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        updateData.duration_hours = (end - start) / (1000 * 60 * 60);
        updateData.is_active = false;
      }
    }

    const result = await db.updateFast(fastId, updateData);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Fast not found' });
    }

    // Handle body log updates for start and end weights
    const userProfileId = req.userProfile.id;
    const finalStartTime = updateData.start_time || fast.start_time;
    const finalEndTime = updateData.end_time || fast.end_time;

    // Update or create start weight body log entry
    if (start_weight !== undefined && start_weight !== null) {
      try {
        await bodyLogService.recordFastWeight({
          userProfileId,
          fastId,
          phase: 'start',
          weight: start_weight,
          bodyFat: start_body_fat,
          loggedAt: finalStartTime,
          timezoneOffsetMinutes: timezone_offset_minutes
        });
      } catch (syncError) {
        console.error('Body log sync error (fast update - start):', syncError);
      }
    }

    // Update or create end weight body log entry
    if (finalEndTime && end_weight !== undefined && end_weight !== null) {
      try {
        await bodyLogService.recordFastWeight({
          userProfileId,
          fastId,
          phase: 'end',
          weight: end_weight,
          bodyFat: end_body_fat,
          loggedAt: finalEndTime,
          timezoneOffsetMinutes: timezone_offset_minutes
        });
      } catch (syncError) {
        console.error('Body log sync error (fast update - end):', syncError);
      }
    }

    const updatedFast = await db.getFastById(fastId);
    res.json(updatedFast);
  } catch (error) {
    console.error('Error updating fast:', error);
    res.status(500).json({ error: 'Failed to update fast' });
  }
});

app.delete('/api/fasts/:id', validateSessionMiddleware, async (req, res) => {
  try {
    const fastId = parseInt(req.params.id);

    // Verify ownership before deletion
    const fast = await db.getFastById(fastId);
    if (!fast) {
      return res.status(404).json({ error: 'Fast not found' });
    }
    if (fast.user_profile_id !== req.userProfile.id) {
      return res.status(403).json({ error: 'Access denied: You can only delete your own fasts' });
    }

    const result = await db.deleteFast(fastId);

    if (!result.deleted) {
      return res.status(404).json({ error: 'Fast not found' });
    }
    
    res.json({ message: 'Fast deleted successfully' });
  } catch (error) {
    console.error('Error deleting fast:', error);
    res.status(500).json({ error: 'Failed to delete fast' });
  }
});

// User Profile API Endpoints
app.post('/api/user/profile', async (req, res) => {
  try {
    const { sessionId, weight, weightUnit, bodyFat, targetBodyFat, activityLevel, goalDate, forecastData } = req.body;
    
    if (!sessionId || !weight || !bodyFat || !targetBodyFat) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const profileData = {
      session_id: sessionId,
      weight: weight,
      weight_unit: weightUnit || 'lb',
      body_fat: bodyFat,
      target_body_fat: targetBodyFat,
      activity_level: activityLevel,
      goal_date: goalDate,
      forecast_data: forecastData ? JSON.stringify(forecastData) : null
    };
    
    // Try to update existing profile first
    const existingProfile = await db.getUserProfileBySessionId(sessionId);
    if (existingProfile) {
      await db.updateUserProfile(sessionId, profileData);
      const updatedProfile = await db.getUserProfileBySessionId(sessionId);

      try {
        await draftScheduleService.seedFromForecast(updatedProfile);
      } catch (seedError) {
        console.error('Failed to seed draft schedule after profile update:', seedError);
      }

      res.json(updatedProfile);
    } else {
      // Create new profile
      const newProfile = await db.createUserProfile(profileData);

      try {
        await draftScheduleService.seedFromForecast(newProfile);
      } catch (seedError) {
        console.error('Failed to seed draft schedule after profile creation:', seedError);
      }

      res.status(201).json(newProfile);
    }
  } catch (error) {
    console.error('Error saving user profile:', error);
    res.status(500).json({ error: 'Failed to save user profile' });
  }
});

app.get('/api/user/profile/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const profile = await db.getUserProfileBySessionId(sessionId);
    
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    // Parse forecast_data if it exists
    if (profile.forecast_data) {
      try {
        profile.forecast_data = JSON.parse(profile.forecast_data);
      } catch (e) {
        console.error('Error parsing forecast_data:', e);
      }
    }
    
    res.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

app.post('/api/user/onboard/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const result = await db.markUserOnboarded(sessionId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    const updatedProfile = await db.getUserProfileBySessionId(sessionId);
    res.json(updatedProfile);
  } catch (error) {
    console.error('Error marking user onboarded:', error);
    res.status(500).json({ error: 'Failed to mark user as onboarded' });
  }
});

// Schedule API Endpoints
app.get('/api/schedule', validateSessionMiddleware, async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const clientTimeZone = req.query.tz;
    
    // Get user profile
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    // Get user's schedule
    const schedule = await db.getScheduleByUserProfile(profile.id);
    if (!schedule) {
      const draft = await draftScheduleService.getDraftBySessionId(sessionId);
      return res.json({
        schedule: null,
        blocks: [],
        nextInstances: [],
        draft: draft ? draft.payload : null,
        draftMetadata: draft ? draft.metadata : null
      });
    }

    // Get fasting blocks for the schedule
    const blocks = await db.getFastingBlocksBySchedule(schedule.id);

    // Generate next instances (4 weeks ahead)
    const nextInstances = await db.generatePlannedInstances(schedule.id, 4, { timeZone: clientTimeZone });
    
    res.json({
      schedule,
      blocks,
      nextInstances,
      draft: null,
      draftMetadata: null
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

app.get('/api/schedule/draft', validateSessionMiddleware, async (req, res) => {
  try {
    const draft = await draftScheduleService.getDraftBySessionId(req.sessionId);

    if (!draft) {
      return res.json({ draft: null, metadata: null });
    }

    return res.json({ draft: draft.payload, metadata: draft.metadata });
  } catch (error) {
    console.error('Error fetching schedule draft:', error);
    return res.status(500).json({ error: 'Failed to fetch schedule draft' });
  }
});

app.post('/api/schedule/draft/confirm', validateSessionMiddleware, async (req, res) => {
  try {
    const { blocks, weekAnchor } = req.body || {};
    const result = await draftScheduleService.confirmDraft(req.sessionId, { blocks, weekAnchor });

    return res.json(result);
  } catch (error) {
    console.error('Error confirming schedule draft:', error);

    if (error.code === 'PROFILE_NOT_FOUND' || error.code === 'DRAFT_NOT_FOUND') {
      return res.status(404).json({ error: error.code });
    }

    if (error.code === 'DRAFT_BLOCKS_EMPTY' || error.code === 'SESSION_ID_REQUIRED' || error.code === 'BLOCK_INVALID') {
      return res.status(400).json({ error: error.code });
    }

    return res.status(500).json({ error: 'Failed to confirm schedule draft' });
  }
});

app.post('/api/schedule/draft/dismiss', validateSessionMiddleware, async (req, res) => {
  try {
    const result = await draftScheduleService.dismissDraft(req.sessionId);
    return res.json(result);
  } catch (error) {
    console.error('Error dismissing schedule draft:', error);

    if (error.code === 'PROFILE_NOT_FOUND' || error.code === 'SESSION_ID_REQUIRED') {
      return res.status(404).json({ error: error.code });
    }

    return res.status(500).json({ error: 'Failed to dismiss schedule draft' });
  }
});

app.post('/api/schedule', validateSessionMiddleware, async (req, res) => {
  try {
    const { sessionId, week_anchor = 1 } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    
    // Get user profile
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    // Check if user already has a schedule
    const existingSchedule = await db.getScheduleByUserProfile(profile.id);
    if (existingSchedule) {
      return res.status(400).json({ error: 'User already has a schedule' });
    }
    
    // Create new schedule
    const scheduleData = {
      user_profile_id: profile.id,
      week_anchor,
      is_paused: false
    };
    
    const newSchedule = await db.createSchedule(scheduleData);
    res.status(201).json(newSchedule);
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

app.post('/api/schedule/blocks', validateSessionMiddleware, async (req, res) => {
  try {
    const { name, start_dow, start_time, end_dow, end_time, tz_mode = 'local', anchor_tz, notifications, timeZone } = req.body;

    if (start_dow === undefined || !start_time || end_dow === undefined || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Session is guaranteed valid here - use req.userProfile
    
    // Get or create user's schedule
    let schedule = await db.getScheduleByUserProfile(req.userProfile.id);
    if (!schedule) {
      // Create schedule if it doesn't exist
      const scheduleData = {
        user_profile_id: req.userProfile.id,
        week_anchor: 1,
        is_paused: false
      };
      schedule = await db.createSchedule(scheduleData);
    }
    
    // Create fasting block
    const blockData = {
      schedule_id: schedule.id,
      name,
      start_dow,
      start_time,
      end_dow,
      end_time,
      tz_mode,
      anchor_tz: anchor_tz || timeZone,
      notifications
    };
    
    const newBlock = await db.createFastingBlock(blockData);
    res.status(201).json(newBlock);
  } catch (error) {
    console.error('Error creating fasting block:', error);
    res.status(500).json({ error: 'Failed to create fasting block' });
  }
});

app.patch('/api/schedule/blocks/:id', validateSessionMiddleware, async (req, res) => {
  try {
    const blockId = parseInt(req.params.id);
    const { sessionId, name, start_dow, start_time, end_dow, end_time, tz_mode, anchor_tz, notifications, timeZone } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    
    // Verify the block exists and belongs to the user
    const block = await db.getFastingBlockById(blockId);
    if (!block) {
      return res.status(404).json({ error: 'Fasting block not found' });
    }
    
    // Get user profile to verify ownership
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    const schedule = await db.getScheduleByUserProfile(profile.id);
    if (!schedule || schedule.id !== block.schedule_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update block
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (start_dow !== undefined) updateData.start_dow = start_dow;
    if (start_time !== undefined) updateData.start_time = start_time;
    if (end_dow !== undefined) updateData.end_dow = end_dow;
    if (end_time !== undefined) updateData.end_time = end_time;
    if (tz_mode !== undefined) updateData.tz_mode = tz_mode;
    if (anchor_tz !== undefined || timeZone) updateData.anchor_tz = anchor_tz || timeZone;
    if (notifications !== undefined) updateData.notifications = notifications;
    
    const result = await db.updateFastingBlock(blockId, updateData);
    const updatedBlock = await db.getFastingBlockById(blockId);
    res.json(updatedBlock);
  } catch (error) {
    console.error('Error updating fasting block:', error);
    res.status(500).json({ error: 'Failed to update fasting block' });
  }
});

app.delete('/api/schedule/blocks/:id', validateSessionMiddleware, async (req, res) => {
  try {
    const blockId = parseInt(req.params.id);
    const { sessionId } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    
    // Verify the block exists and belongs to the user
    const block = await db.getFastingBlockById(blockId);
    if (!block) {
      return res.status(404).json({ error: 'Fasting block not found' });
    }
    
    // Get user profile to verify ownership
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    const schedule = await db.getScheduleByUserProfile(profile.id);
    if (!schedule || schedule.id !== block.schedule_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await db.deleteFastingBlock(blockId);
    res.json({ message: 'Fasting block deleted successfully' });
  } catch (error) {
    console.error('Error deleting fasting block:', error);
    res.status(500).json({ error: 'Failed to delete fasting block' });
  }
});

app.post('/api/schedule/blocks/:id/overrides', validateSessionMiddleware, async (req, res) => {
  try {
    const blockId = parseInt(req.params.id);
    const { sessionId, occurrence_date, type, payload, reason } = req.body;
    
    if (!sessionId || !occurrence_date || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Verify the block exists and belongs to the user
    const block = await db.getFastingBlockById(blockId);
    if (!block) {
      return res.status(404).json({ error: 'Fasting block not found' });
    }
    
    // Get user profile to verify ownership
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    const schedule = await db.getScheduleByUserProfile(profile.id);
    if (!schedule || schedule.id !== block.schedule_id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Create override
    const overrideData = {
      block_id: blockId,
      occurrence_date,
      type,
      payload,
      reason
    };
    
    const newOverride = await db.createOverride(overrideData);
    res.status(201).json(newOverride);
  } catch (error) {
    console.error('Error creating override:', error);
    res.status(500).json({ error: 'Failed to create override' });
  }
});

app.post('/api/schedule/preview', validateSessionMiddleware, async (req, res) => {
  try {
    const { sessionId, blocks, timeZone } = req.body;
    
    if (!sessionId || !blocks || !Array.isArray(blocks)) {
      return res.status(400).json({ error: 'sessionId and blocks array are required' });
    }
    
    // Get user profile
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    // Create a mock schedule for preview
    const mockSchedule = {
      id: 'preview',
      user_profile_id: profile.id,
      week_anchor: 1,
      is_paused: false
    };
    
    // Generate preview instances for each block
    const allInstances = [];
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 28); // 4 weeks ahead
    
    for (let i = 0; i < blocks.length; i++) {
      const block = {
        id: `preview-${i}`,
        ...blocks[i]
      };
      
      // Generate instances for this preview block
      const blockInstances = await db.generateInstancesForBlock(block, mockSchedule, now, endDate, { timeZone });
      allInstances.push(...blockInstances);
    }
    
    // Sort instances by start time
    allInstances.sort((a, b) => new Date(a.start_at_utc) - new Date(b.start_at_utc));
    
    res.json({
      preview: true,
      blocks,
      nextInstances: allInstances
    });
  } catch (error) {
    console.error('Error generating schedule preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Get upcoming scheduled instances for Timer integration
const calculateBlockDurationHours = (block) => {
  if (!block || !block.start_time || !block.end_time) {
    return null;
  }

  const parseToMinutes = (value) => {
    const [hours, minutes] = value.split(':').map(Number);
    return (hours * 60) + (minutes || 0);
  };

  const startDow = Number(block.start_dow);
  const endDow = Number(block.end_dow);
  const startMinutes = parseToMinutes(block.start_time);
  const endMinutes = parseToMinutes(block.end_time);

  let dayDiff = endDow - startDow;
  if (Number.isNaN(dayDiff)) {
    return null;
  }

  if (dayDiff < 0) {
    dayDiff += 7;
  }

  let durationMinutes = (dayDiff * 24 * 60) + (endMinutes - startMinutes);

  if (durationMinutes <= 0) {
    durationMinutes += 24 * 60;
  }

  return Math.round(durationMinutes / 60);
};

const summarizeDefaultDuration = (blocks) => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return 24;
  }

  const histogram = new Map();

  for (const block of blocks) {
    const duration = calculateBlockDurationHours(block);
    if (!duration) {
      continue;
    }

    histogram.set(duration, (histogram.get(duration) || 0) + 1);
  }

  if (histogram.size === 0) {
    return 24;
  }

  let selectedDuration = 24;
  let highestFrequency = 0;

  for (const [duration, frequency] of histogram.entries()) {
    if (frequency > highestFrequency) {
      selectedDuration = duration;
      highestFrequency = frequency;
      continue;
    }

    const isTied = frequency === highestFrequency;
    if (isTied && duration > selectedDuration) {
      selectedDuration = duration;
    }
  }

  return selectedDuration;
};

const mapInstanceForResponse = (instance) => {
  if (!instance) {
    return null;
  }

  const start = new Date(instance.start_at_utc);
  const end = new Date(instance.end_at_utc);
  const durationInHours = Math.round((end - start) / (1000 * 60 * 60));

  return {
    id: instance.id,
    block_id: instance.block_id,
    block_name: instance.block_name,
    start_at_utc: instance.start_at_utc,
    end_at_utc: instance.end_at_utc,
    duration_hours: durationInHours
  };
};

app.get('/api/schedule/upcoming', validateSessionMiddleware, async (req, res) => {
  try {
    const clientTimeZone = req.query.tz;

    const schedule = await db.getScheduleByUserProfile(req.userProfile.id);
    if (!schedule) {
      return res.json({ upcoming: null, recent: null, defaultDurationHours: 24 });
    }

    const blocks = await db.getFastingBlocksBySchedule(schedule.id);
    if (blocks.length === 0) {
      return res.json({ upcoming: null, recent: null, defaultDurationHours: 24 });
    }

    const defaultDurationHours = summarizeDefaultDuration(blocks);

    const now = new Date();
    const lookbackStart = new Date(now.getTime() - (6 * 60 * 60 * 1000));
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    const allInstances = [];
    for (const block of blocks) {
      const instances = await db.generateInstancesForBlock(block, schedule, lookbackStart, endDate, { timeZone: clientTimeZone });
      allInstances.push(...instances);
    }

    allInstances.sort((a, b) => new Date(a.start_at_utc) - new Date(b.start_at_utc));

    const upcomingInstance = allInstances.find(instance => new Date(instance.start_at_utc) > now) || null;

    const sixHoursAgo = new Date(now.getTime() - (6 * 60 * 60 * 1000));
    let recentInstance = null;
    for (let i = allInstances.length - 1; i >= 0; i -= 1) {
      const instanceStart = new Date(allInstances[i].start_at_utc);
      if (instanceStart <= now && instanceStart >= sixHoursAgo) {
        recentInstance = allInstances[i];
        break;
      }
      if (instanceStart < sixHoursAgo) {
        break;
      }
    }

    return res.json({
      upcoming: mapInstanceForResponse(upcomingInstance),
      recent: mapInstanceForResponse(recentInstance),
      defaultDurationHours
    });
  } catch (error) {
    console.error('Error getting upcoming scheduled instances:', error);
    res.status(500).json({ error: 'Failed to get upcoming instances' });
  }
});

// Start early endpoint for scheduled fasts
app.post('/api/schedule/start-early', validateSessionMiddleware, async (req, res) => {
  try {
    const { sessionId, upcomingId, timeZone } = req.body;
    
    if (!sessionId || !upcomingId) {
      return res.status(400).json({ error: 'sessionId and upcomingId are required' });
    }
    
    // Get user profile
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    // Get the upcoming scheduled fast details to get planned duration
    const schedule = await db.getScheduleByUserProfile(profile.id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    const blocks = await db.getFastingBlocksBySchedule(schedule.id);
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 24);
    
    let upcomingInstance = null;
    for (const block of blocks) {
      const instances = await db.generateInstancesForBlock(block, schedule, now, tomorrow, { timeZone });
      upcomingInstance = instances.find(instance => 
        new Date(instance.start_at_utc) > now && instance.id === upcomingId
      );
      if (upcomingInstance) break;
    }
    
    if (!upcomingInstance) {
      return res.status(404).json({ error: 'Upcoming fast not found' });
    }
    
    // Calculate planned duration
    const plannedDuration = Math.round((new Date(upcomingInstance.end_at_utc) - new Date(upcomingInstance.start_at_utc)) / (1000 * 60 * 60));
    
    try {
      const fastEntry = await db.createFastEntry({
        user_profile_id: profile.id,
        start_time: now,
        source: 'scheduled_early',
        planned_instance_id: upcomingId,
        planned_duration_hours: plannedDuration,
        is_active: true
      });
      
      res.json({ 
        message: 'Scheduled fast started early',
        fastId: fastEntry.id,
        startTime: now.toISOString()
      });
      
    } catch (error) {
      console.error('Error creating fast entry:', error);
      res.status(500).json({ error: 'Failed to start fast' });
    }
    
  } catch (error) {
    console.error('Error starting early:', error);
    res.status(500).json({ error: 'Failed to start early' });
  }
});

// Hunger Coach Settings API Endpoints
app.get('/api/user/:sessionId/hunger-settings', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Parse custom mealtimes from JSON or use defaults
    let customMealtimes;
    if (profile.custom_mealtimes) {
      try {
        customMealtimes = JSON.parse(profile.custom_mealtimes);
      } catch (e) {
        console.error('Error parsing custom_mealtimes:', e);
        customMealtimes = null;
      }
    }

    // Default mealtimes if none set
    if (!customMealtimes || !Array.isArray(customMealtimes) || customMealtimes.length === 0) {
      customMealtimes = [
        { name: 'Breakfast', time: '08:00' },
        { name: 'Lunch', time: '12:00' },
        { name: 'Dinner', time: '18:00' }
      ];
    }

    res.json({
      hunger_coach_enabled: profile.hunger_coach_enabled !== false, // Default to true if null
      custom_mealtimes: customMealtimes,
      last_hunger_notification: profile.last_hunger_notification
    });

  } catch (error) {
    console.error('Error fetching hunger settings:', error);
    res.status(500).json({ error: 'Failed to fetch hunger settings' });
  }
});

app.put('/api/user/:sessionId/hunger-settings', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { hunger_coach_enabled, custom_mealtimes } = req.body;

    // Validate mealtimes if provided
    if (custom_mealtimes && Array.isArray(custom_mealtimes)) {
      for (const meal of custom_mealtimes) {
        if (!meal.name || !meal.time) {
          return res.status(400).json({ error: 'Each meal must have a name and time' });
        }
        // Validate time format (HH:MM)
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(meal.time)) {
          return res.status(400).json({ error: 'Time must be in HH:MM format' });
        }
      }
    }

    const updateData = {};
    if (hunger_coach_enabled !== undefined) {
      updateData.hunger_coach_enabled = hunger_coach_enabled;
    }
    if (custom_mealtimes !== undefined) {
      updateData.custom_mealtimes = JSON.stringify(custom_mealtimes);
    }

    const result = await db.updateUserProfile(sessionId, updateData);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json({
      message: 'Hunger coach settings updated successfully',
      updated: updateData
    });

  } catch (error) {
    console.error('Error updating hunger settings:', error);
    res.status(500).json({ error: 'Failed to update hunger settings' });
  }
});

app.post('/api/user/:sessionId/hunger-notification', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const updateData = {
      last_hunger_notification: new Date().toISOString()
    };

    const result = await db.updateUserProfile(sessionId, updateData);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json({
      message: 'Notification time logged',
      timestamp: updateData.last_hunger_notification
    });

  } catch (error) {
    console.error('Error logging notification:', error);
    res.status(500).json({ error: 'Failed to log notification' });
  }
});

// Benefits tracking endpoints
app.get('/api/user/:sessionId/benefits-settings', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Parse custom mealtimes for benefits calculation
    let customMealtimes;
    if (profile.custom_mealtimes) {
      try {
        customMealtimes = JSON.parse(profile.custom_mealtimes);
      } catch (e) {
        console.error('Error parsing custom_mealtimes:', e);
        customMealtimes = null;
      }
    }

    res.json({
      success: true,
      data: {
        avg_meal_cost: profile.avg_meal_cost || 10.00,
        avg_meal_duration: profile.avg_meal_duration || 30,
        benefits_enabled: Boolean(profile.benefits_enabled),
        benefits_onboarded: profile.benefits_onboarded || false,
        custom_mealtimes: customMealtimes
      }
    });

  } catch (error) {
    console.error('Error fetching benefits settings:', error);
    res.status(500).json({ error: 'Failed to fetch benefits settings' });
  }
});

app.put('/api/user/:sessionId/benefits-settings', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { avg_meal_cost, avg_meal_duration, benefits_enabled, benefits_onboarded } = req.body;

    // Validate inputs
    if (avg_meal_cost !== undefined) {
      if (typeof avg_meal_cost !== 'number' || avg_meal_cost < 0 || avg_meal_cost > 1000) {
        return res.status(400).json({ error: 'Average meal cost must be between $0 and $1000' });
      }
    }

    if (avg_meal_duration !== undefined) {
      if (typeof avg_meal_duration !== 'number' || avg_meal_duration < 5 || avg_meal_duration > 240) {
        return res.status(400).json({ error: 'Average meal duration must be between 5 and 240 minutes' });
      }
    }

    const updateData = {};
    if (avg_meal_cost !== undefined) {
      updateData.avg_meal_cost = avg_meal_cost;
    }
    if (avg_meal_duration !== undefined) {
      updateData.avg_meal_duration = avg_meal_duration;
    }
    if (benefits_enabled !== undefined) {
      updateData.benefits_enabled = benefits_enabled;
    }
    if (benefits_onboarded !== undefined) {
      updateData.benefits_onboarded = benefits_onboarded;
    }

    const result = await db.updateUserProfile(sessionId, updateData);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json({
      success: true,
      message: 'Benefits settings updated successfully',
      data: updateData
    });

  } catch (error) {
    console.error('Error updating benefits settings:', error);
    res.status(500).json({ error: 'Failed to update benefits settings' });
  }
});

// Legacy endpoint for backward compatibility with BenefitsDataService
app.get('/api/user/settings', async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers['x-session-id'];

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Parse custom mealtimes
    let customMealtimes;
    if (profile.custom_mealtimes) {
      try {
        customMealtimes = JSON.parse(profile.custom_mealtimes);
      } catch (e) {
        console.error('Error parsing custom_mealtimes:', e);
        customMealtimes = null;
      }
    }

    res.json({
      success: true,
      data: {
        avg_meal_cost: profile.avg_meal_cost || 10.00,
        avg_meal_duration: profile.avg_meal_duration || 30,
        benefits_enabled: Boolean(profile.benefits_enabled),
        benefits_onboarded: profile.benefits_onboarded || false,
        custom_mealtimes: customMealtimes,
        hunger_coach_enabled: profile.hunger_coach_enabled !== false
      }
    });

  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

app.put('/api/user/settings', async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers['x-session-id'] || req.body.sessionId;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const {
      avg_meal_cost,
      avg_meal_duration,
      benefits_enabled,
      benefits_onboarded,
      hunger_coach_enabled,
      custom_mealtimes
    } = req.body;

    // Validate inputs
    if (avg_meal_cost !== undefined) {
      if (typeof avg_meal_cost !== 'number' || avg_meal_cost < 0 || avg_meal_cost > 1000) {
        return res.status(400).json({ error: 'Average meal cost must be between $0 and $1000' });
      }
    }

    if (avg_meal_duration !== undefined) {
      if (typeof avg_meal_duration !== 'number' || avg_meal_duration < 5 || avg_meal_duration > 240) {
        return res.status(400).json({ error: 'Average meal duration must be between 5 and 240 minutes' });
      }
    }

    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const updateData = {};
    if (avg_meal_cost !== undefined) updateData.avg_meal_cost = avg_meal_cost;
    if (avg_meal_duration !== undefined) updateData.avg_meal_duration = avg_meal_duration;
    if (benefits_enabled !== undefined) updateData.benefits_enabled = benefits_enabled;
    if (benefits_onboarded !== undefined) updateData.benefits_onboarded = benefits_onboarded;
    if (hunger_coach_enabled !== undefined) updateData.hunger_coach_enabled = hunger_coach_enabled;
    if (custom_mealtimes !== undefined) updateData.custom_mealtimes = JSON.stringify(custom_mealtimes);

    const result = await db.updateUserProfile(sessionId, updateData);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: updateData
    });

  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

app.get('/api/benefits/current-fast', async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers['x-session-id'];

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Get active fast
    const activeFast = await db.getActiveFast();
    if (!activeFast) {
      return res.json({
        success: true,
        data: null,
        message: 'No active fast found'
      });
    }

    // Get user profile for preferences
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Calculate benefits (simplified server-side calculation)
    const now = new Date();
    const fastStart = new Date(activeFast.start_time);
    const fastDurationHours = (now - fastStart) / (1000 * 60 * 60);

    // Simple meal estimation (3 meals per day)
    const mealsSkipped = Math.floor(fastDurationHours / 8); // Rough estimate
    const moneySaved = mealsSkipped * (profile.avg_meal_cost || 10.00);
    const timeReclaimed = mealsSkipped * (profile.avg_meal_duration || 30);

    res.json({
      success: true,
      data: {
        fastId: activeFast.id,
        fastStartTime: activeFast.start_time,
        currentTime: now.toISOString(),
        fastDurationHours: Math.round(fastDurationHours * 100) / 100,
        mealsSkipped,
        moneySaved: Math.round(moneySaved * 100) / 100,
        timeReclaimed,
        preferences: {
          avgMealCost: profile.avg_meal_cost || 10.00,
          avgMealDuration: profile.avg_meal_duration || 30,
          benefitsEnabled: Boolean(profile.benefits_enabled)
        }
      }
    });

  } catch (error) {
    console.error('Error getting current fast benefits:', error);
    res.status(500).json({ error: 'Failed to get current fast benefits' });
  }
});

app.get('/api/benefits/cumulative', async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers['x-session-id'];
    const timeframe = req.query.timeframe || 'all';

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Get user profile
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Get user fasts
    const fasts = await db.getFastsByUserProfile(profile.id, 1000, 0); // Get many fasts

    // Filter by timeframe
    let filteredFasts = fasts;
    if (timeframe !== 'all') {
      const now = new Date();
      let cutoffDate;

      switch (timeframe) {
        case 'week':
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffDate = new Date(0);
      }

      filteredFasts = fasts.filter(fast => new Date(fast.start_time) >= cutoffDate);
    }

    // Calculate cumulative benefits
    let totalMealsSkipped = 0;
    let totalDurationHours = 0;

    filteredFasts.forEach(fast => {
      if (fast.duration_hours) {
        totalDurationHours += fast.duration_hours;
        // Estimate meals skipped (3 meals per day)
        totalMealsSkipped += Math.floor(fast.duration_hours / 8);
      }
    });

    const totalMoneySaved = totalMealsSkipped * (profile.avg_meal_cost || 10.00);
    const totalTimeReclaimed = totalMealsSkipped * (profile.avg_meal_duration || 30);

    res.json({
      success: true,
      data: {
        timeframe,
        totalFasts: filteredFasts.length,
        totalDurationHours: Math.round(totalDurationHours * 100) / 100,
        totalMealsSkipped,
        totalMoneySaved: Math.round(totalMoneySaved * 100) / 100,
        totalTimeReclaimed,
        averageFastDuration: filteredFasts.length > 0 ?
          Math.round((totalDurationHours / filteredFasts.length) * 100) / 100 : 0
      }
    });

  } catch (error) {
    console.error('Error getting cumulative benefits:', error);
    res.status(500).json({ error: 'Failed to get cumulative benefits' });
  }
});

app.post('/api/benefits/onboarding-complete', async (req, res) => {
  try {
    const sessionId = req.body.sessionId || req.query.sessionId || req.headers['x-session-id'];

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const result = await db.updateUserProfile(sessionId, {
      benefits_onboarded: true
    });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    res.json({
      success: true,
      message: 'Benefits onboarding completed'
    });

  } catch (error) {
    console.error('Error completing benefits onboarding:', error);
    res.status(500).json({ error: 'Failed to complete benefits onboarding' });
  }
});

// Fasting forecast calculation endpoint
app.post('/api/calculate', (req, res) => {
  try {
    const { weight, weightUnit, bodyFat, activityLevel, tdeeOverride, fastingBlocks, ketosisStates, weeks, 
            insulinSensitivity, fastingExperience, bodyFatPercentage, startDate } = req.body;
    
    // Validate inputs
    if (!weight || !bodyFat || !activityLevel || !fastingBlocks || !startDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Parse start date (avoid timezone issues by parsing manually)
    const [year, month, day] = startDate.split('-').map(Number);
    const startDateObj = new Date(year, month - 1, day); // month is 0-indexed
    if (isNaN(startDateObj.getTime())) {
      return res.status(400).json({ error: 'Invalid start date' });
    }
    
    // Function to calculate date for each week
    const getWeekDate = (weekNumber) => {
      // Parse the date string manually to avoid timezone issues
      const [year, month, day] = startDate.split('-').map(Number);
      const weekDate = new Date(year, month - 1, day); // month is 0-indexed
      weekDate.setDate(weekDate.getDate() + weekNumber * 7);
      
      // Format back to YYYY-MM-DD
      const formattedYear = weekDate.getFullYear();
      const formattedMonth = String(weekDate.getMonth() + 1).padStart(2, '0');
      const formattedDay = String(weekDate.getDate()).padStart(2, '0');
      return `${formattedYear}-${formattedMonth}-${formattedDay}`;
    };
    
    // Individualization factors (with defaults)
    const insulinSensitivityFactor = insulinSensitivity || 'normal'; // 'low', 'normal', 'high'
    const fastingExperienceFactor = fastingExperience || 'beginner'; // 'beginner', 'intermediate', 'advanced'
    const bodyFatFactor = bodyFatPercentage || bodyFat; // Use bodyFat if not specified
    
    // Calculate personalized ketosis timing adjustments
    const getKetosisTimingAdjustment = () => {
      let adjustment = 0;
      
      // Insulin sensitivity adjustments
      switch(insulinSensitivityFactor) {
        case 'low': adjustment += 4; break;      // Slower ketosis
        case 'high': adjustment -= 4; break;     // Faster ketosis
        default: break;                          // No adjustment
      }
      
      // Fasting experience adjustments
      switch(fastingExperienceFactor) {
        case 'beginner': adjustment += 6; break;     // Slower ketosis
        case 'intermediate': adjustment += 2; break; // Slight delay
        case 'advanced': adjustment -= 6; break;     // Faster ketosis
        default: break;
      }
      
      // Body fat adjustments (higher body fat = faster ketosis)
      if (bodyFatFactor > 25) adjustment -= 2;      // Faster ketosis
      else if (bodyFatFactor < 15) adjustment += 2; // Slower ketosis
      
      return adjustment;
    };
    
    const ketosisAdjustment = getKetosisTimingAdjustment();
    
    // Convert weight to kg if needed
    const weightKg = weightUnit === 'lb' ? weight * 0.453592 : weight;
    const numWeeks = weeks || 12; // Default to 12 weeks if not specified
    
    // Calculate initial values
    let currentWeight = weightKg;
    let currentBodyFat = bodyFat;
    let currentFatMass = currentWeight * (currentBodyFat / 100);
    let currentFFM = currentWeight - currentFatMass;
    
    // Calculate BMR using Katch-McArdle equation
    const bmr = 370 + (21.6 * currentFFM);
    
    // Calculate TDEE
    const tdee = tdeeOverride || (bmr * activityLevel);
    const hourlyTDEE = tdee / 24;
    
    // Constants
    const FAT_KCAL_PER_KG = 7700;
    const FFM_KCAL_PER_KG = 1000;
    const FAT_OXIDATION_CAP_KCAL_PER_KG_FAT_PER_DAY = 69;
    
    // Multi-phase ketosis parameters
    const GLYCOGEN_DEPLETION_HOURS = 16;      // Hours to deplete liver glycogen
    const EARLY_KETOSIS_HOURS = 24;           // Hours to reach early ketosis
    const FULL_KETOSIS_HOURS = 48;            // Hours to reach full ketosis
    const OPTIMAL_KETOSIS_HOURS = 72;         // Hours to reach optimal ketosis
    
    // Protein maintenance rates by phase (kcal/day)
    const PROTEIN_MAINTENANCE_PHASES = {
      glycogenDepletion: 160,    // Phase 1: 0-16h
      earlyKetosis: 120,         // Phase 2: 16-24h
      fullKetosis: 50,           // Phase 3: 24-48h
      optimalKetosis: 40         // Phase 4: 48h+
    };
    
    // FFM preservation rates by phase
    const FFM_PRESERVATION_PHASES = {
      glycogenDepletion: 0.0,    // Phase 1: 0% preservation
      earlyKetosis: 0.15,        // Phase 2: 15% preservation
      fullKetosis: 0.30,         // Phase 3: 30% preservation
      optimalKetosis: 0.40       // Phase 4: 40% preservation
    };
    
    // Weekly simulation results
    const weeklyResults = [];
    
    // Add Week 0 - Starting stats
    weeklyResults.push({
      week: 0,
      date: getWeekDate(0),
      weight: currentWeight,
      bodyFat: currentBodyFat,
      fatMass: currentFatMass,
      fatFreeMass: currentFFM,
      weeklyFatLoss: 0,
      weeklyFFMLoss: 0,
      totalWeightLoss: 0,
      ketosisPhase: 'baseline',
      proteinMaintenance: 0,
      ffmPreservation: 0
    });
    
    for (let week = 1; week <= numWeeks; week++) {
      let weeklyFatLoss = 0;
      let weeklyFFMLoss = 0;
      
              // Track ketosis state for each fasting block
        let cumulativeFastingHours = 0;
        let currentFastingBlock = -1;
        let hoursIntoCurrentBlock = 0;
        let dominantPhase = 'glycogenDepletion'; // Track the most common phase for the week
        let phaseHours = {
          glycogenDepletion: 0,
          earlyKetosis: 0,
          fullKetosis: 0,
          optimalKetosis: 0
        };
        
        // Simulate each hour of the week
        for (let hour = 0; hour < 168; hour++) { // 168 hours in a week
          const dayOfWeek = Math.floor(hour / 24);
          const hourOfDay = hour % 24;
          
          // Check if this hour is during a fasting period and which block
          let isFasting = false;
          let fastingBlockStart = 0;
          
          for (let i = 0; i < fastingBlocks.length; i++) {
            if (hour >= fastingBlockStart && hour < fastingBlockStart + fastingBlocks[i]) {
              isFasting = true;
              
              // Check if we're starting a new fasting block
              if (i !== currentFastingBlock) {
                currentFastingBlock = i;
                hoursIntoCurrentBlock = 0;
                // Reset cumulative hours if starting fresh (not already in ketosis)
                if (!ketosisStates[i]) {
                  cumulativeFastingHours = 0;
                }
              }
              
              break;
            }
            fastingBlockStart += fastingBlocks[i];
          }
          
          if (isFasting) {
            hoursIntoCurrentBlock++;
            
            // If already in ketosis at start of block, use full ketosis benefits
            if (ketosisStates[currentFastingBlock] && hoursIntoCurrentBlock === 1) {
              cumulativeFastingHours = FULL_KETOSIS_HOURS;
            } else {
              cumulativeFastingHours++;
            }
            
            // Determine ketosis phase and calculate personalized parameters
            let currentPhase = 'glycogenDepletion';
            let proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.glycogenDepletion;
            let ffmPreservationFactor = 1.0 - FFM_PRESERVATION_PHASES.glycogenDepletion;
            
            // Apply personalized ketosis timing adjustments
            const adjustedGlycogenHours = Math.max(8, GLYCOGEN_DEPLETION_HOURS + ketosisAdjustment);
            const adjustedEarlyHours = Math.max(16, EARLY_KETOSIS_HOURS + ketosisAdjustment);
            const adjustedFullHours = Math.max(32, FULL_KETOSIS_HOURS + ketosisAdjustment);
            const adjustedOptimalHours = Math.max(56, OPTIMAL_KETOSIS_HOURS + ketosisAdjustment);
            
            // Determine ketosis phase based on cumulative fasting hours
            if (cumulativeFastingHours >= adjustedOptimalHours) {
              // Phase 4: Optimal Ketosis (48h+ adjusted)
              currentPhase = 'optimalKetosis';
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.optimalKetosis;
              ffmPreservationFactor = 1.0 - FFM_PRESERVATION_PHASES.optimalKetosis;
            } else if (cumulativeFastingHours >= adjustedFullHours) {
              // Phase 3: Full Ketosis (24-48h adjusted)
              currentPhase = 'fullKetosis';
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.fullKetosis;
              ffmPreservationFactor = 1.0 - FFM_PRESERVATION_PHASES.fullKetosis;
            } else if (cumulativeFastingHours >= adjustedEarlyHours) {
              // Phase 2: Early Ketosis (16-24h adjusted)
              currentPhase = 'earlyKetosis';
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.earlyKetosis;
              ffmPreservationFactor = 1.0 - FFM_PRESERVATION_PHASES.earlyKetosis;
            } else {
              // Phase 1: Glycogen Depletion (0-16h adjusted)
              currentPhase = 'glycogenDepletion';
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.glycogenDepletion;
              ffmPreservationFactor = 1.0 - FFM_PRESERVATION_PHASES.glycogenDepletion;
            }
            
            // Calculate smooth transitions between phases
            const getPhaseProgress = (currentHours, phaseStart, phaseEnd) => {
              if (currentHours <= phaseStart) return 0;
              if (currentHours >= phaseEnd) return 1;
              return (currentHours - phaseStart) / (phaseEnd - phaseStart);
            };
            
            // Apply smooth transitions for protein maintenance and FFM preservation
            if (currentPhase === 'earlyKetosis') {
              const progress = getPhaseProgress(cumulativeFastingHours, adjustedGlycogenHours, adjustedEarlyHours);
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.glycogenDepletion - 
                ((PROTEIN_MAINTENANCE_PHASES.glycogenDepletion - PROTEIN_MAINTENANCE_PHASES.earlyKetosis) * progress);
              ffmPreservationFactor = 1.0 - (FFM_PRESERVATION_PHASES.glycogenDepletion + 
                ((FFM_PRESERVATION_PHASES.earlyKetosis - FFM_PRESERVATION_PHASES.glycogenDepletion) * progress));
            } else if (currentPhase === 'fullKetosis') {
              const progress = getPhaseProgress(cumulativeFastingHours, adjustedEarlyHours, adjustedFullHours);
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.earlyKetosis - 
                ((PROTEIN_MAINTENANCE_PHASES.earlyKetosis - PROTEIN_MAINTENANCE_PHASES.fullKetosis) * progress);
              ffmPreservationFactor = 1.0 - (FFM_PRESERVATION_PHASES.earlyKetosis + 
                ((FFM_PRESERVATION_PHASES.fullKetosis - FFM_PRESERVATION_PHASES.earlyKetosis) * progress));
            } else if (currentPhase === 'optimalKetosis') {
              const progress = getPhaseProgress(cumulativeFastingHours, adjustedFullHours, adjustedOptimalHours);
              proteinMaintenanceKcal = PROTEIN_MAINTENANCE_PHASES.fullKetosis - 
                ((PROTEIN_MAINTENANCE_PHASES.fullKetosis - PROTEIN_MAINTENANCE_PHASES.optimalKetosis) * progress);
              ffmPreservationFactor = 1.0 - (FFM_PRESERVATION_PHASES.fullKetosis + 
                ((FFM_PRESERVATION_PHASES.optimalKetosis - FFM_PRESERVATION_PHASES.fullKetosis) * progress));
            }
            
            // Track hours spent in each phase for weekly summary
            if (isFasting) {
              phaseHours[currentPhase]++;
            }
            
            // Calculate fuel partitioning based on ketosis state
            if (currentBodyFat > 10) {
              // Default mode (BF% > 10)
              
              // Calculate FFM loss based on protein maintenance requirement
              const hourlyProteinMaintenance = proteinMaintenanceKcal / 24;
              const ffmKcalBurned = hourlyProteinMaintenance;
              const ffmBurned = ffmKcalBurned / FFM_KCAL_PER_KG;
              
              // Apply ketosis preservation factor to FFM loss
              const adjustedFFMBurned = ffmBurned * ffmPreservationFactor;
              weeklyFFMLoss += adjustedFFMBurned;
              
              // Calculate fat loss (remainder of TDEE after FFM)
              const adjustedFFMKcalBurned = adjustedFFMBurned * FFM_KCAL_PER_KG;
              const remainingKcal = hourlyTDEE - adjustedFFMKcalBurned;
              
              if (remainingKcal > 0) {
                const fatBurned = remainingKcal / FAT_KCAL_PER_KG;
                weeklyFatLoss += fatBurned;
              }
              
            } else {
              // Advanced mode (BF% ≤ 10) - fat oxidation cap applies
              const fatOxidationCap = (FAT_OXIDATION_CAP_KCAL_PER_KG_FAT_PER_DAY / 24) * currentFatMass;
              
              // Calculate FFM loss based on protein maintenance requirement
              const hourlyProteinMaintenance = proteinMaintenanceKcal / 24;
              const ffmKcalBurned = hourlyProteinMaintenance;
              const ffmBurned = ffmKcalBurned / FFM_KCAL_PER_KG;
              
              // Apply ketosis preservation factor to FFM loss
              const adjustedFFMBurned = ffmBurned * ffmPreservationFactor;
              weeklyFFMLoss += adjustedFFMBurned;
              
              // Calculate fat loss (capped by oxidation limit)
              const adjustedFFMKcalBurned = adjustedFFMBurned * FFM_KCAL_PER_KG;
              const remainingKcal = hourlyTDEE - adjustedFFMKcalBurned;
              
              if (remainingKcal > 0) {
                const fatKcalBurned = Math.min(fatOxidationCap, remainingKcal);
                const fatBurned = fatKcalBurned / FAT_KCAL_PER_KG;
                weeklyFatLoss += fatBurned;
                
                // If fat oxidation cap reached, additional energy comes from FFM
                if (fatKcalBurned < remainingKcal) {
                  const additionalFFMKcal = remainingKcal - fatKcalBurned;
                  const additionalFFMBurned = additionalFFMKcal / FFM_KCAL_PER_KG;
                  weeklyFFMLoss += additionalFFMBurned;
                }
              }
            }
          } else {
            // Not fasting - reset fasting block tracking
            currentFastingBlock = -1;
            hoursIntoCurrentBlock = 0;
            // Note: cumulativeFastingHours is only reset when starting a new fasting block
          }
                }
        
        // Determine dominant phase for the week (phase with most hours)
        const maxPhaseHours = Math.max(...Object.values(phaseHours));
        for (const [phase, hours] of Object.entries(phaseHours)) {
          if (hours === maxPhaseHours) {
            dominantPhase = phase;
            break;
          }
        }
        
        // Update body composition for next week
        currentFatMass -= weeklyFatLoss;
        currentFFM -= weeklyFFMLoss;
        currentWeight = currentFatMass + currentFFM;
        currentBodyFat = (currentFatMass / currentWeight) * 100;
      
      // Ensure values don't go below reasonable limits
      currentFatMass = Math.max(currentFatMass, 0);
      currentFFM = Math.max(currentFFM, 0);
      currentWeight = Math.max(currentWeight, 0);
      currentBodyFat = Math.max(Math.min(currentBodyFat, 100), 0);
      
              weeklyResults.push({
          week,
          date: getWeekDate(week),
          weight: currentWeight,
          bodyFat: currentBodyFat,
          fatMass: currentFatMass,
          fatFreeMass: currentFFM,
          weeklyFatLoss: weeklyFatLoss,
          weeklyFFMLoss: weeklyFFMLoss,
          totalWeightLoss: weeklyFatLoss + weeklyFFMLoss,
          ketosisPhase: dominantPhase,
          proteinMaintenance: PROTEIN_MAINTENANCE_PHASES[dominantPhase] || 160,
          ffmPreservation: FFM_PRESERVATION_PHASES[dominantPhase] * 100 || 0
        });
    }
    
    res.json({
      initialStats: {
        weight: weightKg,
        bodyFat: bodyFat,
        fatMass: weightKg * (bodyFat / 100),
        fatFreeMass: weightKg * (1 - bodyFat / 100),
        bmr: bmr,
        dailyTDEE: tdee
      },
      weeklyResults: weeklyResults,
      summary: {
        totalWeeks: numWeeks,
        finalWeight: currentWeight,
        finalBodyFat: currentBodyFat,
        totalFatLost: weightKg * (bodyFat / 100) - currentFatMass,
        totalFFMLost: weightKg * (1 - bodyFat / 100) - currentFFM,
        totalWeightLost: weightKg - currentWeight
      }
    });
    
  } catch (error) {
    console.error('Calculation error:', error);
    res.status(500).json({ error: 'Calculation failed' });
  }
});

// Smart routing for root path
app.get('/', (req, res) => {
  // For now, serve a simple HTML page that does client-side routing
  // This allows us to check localStorage for existing users
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fasting Forecast</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
      <script>
        // Check if user has saved profile data
        const sessionId = localStorage.getItem('fastingForecast_sessionId');
        const profileSaved = localStorage.getItem('fastingForecast_profileSaved');
        
        if (sessionId && profileSaved === 'true') {
          // Existing user - redirect to timer (home page)
          window.location.href = '/timer';
        } else {
          // New user - redirect to forecaster (onboarding)
          window.location.href = '/forecaster';
        }
      </script>
    </body>
    </html>
  `);
});

// Serve the forecaster page (onboarding for new users)
app.get('/forecaster', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the dashboard page (with Log, Charts, Photos tabs)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Serve the timer page 
app.get('/timer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'timer.html'));
});

// Serve the welcome page (onboarding)
app.get('/welcome', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

// Serve the schedule page
app.get('/schedule', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'schedule.html'));
});

// Serve the calculator page
app.get('/calculator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calculator.html'));
});

// Serve the settings page
app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});


// Debug endpoint to test minimal SQLite operations
app.get('/api/debug/sqlite-test', async (req, res) => {
  try {
    console.log('=== Running minimal SQLite test via API ===');

    // Import and run the test
    const { spawn } = require('child_process');

    return new Promise((resolve, reject) => {
      const testProcess = spawn('node', ['debug-sqlite-simple.js'], {
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        const text = data.toString();
        console.log('SQLite test output:', text);
        output += text;
      });

      testProcess.stderr.on('data', (data) => {
        const text = data.toString();
        console.error('SQLite test error:', text);
        errorOutput += text;
      });

      testProcess.on('close', (code) => {
        const result = {
          success: code === 0,
          exitCode: code,
          output: output,
          errorOutput: errorOutput,
          timestamp: new Date().toISOString()
        };

        console.log('SQLite test completed with exit code:', code);
        res.json(result);
      });
    });
  } catch (error) {
    console.error('Error running SQLite test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Serve static files (after custom routes)
app.use(express.static('public'));

// Initialize database and start server
async function startServer() {
  try {
    await db.initialize();
    console.log('Database initialized successfully');
    
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api/hello`);
      console.log(`Fasting Log API available at http://localhost:${PORT}/api/fasts`);
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer();
