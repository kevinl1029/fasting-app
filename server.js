const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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

// Fasting Log API Endpoints
app.get('/api/fasts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const sessionId = req.query.sessionId;
    
    if (sessionId) {
      // Get user profile first to find user_profile_id
      const profile = await db.getUserProfileBySessionId(sessionId);
      if (profile) {
        // Get only user-specific fasts
        const userFasts = await db.getFastsByUserProfile(profile.id, limit, offset);
        res.json(userFasts);
      } else {
        // Return empty array if no profile found
        res.json([]);
      }
    } else {
      // No sessionId provided - return empty array to maintain data isolation
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching fasts:', error);
    res.status(500).json({ error: 'Failed to fetch fasts' });
  }
});

app.get('/api/fasts/active', async (req, res) => {
  try {
    const activeFast = await db.getActiveFast();
    res.json(activeFast);
  } catch (error) {
    console.error('Error fetching active fast:', error);
    res.status(500).json({ error: 'Failed to fetch active fast' });
  }
});

app.get('/api/fasts/:id', async (req, res) => {
  try {
    const fastId = parseInt(req.params.id);
    const fast = await db.getFastById(fastId);
    
    if (!fast) {
      return res.status(404).json({ error: 'Fast not found' });
    }
    
    const milestones = await db.getFastMilestones(fastId);
    res.json({ ...fast, milestones });
  } catch (error) {
    console.error('Error fetching fast:', error);
    res.status(500).json({ error: 'Failed to fetch fast' });
  }
});

app.post('/api/fasts', async (req, res) => {
  try {
    const { start_time, end_time, notes, weight, photos, is_manual = true, sessionId } = req.body;
    
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
    
    // Get user profile ID if session ID is provided
    let userProfileId = null;
    if (sessionId) {
      const profile = await db.getUserProfileBySessionId(sessionId);
      if (profile) {
        userProfileId = profile.id;
      }
    }
    
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
    res.status(201).json(newFast);
  } catch (error) {
    console.error('Error creating fast:', error);
    res.status(500).json({ error: 'Failed to create fast' });
  }
});

app.post('/api/fasts/start', async (req, res) => {
  try {
    const { notes, weight, sessionId } = req.body;
    console.log('Starting fast with sessionId:', sessionId);
    
    // Check if there's already an active fast
    const activeFast = await db.getActiveFast();
    if (activeFast) {
      return res.status(400).json({ error: 'There is already an active fast' });
    }
    
    // Get user profile ID if session ID is provided
    let userProfileId = null;
    if (sessionId) {
      const profile = await db.getUserProfileBySessionId(sessionId);
      console.log('Found user profile:', profile ? profile.id : 'null');
      if (profile) {
        userProfileId = profile.id;
      }
    }
    
    const fastData = {
      start_time: new Date().toISOString(),
      notes,
      weight,
      is_manual: false,
      is_active: true,
      user_profile_id: userProfileId
    };
    
    console.log('Creating fast with data:', fastData);
    const newFast = await db.createFast(fastData);
    console.log('Fast created:', newFast);
    res.status(201).json(newFast);
  } catch (error) {
    console.error('Error starting fast:', error);
    res.status(500).json({ error: 'Failed to start fast' });
  }
});

app.post('/api/fasts/:id/end', async (req, res) => {
  try {
    const fastId = parseInt(req.params.id);
    const endTime = req.body.end_time || new Date().toISOString();
    
    const updatedFast = await db.endFast(fastId, endTime);
    res.json(updatedFast);
  } catch (error) {
    console.error('Error ending fast:', error);
    res.status(500).json({ error: 'Failed to end fast' });
  }
});

