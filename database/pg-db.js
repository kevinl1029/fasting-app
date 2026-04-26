const { Pool } = require('pg');

class Database {
  constructor() {
    this.pool = null;
  }

  async initialize() {
    const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/fasting_forecast';

    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });

    try {
      const client = await this.pool.connect();
      console.log('Connected to PostgreSQL database');
      client.release();
      await this.createTables();
    } catch (err) {
      console.error('Error connecting to PostgreSQL database:', err);
      throw err;
    }
  }

  async createTables() {
    const createUserProfilesTable = `
      CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        session_id TEXT UNIQUE,
        weight REAL,
        weight_unit TEXT,
        body_fat REAL,
        target_body_fat REAL,
        activity_level REAL,
        goal_date TEXT,
        forecast_data TEXT,
        onboarded_at TIMESTAMP WITH TIME ZONE,
        hunger_coach_enabled BOOLEAN DEFAULT TRUE,
        custom_mealtimes TEXT,
        last_hunger_notification TIMESTAMP WITH TIME ZONE,
        avg_meal_cost REAL DEFAULT 10.00,
        avg_meal_duration INTEGER DEFAULT 30,
        benefits_enabled BOOLEAN DEFAULT TRUE,
        benefits_onboarded BOOLEAN DEFAULT FALSE,
        height_cm REAL,
        sex TEXT,
        age INTEGER,
        keto_adapted TEXT DEFAULT 'none',
        tdee_override REAL,
        time_zone TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createFastsTable = `
      CREATE TABLE IF NOT EXISTS fasts (
        id SERIAL PRIMARY KEY,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        duration_hours REAL,
        notes TEXT,
        weight REAL,
        photos TEXT,
        is_manual BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT FALSE,
        user_profile_id INTEGER,
        source TEXT DEFAULT 'manual',
        planned_instance_id TEXT,
        planned_duration_hours REAL,
        start_in_ketosis BOOLEAN DEFAULT FALSE,
        pre_fast_protein_grams REAL,
        carb_status TEXT DEFAULT 'normal',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_profile_id) REFERENCES user_profiles (id)
      )
    `;

    const createMilestonesTable = `
      CREATE TABLE IF NOT EXISTS milestones (
        id SERIAL PRIMARY KEY,
        fast_id INTEGER NOT NULL,
        milestone_type VARCHAR(20) NOT NULL,
        achieved_at TIMESTAMP WITH TIME ZONE NOT NULL,
        hours_elapsed REAL NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fast_id) REFERENCES fasts (id) ON DELETE CASCADE
      )
    `;

    const createSchedulesTable = `
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        user_profile_id INTEGER NOT NULL,
        week_anchor INTEGER DEFAULT 1,
        is_paused BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_profile_id) REFERENCES user_profiles (id)
      )
    `;

    const createScheduleDraftsTable = `
      CREATE TABLE IF NOT EXISTS schedule_drafts (
        id SERIAL PRIMARY KEY,
        user_profile_id INTEGER NOT NULL UNIQUE,
        payload TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        dismissed_at TIMESTAMP WITH TIME ZONE,
        FOREIGN KEY (user_profile_id) REFERENCES user_profiles (id) ON DELETE CASCADE
      )
    `;

    const createFastingBlocksTable = `
      CREATE TABLE IF NOT EXISTS fasting_blocks (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL,
        name TEXT,
        start_dow INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_dow INTEGER NOT NULL,
        end_time TEXT NOT NULL,
        tz_mode TEXT DEFAULT 'local',
        anchor_tz TEXT,
        notifications TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (schedule_id) REFERENCES schedules (id) ON DELETE CASCADE
      )
    `;

    const createOverridesTable = `
      CREATE TABLE IF NOT EXISTS overrides (
        id SERIAL PRIMARY KEY,
        block_id INTEGER NOT NULL,
        occurrence_date TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT,
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (block_id) REFERENCES fasting_blocks (id) ON DELETE CASCADE
      )
    `;

    const createPlannedInstancesTable = `
      CREATE TABLE IF NOT EXISTS planned_instances (
        id SERIAL PRIMARY KEY,
        block_id INTEGER NOT NULL,
        start_at_utc TIMESTAMP WITH TIME ZONE NOT NULL,
        end_at_utc TIMESTAMP WITH TIME ZONE NOT NULL,
        occurrence_date TEXT NOT NULL,
        status TEXT DEFAULT 'upcoming',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (block_id) REFERENCES fasting_blocks (id) ON DELETE CASCADE
      )
    `;

    const createBodyLogEntriesTable = `
      CREATE TABLE IF NOT EXISTS body_log_entries (
        id SERIAL PRIMARY KEY,
        user_profile_id INTEGER NOT NULL,
        fast_id INTEGER,
        logged_at TIMESTAMP WITH TIME ZONE NOT NULL,
        local_date TEXT NOT NULL,
        timezone_offset_minutes INTEGER,
        time_zone TEXT,
        weight REAL NOT NULL,
        body_fat REAL,
        entry_tag TEXT DEFAULT 'ad_hoc',
        source TEXT DEFAULT 'manual',
        notes TEXT,
        is_canonical BOOLEAN DEFAULT FALSE,
        canonical_status TEXT DEFAULT 'auto',
        canonical_reason TEXT,
        canonical_override_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_profile_id) REFERENCES user_profiles (id) ON DELETE CASCADE,
        FOREIGN KEY (fast_id) REFERENCES fasts (id) ON DELETE SET NULL
      )
    `;

    const createIndexes = async () => {
      try {
        await this.pool.query(`
          CREATE INDEX IF NOT EXISTS idx_body_log_user_date
          ON body_log_entries (user_profile_id, local_date, logged_at DESC)
        `);
        await this.pool.query(`
          CREATE INDEX IF NOT EXISTS idx_body_log_fast
          ON body_log_entries (fast_id)
        `);
        await this.pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_body_log_canonical_per_day
          ON body_log_entries (user_profile_id, local_date)
          WHERE is_canonical = true
        `);
      } catch (err) {
        console.error('Error creating indexes:', err);
        throw err;
      }
    };

    const client = await this.pool.connect();
    try {
      await client.query(createUserProfilesTable);
      console.log('User profiles table ready');

      await client.query(createFastsTable);
      console.log('Fasts table ready');

      await client.query(createMilestonesTable);
      console.log('Milestones table ready');

      await client.query(createSchedulesTable);
      console.log('Schedules table ready');

      await client.query(createScheduleDraftsTable);
      console.log('Schedule drafts table ready');

      await client.query(createFastingBlocksTable);
      console.log('Fasting blocks table ready');

      await client.query(createOverridesTable);
      console.log('Overrides table ready');

      await client.query(createPlannedInstancesTable);
      console.log('Planned instances table ready');

      await client.query(createBodyLogEntriesTable);
      console.log('Body log entries table ready');

      await createIndexes();
      console.log('Body log indexes ready');

      console.log('Database initialized successfully');
    } finally {
      client.release();
    }
  }

  convertBooleans(row) {
    if (row === null || row === undefined) return row;
    if (Array.isArray(row)) {
      return row.map(item => this.convertBooleans(item));
    }
    if (typeof row === 'object') {
      const converted = {};
      for (const [key, value] of Object.entries(row)) {
        if (value === true || value === false) {
          converted[key] = value;
        } else if (typeof value === 'number') {
          if (['is_manual', 'is_active', 'is_paused', 'is_active', 'hunger_coach_enabled', 'benefits_enabled', 'benefits_onboarded', 'start_in_ketosis', 'is_canonical'].includes(key)) {
            converted[key] = !!value;
          } else {
            converted[key] = value;
          }
        } else {
          converted[key] = value;
        }
      }
      return converted;
    }
    return row;
  }

  async getFasts(limit = 50, offset = 0) {
    const query = `
      SELECT * FROM fasts 
      ORDER BY start_time DESC 
      LIMIT $1 OFFSET $2
    `;
    
    const result = await this.pool.query(query, [limit, offset]);
    return result.rows.map(row => this.convertBooleans(row));
  }

  async getFastsWithWeights() {
    const query = `
      SELECT * FROM fasts
      WHERE user_profile_id IS NOT NULL
        AND weight IS NOT NULL
      ORDER BY start_time ASC
    `;

    const result = await this.pool.query(query);
    return result.rows.map(row => this.convertBooleans(row));
  }

  async getOrphanedFasts(limit = 50, offset = 0) {
    const query = `
      SELECT * FROM fasts 
      WHERE user_profile_id IS NULL
      ORDER BY start_time DESC 
      LIMIT $1 OFFSET $2
    `;
    
    const result = await this.pool.query(query, [limit, offset]);
    return result.rows.map(row => this.convertBooleans(row));
  }

  async getFastsByUserProfile(userProfileId, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM fasts 
      WHERE user_profile_id = $1
      ORDER BY start_time DESC 
      LIMIT $2 OFFSET $3
    `;
    
    const result = await this.pool.query(query, [userProfileId, limit, offset]);
    return result.rows.map(row => this.convertBooleans(row));
  }

  async getFastsByUserAndDateRange(userProfileId, startIso, endIso) {
    const query = `
      SELECT * FROM fasts
      WHERE user_profile_id = $1
        AND (
          (start_time BETWEEN $2 AND $3)
          OR (end_time IS NOT NULL AND end_time BETWEEN $2 AND $3)
          OR (start_time <= $2 AND (end_time IS NULL OR end_time >= $3))
        )
      ORDER BY start_time ASC
    `;

    const result = await this.pool.query(query, [userProfileId, startIso, endIso]);
    return result.rows.map(row => this.convertBooleans(row));
  }

  async getFastById(id) {
    const query = 'SELECT * FROM fasts WHERE id = $1';
    
    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : null;
  }

  async createFast(fastData) {
    const {
      start_time,
      end_time = null,
      notes = null,
      weight = null,
      photos = null,
      is_manual = false,
      is_active = false,
      user_profile_id = null,
      source = 'manual',
      planned_instance_id = null,
      planned_duration_hours = null,
      start_in_ketosis = false,
      pre_fast_protein_grams = null,
      carb_status = 'normal'
    } = fastData;

    const query = `
      INSERT INTO fasts (start_time, end_time, notes, weight, photos, is_manual, is_active, user_profile_id, source, planned_instance_id, planned_duration_hours, start_in_ketosis, pre_fast_protein_grams, carb_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      start_time, end_time, notes, weight, photos, is_manual, is_active, 
      user_profile_id, source, planned_instance_id, planned_duration_hours,
      start_in_ketosis, pre_fast_protein_grams, carb_status
    ]);
    return this.convertBooleans(result.rows[0]);
  }

  async createFastEntry(fastData) {
    return this.createFast(fastData);
  }

  async updateFast(id, fastData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(fastData).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return { id, ...fastData };
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `UPDATE fasts SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await this.pool.query(query, values);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : { id, changes: result.rowCount };
  }

  async deleteFast(id) {
    const query = 'DELETE FROM fasts WHERE id = $1 RETURNING id';
    
    const result = await this.pool.query(query, [id]);
    return { deleted: result.rowCount > 0 };
  }

  async endFast(id, endTime) {
    const fast = await this.getFastById(id);
    if (!fast) {
      throw new Error('Fast not found');
    }

    const startTime = new Date(fast.start_time);
    const end = new Date(endTime);
    const durationHours = (end - startTime) / (1000 * 60 * 60);

    return this.updateFast(id, {
      end_time: endTime,
      duration_hours: durationHours,
      is_active: false
    });
  }

  async getFastEndingNearTimestamp(user_profile_id, timestampIso, windowMinutes = 120) {
    if (!timestampIso) {
      throw new Error('timestampIso is required to query fast end proximity');
    }

    const ts = new Date(timestampIso);
    if (Number.isNaN(ts.getTime())) {
      throw new Error('Invalid timestampIso provided');
    }

    const windowStart = new Date(ts.getTime() - windowMinutes * 60 * 1000).toISOString();

    const query = `
      SELECT * FROM fasts
      WHERE user_profile_id = $1
        AND end_time IS NOT NULL
        AND end_time <= $2
        AND end_time >= $3
      ORDER BY end_time DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [user_profile_id, timestampIso, windowStart]);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : null;
  }

  async createBodyLogEntry(entryData) {
    const {
      user_profile_id,
      fast_id = null,
      logged_at,
      local_date,
      timezone_offset_minutes = null,
      time_zone = null,
      weight,
      body_fat = null,
      entry_tag = 'ad_hoc',
      source = 'manual',
      notes = null,
      is_canonical = false,
      canonical_status = 'auto',
      canonical_reason = null,
      canonical_override_at = null
    } = entryData;

    if (!user_profile_id || !logged_at || !local_date || weight === undefined || weight === null) {
      throw new Error('Missing required fields for body log entry');
    }

    const overrideTimestamp = is_canonical && canonical_status === 'manual'
      ? (canonical_override_at || new Date().toISOString())
      : null;

    const query = `
      INSERT INTO body_log_entries (
        user_profile_id,
        fast_id,
        logged_at,
        local_date,
        timezone_offset_minutes,
        time_zone,
        weight,
        body_fat,
        entry_tag,
        source,
        notes,
        is_canonical,
        canonical_status,
        canonical_reason,
        canonical_override_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      user_profile_id,
      fast_id,
      logged_at,
      local_date,
      timezone_offset_minutes,
      time_zone,
      weight,
      body_fat,
      entry_tag,
      source,
      notes,
      is_canonical,
      canonical_status,
      canonical_reason,
      overrideTimestamp
    ]);
    return this.convertBooleans(result.rows[0]);
  }

  async getBodyLogEntryById(id) {
    const query = 'SELECT * FROM body_log_entries WHERE id = $1';

    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : null;
  }

  async getBodyLogEntriesByUser(user_profile_id, options = {}) {
    const {
      startDate,
      endDate,
      limit,
      offset = 0,
      includeSecondary = true
    } = options;

    const conditions = ['user_profile_id = $1'];
    const params = [user_profile_id];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`local_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`local_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (!includeSecondary) {
      conditions.push('is_canonical = true');
    }

    let query = `
      SELECT * FROM body_log_entries
      WHERE ${conditions.join(' AND ')}
      ORDER BY logged_at DESC
    `;

    if (limit) {
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.convertBooleans(row));
  }

  async getBodyLogUserIds() {
    const query = 'SELECT DISTINCT user_profile_id FROM body_log_entries';

    const result = await this.pool.query(query);
    const ids = (result.rows || []).map((row) => Number(row.user_profile_id)).filter((id) => !Number.isNaN(id));
    return ids;
  }

  async getBodyLogEntriesForDate(user_profile_id, localDate) {
    const query = `
      SELECT * FROM body_log_entries
      WHERE user_profile_id = $1 AND local_date = $2
      ORDER BY logged_at ASC
    `;

    const result = await this.pool.query(query, [user_profile_id, localDate]);
    return result.rows.map(row => this.convertBooleans(row));
  }

  async updateBodyLogEntry(id, updateData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return { id, ...updateData };
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `UPDATE body_log_entries SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await this.pool.query(query, values);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : { id, changes: result.rowCount };
  }

  async deleteBodyLogEntry(id) {
    const query = 'DELETE FROM body_log_entries WHERE id = $1 RETURNING id';

    const result = await this.pool.query(query, [id]);
    return { deleted: result.rowCount > 0 };
  }

  async clearCanonicalForDate(user_profile_id, localDate, excludeEntryId = null) {
    const params = [user_profile_id, localDate];
    let paramIndex = 3;
    let query = `
      UPDATE body_log_entries
      SET is_canonical = false,
          canonical_reason = NULL,
          canonical_override_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_profile_id = $1 AND local_date = $2 AND is_canonical = true
    `;

    if (excludeEntryId) {
      query += ` AND id <> $${paramIndex}`;
      params.push(excludeEntryId);
    }

    query += ' RETURNING id';

    const result = await this.pool.query(query, params);
    return { changes: result.rowCount };
  }

  async markCanonicalEntry(entryId, options = {}) {
    const entry = await this.getBodyLogEntryById(entryId);
    if (!entry) {
      throw new Error('Body log entry not found');
    }

    const {
      canonicalStatus = 'auto',
      canonicalReason = entry.entry_tag,
      overrideAt = canonicalStatus === 'manual' ? new Date().toISOString() : null
    } = options;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE body_log_entries
         SET is_canonical = false,
             canonical_reason = NULL,
             canonical_override_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_profile_id = $1 AND local_date = $2 AND id <> $3`,
        [entry.user_profile_id, entry.local_date, entryId]
      );

      await client.query(
        `UPDATE body_log_entries
         SET is_canonical = true,
             canonical_status = $1,
             canonical_reason = $2,
             canonical_override_at = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [canonicalStatus, canonicalReason, overrideAt, entryId]
      );

      await client.query('COMMIT');

      return this.getBodyLogEntryById(entryId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCanonicalEntryForDate(user_profile_id, localDate) {
    const query = `
      SELECT * FROM body_log_entries
      WHERE user_profile_id = $1 AND local_date = $2 AND is_canonical = true
      LIMIT 1
    `;

    const result = await this.pool.query(query, [user_profile_id, localDate]);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : null;
  }

  async getCanonicalEntriesByRange(user_profile_id, startDate, endDate) {
    const conditions = ['user_profile_id = $1', 'is_canonical = true'];
    const params = [user_profile_id];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`local_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`local_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const query = `
      SELECT * FROM body_log_entries
      WHERE ${conditions.join(' AND ')}
      ORDER BY local_date ASC
    `;

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.convertBooleans(row));
  }

  async getBodyLogEntriesByFastId(fast_id) {
    const query = `
      SELECT * FROM body_log_entries
      WHERE fast_id = $1
      ORDER BY logged_at ASC
    `;

    const result = await this.pool.query(query, [fast_id]);
    return result.rows.map(row => this.convertBooleans(row));
  }

  async getActiveFast() {
    const query = 'SELECT * FROM fasts WHERE is_active = true ORDER BY start_time DESC LIMIT 1';
    
    const result = await this.pool.query(query);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : null;
  }

  async getActiveFastByUserId(userId) {
    const query = 'SELECT * FROM fasts WHERE is_active = true AND user_profile_id = $1 ORDER BY start_time DESC LIMIT 1';

    const result = await this.pool.query(query, [userId]);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : null;
  }

  async createMilestone(milestoneData) {
    const { fast_id, milestone_type, achieved_at, hours_elapsed } = milestoneData;

    const query = `
      INSERT INTO milestones (fast_id, milestone_type, achieved_at, hours_elapsed)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await this.pool.query(query, [fast_id, milestone_type, achieved_at, hours_elapsed]);
    return this.convertBooleans(result.rows[0]);
  }

  async getFastMilestones(fastId) {
    const query = 'SELECT * FROM milestones WHERE fast_id = $1 ORDER BY hours_elapsed ASC';
    
    const result = await this.pool.query(query, [fastId]);
    return result.rows.map(row => this.convertBooleans(row));
  }

  async createUserProfile(profileData) {
    const {
      session_id,
      weight,
      weight_unit,
      body_fat,
      target_body_fat,
      activity_level,
      goal_date,
      forecast_data,
      time_zone = null,
      hunger_coach_enabled = true,
      custom_mealtimes = null,
      benefits_enabled = true,
      benefits_onboarded = false,
      height_cm = null,
      sex = null,
      age = null,
      keto_adapted = 'none',
      tdee_override = null,
      avg_meal_cost = 10.00,
      avg_meal_duration = 30
    } = profileData;

    const query = `
      INSERT INTO user_profiles (session_id, weight, weight_unit, body_fat, target_body_fat, activity_level, goal_date, forecast_data, time_zone, hunger_coach_enabled, custom_mealtimes, benefits_enabled, benefits_onboarded, height_cm, sex, age, keto_adapted, tdee_override, avg_meal_cost, avg_meal_duration)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      session_id, weight, weight_unit, body_fat, target_body_fat, activity_level,
      goal_date, forecast_data, time_zone, hunger_coach_enabled, custom_mealtimes,
      benefits_enabled, benefits_onboarded, height_cm, sex, age, keto_adapted,
      tdee_override, avg_meal_cost, avg_meal_duration
    ]);
    return this.convertBooleans(result.rows[0]);
  }

  async getUserProfileBySessionId(sessionId) {
    const query = 'SELECT * FROM user_profiles WHERE session_id = $1';
    
    const result = await this.pool.query(query, [sessionId]);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : null;
  }

  async getUserProfileById(id) {
    const query = 'SELECT * FROM user_profiles WHERE id = $1';
    
    const result = await this.pool.query(query, [id]);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : null;
  }

  async updateUserProfile(sessionId, updateData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'session_id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return { session_id: sessionId, ...updateData };
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(sessionId);

    const query = `UPDATE user_profiles SET ${fields.join(', ')} WHERE session_id = $${paramIndex} RETURNING *`;

    const result = await this.pool.query(query, values);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : { session_id: sessionId, changes: result.rowCount };
  }

  async markUserOnboarded(sessionId) {
    const query = 'UPDATE user_profiles SET onboarded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE session_id = $1 RETURNING *';
    
    const result = await this.pool.query(query, [sessionId]);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : { session_id: sessionId, changes: result.rowCount };
  }

  async createSchedule(scheduleData) {
    const { user_profile_id, week_anchor = 1, is_paused = false } = scheduleData;

    const query = `
      INSERT INTO schedules (user_profile_id, week_anchor, is_paused)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await this.pool.query(query, [user_profile_id, week_anchor, is_paused]);
    return this.convertBooleans(result.rows[0]);
  }

  async getScheduleByUserProfile(userProfileId) {
    const query = 'SELECT * FROM schedules WHERE user_profile_id = $1 AND is_paused = false ORDER BY created_at DESC LIMIT 1';
    
    const result = await this.pool.query(query, [userProfileId]);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : null;
  }

  async getScheduleDraftByUserProfile(userProfileId, { includeDismissed = false } = {}) {
    const query = includeDismissed
      ? 'SELECT * FROM schedule_drafts WHERE user_profile_id = $1'
      : 'SELECT * FROM schedule_drafts WHERE user_profile_id = $1 AND dismissed_at IS NULL';

    const result = await this.pool.query(query, [userProfileId]);
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    try {
      const payload = JSON.parse(row.payload);
      return { ...this.convertBooleans(row), payload };
    } catch (parseError) {
      console.error('Error parsing schedule draft payload:', parseError);
      return { ...this.convertBooleans(row), payload: null, payloadParseError: true };
    }
  }

  async upsertScheduleDraft(userProfileId, payload) {
    const payloadJson = JSON.stringify(payload);
    const query = `
      INSERT INTO schedule_drafts (user_profile_id, payload)
      VALUES ($1, $2)
      ON CONFLICT (user_profile_id) DO UPDATE SET
        payload = excluded.payload,
        dismissed_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await this.pool.query(query, [userProfileId, payloadJson]);
    return this.convertBooleans(result.rows[0]);
  }

  async deleteScheduleDraft(userProfileId) {
    const query = 'DELETE FROM schedule_drafts WHERE user_profile_id = $1 RETURNING id';

    const result = await this.pool.query(query, [userProfileId]);
    return { deleted: result.rowCount > 0 };
  }

  async markScheduleDraftDismissed(userProfileId) {
    const query = `
      UPDATE schedule_drafts
      SET dismissed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_profile_id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [userProfileId]);
    return { dismissed: result.rowCount > 0 };
  }

  async updateSchedule(scheduleId, updateData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return { id: scheduleId, ...updateData };
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(scheduleId);

    const query = `UPDATE schedules SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await this.pool.query(query, values);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : { id: scheduleId, changes: result.rowCount };
  }

  async createFastingBlock(blockData) {
    const {
      schedule_id,
      name,
      start_dow,
      start_time,
      end_dow,
      end_time,
      tz_mode = 'local',
      anchor_tz,
      notifications,
      is_active = true
    } = blockData;

    const notificationsJson = notifications ? JSON.stringify(notifications) : null;

    const query = `
      INSERT INTO fasting_blocks (schedule_id, name, start_dow, start_time, end_dow, end_time, tz_mode, anchor_tz, notifications, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      schedule_id, name, start_dow, start_time, end_dow, end_time, tz_mode, anchor_tz, notificationsJson, is_active
    ]);
    const row = this.convertBooleans(result.rows[0]);
    if (row && row.notifications) {
      try {
        row.notifications = JSON.parse(row.notifications);
      } catch (e) {
        console.error('Error parsing notifications JSON:', e);
      }
    }
    return row;
  }

  async getFastingBlocksBySchedule(scheduleId) {
    const query = 'SELECT * FROM fasting_blocks WHERE schedule_id = $1 AND is_active = true ORDER BY start_dow, start_time';
    
    const result = await this.pool.query(query, [scheduleId]);
    return result.rows.map(row => {
      const converted = this.convertBooleans(row);
      if (converted && converted.notifications) {
        try {
          converted.notifications = JSON.parse(converted.notifications);
        } catch (e) {
          console.error('Error parsing notifications JSON:', e);
        }
      }
      return converted;
    });
  }

  async getFastingBlockById(blockId) {
    const query = 'SELECT * FROM fasting_blocks WHERE id = $1';
    
    const result = await this.pool.query(query, [blockId]);
    const row = result.rows[0] ? this.convertBooleans(result.rows[0]) : null;

    if (row && row.notifications) {
      try {
        row.notifications = JSON.parse(row.notifications);
      } catch (e) {
        console.error('Error parsing notifications JSON:', e);
      }
    }
    return row;
  }

  async updateFastingBlock(blockId, updateData) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id') {
        if (key === 'notifications' && value) {
          fields.push(`${key} = $${paramIndex}`);
          values.push(JSON.stringify(value));
        } else {
          fields.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return { id: blockId, ...updateData };
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(blockId);

    const query = `UPDATE fasting_blocks SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await this.pool.query(query, values);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : { id: blockId, changes: result.rowCount };
  }

  async deleteFastingBlock(blockId) {
    const query = 'UPDATE fasting_blocks SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id';
    
    const result = await this.pool.query(query, [blockId]);
    return { deleted: result.rowCount > 0 };
  }

  async createOverride(overrideData) {
    const { block_id, occurrence_date, type, payload, reason } = overrideData;
    const payloadJson = payload ? JSON.stringify(payload) : null;

    const query = `
      INSERT INTO overrides (block_id, occurrence_date, type, payload, reason)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await this.pool.query(query, [block_id, occurrence_date, type, payloadJson, reason]);
    const row = this.convertBooleans(result.rows[0]);
    if (row && row.payload) {
      try {
        row.payload = JSON.parse(row.payload);
      } catch (e) {
        console.error('Error parsing payload JSON:', e);
      }
    }
    return row;
  }

  async getOverridesByBlock(blockId) {
    const query = 'SELECT * FROM overrides WHERE block_id = $1 ORDER BY occurrence_date';
    
    const result = await this.pool.query(query, [blockId]);
    return result.rows.map(row => {
      const converted = this.convertBooleans(row);
      if (converted && converted.payload) {
        try {
          converted.payload = JSON.parse(converted.payload);
        } catch (e) {
          console.error('Error parsing payload JSON:', e);
        }
      }
      return converted;
    });
  }

  async getOverrideByBlockAndDate(blockId, occurrenceDate) {
    const query = 'SELECT * FROM overrides WHERE block_id = $1 AND occurrence_date = $2';
    
    const result = await this.pool.query(query, [blockId, occurrenceDate]);
    const row = result.rows[0] ? this.convertBooleans(result.rows[0]) : null;

    if (row && row.payload) {
      try {
        row.payload = JSON.parse(row.payload);
      } catch (e) {
        console.error('Error parsing payload JSON:', e);
      }
    }
    return row;
  }

  async generatePlannedInstances(scheduleId, weeksAhead = 4, options = {}) {
    const schedule = await this.getScheduleById(scheduleId);
    if (!schedule) {
      return [];
    }

    const blocks = await this.getFastingBlocksBySchedule(scheduleId);
    if (blocks.length === 0) {
      return [];
    }

    const instances = [];
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + (weeksAhead * 7));

    for (const block of blocks) {
      const blockInstances = await this.generateInstancesForBlock(block, schedule, now, endDate, options);
      instances.push(...blockInstances);
    }

    instances.sort((a, b) => new Date(a.start_at_utc) - new Date(b.start_at_utc));

    return instances;
  }

  async generateInstancesForBlock(block, schedule, startDate, endDate, options = {}) {
    const instances = [];

    const resolveTimeZone = () => {
      if (block && block.tz_mode === 'fixed' && block.anchor_tz) {
        return block.anchor_tz;
      }
      if (block && block.anchor_tz) {
        return block.anchor_tz;
      }
      if (options && typeof options.timeZone === 'string' && options.timeZone.trim()) {
        return options.timeZone;
      }
      return 'UTC';
    };

    let timeZone = resolveTimeZone();

    const buildDateTimeFormatter = (tz) => new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const weekdayNames = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6
    };

    let dateTimeFormatter;
    let weekdayFormatter;

    try {
      dateTimeFormatter = buildDateTimeFormatter(timeZone);
      weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' });
    } catch (error) {
      console.warn('Invalid timezone provided, falling back to UTC:', timeZone, error);
      timeZone = 'UTC';
      dateTimeFormatter = buildDateTimeFormatter(timeZone);
      weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' });
    }

    const getZonedParts = (date) => {
      const parts = dateTimeFormatter.formatToParts(date);
      const mapped = {};
      for (const part of parts) {
        if (part.type !== 'literal') {
          mapped[part.type] = part.value;
        }
      }
      return {
        year: Number(mapped.year),
        month: Number(mapped.month),
        day: Number(mapped.day),
        hour: Number(mapped.hour),
        minute: Number(mapped.minute),
        second: Number(mapped.second)
      };
    };

    const getWeekdayIndex = (date) => {
      const name = weekdayFormatter.format(date);
      return weekdayNames[name] ?? 0;
    };

    const getTimeZoneOffset = (date) => {
      const parts = getZonedParts(date);
      const asUTC = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
      );
      return asUTC - date.getTime();
    };

    const createZonedDate = (year, month, day, hour, minute, second = 0) => {
      const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);
      const candidate = new Date(naiveUtc);
      const offset = getTimeZoneOffset(candidate);
      return new Date(naiveUtc - offset);
    };

    const createZonedDateFromBase = (baseDate, hour, minute, second = 0) => {
      const parts = getZonedParts(baseDate);
      return createZonedDate(parts.year, parts.month, parts.day, hour, minute, second);
    };

    const toLocalMidnight = (date) => createZonedDateFromBase(date, 0, 0, 0);

    const addDays = (date, days) => {
      const result = new Date(date.getTime());
      result.setUTCDate(result.getUTCDate() + days);
      return result;
    };

    const prepareDayBoundary = (date) => toLocalMidnight(date);

    const [startHour, startMinute] = block.start_time.split(':').map(Number);
    const [endHour, endMinute] = block.end_time.split(':').map(Number);

    const computeDaysDifference = () => {
      let diff = (block.end_dow - block.start_dow + 7) % 7;
      if (diff === 0) {
        diff = 7;
      }
      return diff;
    };

    const daysDifference = computeDaysDifference();

    let current = prepareDayBoundary(startDate);
    let currentDayOfWeek = getWeekdayIndex(current);

    const targetDayOfWeek = block.start_dow;
    let daysUntilTarget = (targetDayOfWeek - currentDayOfWeek + 7) % 7;

    const startTimeToday = createZonedDateFromBase(current, startHour, startMinute);
    if (daysUntilTarget === 0 && startDate > startTimeToday) {
      daysUntilTarget = 7;
    }

    if (daysUntilTarget > 0) {
      current = prepareDayBoundary(addDays(current, daysUntilTarget));
    }

    while (current <= endDate) {
      const instanceStartDate = createZonedDateFromBase(current, startHour, startMinute);
      const endDateBase = addDays(current, daysDifference);
      const instanceEndDate = createZonedDateFromBase(endDateBase, endHour, endMinute);

      if (instanceStartDate >= startDate) {
        const occurrenceDate = instanceStartDate.toISOString().split('T')[0];

        const override = await this.getOverrideByBlockAndDate(block.id, occurrenceDate);
        let status = 'upcoming';

        if (override) {
          switch (override.type) {
            case 'skip':
              status = 'skipped';
              break;
            case 'shift':
              if (override.payload && override.payload.hours) {
                instanceStartDate.setHours(instanceStartDate.getHours() + override.payload.hours);
                instanceEndDate.setHours(instanceEndDate.getHours() + override.payload.hours);
              }
              break;
            case 'extend':
              if (override.payload && override.payload.hours) {
                instanceEndDate.setHours(instanceEndDate.getHours() + override.payload.hours);
              }
              break;
            case 'shorten':
              if (override.payload && override.payload.hours) {
                instanceEndDate.setHours(instanceEndDate.getHours() - override.payload.hours);
              }
              break;
          }
        }

        if (status !== 'skipped') {
          const now = new Date();
          if (instanceStartDate <= now && now <= instanceEndDate) {
            status = 'active';
          } else if (instanceEndDate < now) {
            status = 'completed';
          }
        }

        instances.push({
          block_id: block.id,
          block_name: block.name,
          start_at_utc: instanceStartDate.toISOString(),
          end_at_utc: instanceEndDate.toISOString(),
          occurrence_date: occurrenceDate,
          status: status,
          duration_hours: (instanceEndDate - instanceStartDate) / (1000 * 60 * 60),
          override: override || null
        });
      }

      const nextWeek = addDays(current, 7);
      current = prepareDayBoundary(nextWeek);
      currentDayOfWeek = getWeekdayIndex(current);
    }

    return instances;
  }

  async getScheduleById(scheduleId) {
    const query = 'SELECT * FROM schedules WHERE id = $1';
    
    const result = await this.pool.query(query, [scheduleId]);
    return result.rows[0] ? this.convertBooleans(result.rows[0]) : null;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('Database connection closed');
    }
  }
}

module.exports = new Database();