app.put('/api/fasts/:id', async (req, res) => {
  try {
    const fastId = parseInt(req.params.id);
    const { start_time, end_time, notes, weight, photos } = req.body;
    
    let updateData = { start_time, end_time, notes, weight, photos };
    
    // Remove undefined values
    Object.keys(updateData).forEach(key => 
      updateData[key] === undefined && delete updateData[key]
    );
    
    // Recalculate duration if times are being updated
    if (updateData.start_time || updateData.end_time) {
      const fast = await db.getFastById(fastId);
      if (!fast) {
        return res.status(404).json({ error: 'Fast not found' });
      }
      
      const startTime = updateData.start_time || fast.start_time;
      const endTime = updateData.end_time || fast.end_time;
      
      if (startTime && endTime) {
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
    
    const updatedFast = await db.getFastById(fastId);
    res.json(updatedFast);
  } catch (error) {
    console.error('Error updating fast:', error);
    res.status(500).json({ error: 'Failed to update fast' });
  }
});

app.delete('/api/fasts/:id', async (req, res) => {
  try {
    const fastId = parseInt(req.params.id);
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
      const result = await db.updateUserProfile(sessionId, profileData);
      const updatedProfile = await db.getUserProfileBySessionId(sessionId);
      res.json(updatedProfile);
    } else {
      // Create new profile
      const newProfile = await db.createUserProfile(profileData);
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
app.get('/api/schedule', async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    
    // Get user profile
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    // Get user's schedule
    const schedule = await db.getScheduleByUserProfile(profile.id);
    if (!schedule) {
      return res.json({ schedule: null, blocks: [], nextInstances: [] });
    }
    
    // Get fasting blocks for the schedule
    const blocks = await db.getFastingBlocksBySchedule(schedule.id);
    
    // Generate next instances (4 weeks ahead)
    const nextInstances = await db.generatePlannedInstances(schedule.id, 4);
    
    res.json({
      schedule,
      blocks,
      nextInstances
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

app.post('/api/schedule', async (req, res) => {
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

app.post('/api/schedule/blocks', async (req, res) => {
  try {
    const { sessionId, name, start_dow, start_time, end_dow, end_time, tz_mode = 'local', anchor_tz, notifications } = req.body;
    
    if (!sessionId || start_dow === undefined || !start_time || end_dow === undefined || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get user profile
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    // Get or create user's schedule
    let schedule = await db.getScheduleByUserProfile(profile.id);
    if (!schedule) {
      // Create schedule if it doesn't exist
      const scheduleData = {
        user_profile_id: profile.id,
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
      anchor_tz,
      notifications
    };
    
    const newBlock = await db.createFastingBlock(blockData);
    res.status(201).json(newBlock);
  } catch (error) {
    console.error('Error creating fasting block:', error);
    res.status(500).json({ error: 'Failed to create fasting block' });
  }
});

app.patch('/api/schedule/blocks/:id', async (req, res) => {
  try {
    const blockId = parseInt(req.params.id);
    const { sessionId, name, start_dow, start_time, end_dow, end_time, tz_mode, anchor_tz, notifications } = req.body;
    
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
    if (anchor_tz !== undefined) updateData.anchor_tz = anchor_tz;
    if (notifications !== undefined) updateData.notifications = notifications;
    
    const result = await db.updateFastingBlock(blockId, updateData);
    const updatedBlock = await db.getFastingBlockById(blockId);
    res.json(updatedBlock);
  } catch (error) {
    console.error('Error updating fasting block:', error);
    res.status(500).json({ error: 'Failed to update fasting block' });
  }
});

app.delete('/api/schedule/blocks/:id', async (req, res) => {
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

app.post('/api/schedule/blocks/:id/overrides', async (req, res) => {
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

app.post('/api/schedule/preview', async (req, res) => {
  try {
    const { sessionId, blocks } = req.body;
    
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
      const blockInstances = await db.generateInstancesForBlock(block, mockSchedule, now, endDate);
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
app.get('/api/schedule/upcoming', async (req, res) => {
  try {
    const { sessionId } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    
    // Get user profile
    const profile = await db.getUserProfileBySessionId(sessionId);
    if (!profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    
    // Get user's schedule
    const schedule = await db.getScheduleByUserProfile(profile.id);
    if (!schedule) {
      return res.json({ upcoming: null }); // No schedule set
    }
    
    // Get active blocks
    const blocks = await db.getFastingBlocksBySchedule(schedule.id);
    if (blocks.length === 0) {
      return res.json({ upcoming: null }); // No blocks
    }
    
    // Generate upcoming instances for next 7 days to catch upcoming fasts
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    
    const allInstances = [];
    for (const block of blocks) {
      const instances = await db.generateInstancesForBlock(block, schedule, now, endDate);
      allInstances.push(...instances);
    }
    
    // Sort by start time and get the next upcoming instance
    allInstances.sort((a, b) => new Date(a.start_at_utc) - new Date(b.start_at_utc));
    
    const upcoming = allInstances.find(instance => {
      const startTime = new Date(instance.start_at_utc);
      return startTime > now;
    });
    
    if (!upcoming) {
      return res.json({ upcoming: null });
    }
    
    res.json({ 
      upcoming: {
        id: upcoming.id,
        block_id: upcoming.block_id,
        block_name: upcoming.block_name,
        start_at_utc: upcoming.start_at_utc,
        end_at_utc: upcoming.end_at_utc,
        duration_hours: Math.round((new Date(upcoming.end_at_utc) - new Date(upcoming.start_at_utc)) / (1000 * 60 * 60))
      }
    });
    
  } catch (error) {
    console.error('Error getting upcoming scheduled instances:', error);
    res.status(500).json({ error: 'Failed to get upcoming instances' });
  }
});

// Start early endpoint for scheduled fasts
app.post('/api/schedule/start-early', async (req, res) => {
  try {
    const { sessionId, upcomingId } = req.body;
    
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
      const instances = await db.generateInstancesForBlock(block, schedule, now, tomorrow);
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
