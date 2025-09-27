const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      // Use persistent volume on Render, fallback to local for development
      const dbPath = process.env.NODE_ENV === 'production'
        ? path.join(process.cwd(), 'database', 'fasting.db')
        : path.join(__dirname, 'fasting.db');

      console.log('Database path:', dbPath);
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      // First, check if protocol column exists and migrate if needed
      const migrateFastsTable = `
        CREATE TABLE IF NOT EXISTS fasts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          start_time DATETIME NOT NULL,
          end_time DATETIME,
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_profile_id) REFERENCES user_profiles (id)
        )
      `;

      const copyDataFromOldTable = `
        INSERT INTO fasts_new (id, start_time, end_time, duration_hours, notes, weight, photos, is_manual, is_active, source, created_at, updated_at)
        SELECT id, start_time, end_time, duration_hours, notes, weight, photos, is_manual, is_active, 'manual' as source, created_at, updated_at
        FROM fasts
        WHERE EXISTS (SELECT name FROM sqlite_master WHERE type='table' AND name='fasts')
      `;

      const dropOldTable = `DROP TABLE IF EXISTS fasts`;
      const renameNewTable = `ALTER TABLE fasts_new RENAME TO fasts`;

      const createUserProfilesTable = `
        CREATE TABLE IF NOT EXISTS user_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT UNIQUE,
          weight REAL,
          weight_unit TEXT,
          body_fat REAL,
          target_body_fat REAL,
          activity_level REAL,
          goal_date TEXT,
          forecast_data TEXT,
          onboarded_at DATETIME,
          hunger_coach_enabled BOOLEAN DEFAULT TRUE,
          custom_mealtimes TEXT,
          last_hunger_notification DATETIME,
          avg_meal_cost REAL DEFAULT 10.00,
          avg_meal_duration INTEGER DEFAULT 30,
          benefits_enabled BOOLEAN DEFAULT TRUE,
          benefits_onboarded BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      const createMilestonesTable = `
        CREATE TABLE IF NOT EXISTS milestones (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fast_id INTEGER NOT NULL,
          milestone_type VARCHAR(20) NOT NULL,
          achieved_at DATETIME NOT NULL,
          hours_elapsed REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (fast_id) REFERENCES fasts (id) ON DELETE CASCADE
        )
      `;

      // Schedule feature tables
      const createSchedulesTable = `
        CREATE TABLE IF NOT EXISTS schedules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_profile_id INTEGER NOT NULL,
          week_anchor INTEGER DEFAULT 1,
          is_paused BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_profile_id) REFERENCES user_profiles (id)
        )
      `;

      const createFastingBlocksTable = `
        CREATE TABLE IF NOT EXISTS fasting_blocks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (schedule_id) REFERENCES schedules (id) ON DELETE CASCADE
        )
      `;

      const createOverridesTable = `
        CREATE TABLE IF NOT EXISTS overrides (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          block_id INTEGER NOT NULL,
          occurrence_date TEXT NOT NULL,
          type TEXT NOT NULL,
          payload TEXT,
          reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (block_id) REFERENCES fasting_blocks (id) ON DELETE CASCADE
        )
      `;

      const createPlannedInstancesTable = `
        CREATE TABLE IF NOT EXISTS planned_instances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          block_id INTEGER NOT NULL,
          start_at_utc DATETIME NOT NULL,
          end_at_utc DATETIME NOT NULL,
          occurrence_date TEXT NOT NULL,
          status TEXT DEFAULT 'upcoming',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (block_id) REFERENCES fasting_blocks (id) ON DELETE CASCADE
        )
      `;

      this.db.serialize(() => {
        // Create user profiles table first
        this.db.run(createUserProfilesTable, (err) => {
          if (err) {
            console.error('Error creating user_profiles table:', err);
            reject(err);
            return;
          }
          console.log('User profiles table created successfully');
        });

        // Add hunger coach columns to existing user_profiles table if they don't exist
        this.db.all("PRAGMA table_info(user_profiles)", (err, columns) => {
          if (err) {
            console.error('Error checking user_profiles columns:', err);
            return;
          }

          const columnNames = columns.map(col => col.name);

          if (!columnNames.includes('hunger_coach_enabled')) {
            this.db.run("ALTER TABLE user_profiles ADD COLUMN hunger_coach_enabled BOOLEAN DEFAULT TRUE", (err) => {
              if (err) console.error('Error adding hunger_coach_enabled column:', err);
              else console.log('Added hunger_coach_enabled column to user_profiles');
            });
          }

          if (!columnNames.includes('custom_mealtimes')) {
            this.db.run("ALTER TABLE user_profiles ADD COLUMN custom_mealtimes TEXT", (err) => {
              if (err) console.error('Error adding custom_mealtimes column:', err);
              else console.log('Added custom_mealtimes column to user_profiles');
            });
          }

          if (!columnNames.includes('last_hunger_notification')) {
            this.db.run("ALTER TABLE user_profiles ADD COLUMN last_hunger_notification DATETIME", (err) => {
              if (err) console.error('Error adding last_hunger_notification column:', err);
              else console.log('Added last_hunger_notification column to user_profiles');
            });
          }

          // Add benefits tracking columns
          if (!columnNames.includes('avg_meal_cost')) {
            this.db.run("ALTER TABLE user_profiles ADD COLUMN avg_meal_cost REAL DEFAULT 10.00", (err) => {
              if (err) console.error('Error adding avg_meal_cost column:', err);
              else console.log('Added avg_meal_cost column to user_profiles');
            });
          }

          if (!columnNames.includes('avg_meal_duration')) {
            this.db.run("ALTER TABLE user_profiles ADD COLUMN avg_meal_duration INTEGER DEFAULT 30", (err) => {
              if (err) console.error('Error adding avg_meal_duration column:', err);
              else console.log('Added avg_meal_duration column to user_profiles');
            });
          }

          if (!columnNames.includes('benefits_enabled')) {
            this.db.run("ALTER TABLE user_profiles ADD COLUMN benefits_enabled BOOLEAN DEFAULT TRUE", (err) => {
              if (err) console.error('Error adding benefits_enabled column:', err);
              else console.log('Added benefits_enabled column to user_profiles');
            });
          }

          if (!columnNames.includes('benefits_onboarded')) {
            this.db.run("ALTER TABLE user_profiles ADD COLUMN benefits_onboarded BOOLEAN DEFAULT FALSE", (err) => {
              if (err) console.error('Error adding benefits_onboarded column:', err);
              else console.log('Added benefits_onboarded column to user_profiles');
            });
          }
        });

        // Check if migration is needed by checking if user_profile_id column exists
        this.db.all("PRAGMA table_info(fasts)", (err, columns) => {
          if (err) {
            console.error('Error checking fasts table:', err);
            reject(err);
            return;
          }

          const columnNames = columns.map(col => col.name);
          const needsMigration = !columnNames.includes('user_profile_id');

          if (needsMigration) {
            console.log('Migrating fasts table to add user_profile_id...');

            // Create new fasts table
            this.db.run(migrateFastsTable, (err) => {
              if (err) {
                console.error('Error creating new fasts table:', err);
                reject(err);
                return;
              }
            });

            // Copy existing data if old table exists
            this.db.run(copyDataFromOldTable, (err) => {
              // Ignore error if old table doesn't exist
            });

            // Drop old table and rename new one
            this.db.run(dropOldTable, (err) => {
              // Ignore error if old table doesn't exist
            });

            this.db.run(renameNewTable, (err) => {
              if (err) {
                console.error('Error renaming fasts table:', err);
                reject(err);
                return;
              }
              console.log('Fasts table migrated successfully (added user_profile_id)');
            });
          } else {
            console.log('Fasts table migration not needed - user_profile_id column already exists');
          }
        });

        this.db.run(createMilestonesTable, (err) => {
          if (err) {
            console.error('Error creating milestones table:', err);
            reject(err);
            return;
          }
          console.log('Milestones table created successfully');
        });

        // Create schedule tables
        this.db.run(createSchedulesTable, (err) => {
          if (err) {
            console.error('Error creating schedules table:', err);
            reject(err);
            return;
          }
          console.log('Schedules table created successfully');
        });

        this.db.run(createFastingBlocksTable, (err) => {
          if (err) {
            console.error('Error creating fasting_blocks table:', err);
            reject(err);
            return;
          }
          console.log('Fasting blocks table created successfully');
        });

        this.db.run(createOverridesTable, (err) => {
          if (err) {
            console.error('Error creating overrides table:', err);
            reject(err);
            return;
          }
          console.log('Overrides table created successfully');
        });

        this.db.run(createPlannedInstancesTable, (err) => {
          if (err) {
            console.error('Error creating planned_instances table:', err);
            reject(err);
            return;
          }
          console.log('Planned instances table created successfully');
          resolve();
        });
      });
    });
  }

  async getFasts(limit = 50, offset = 0) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM fasts 
        ORDER BY start_time DESC 
        LIMIT ? OFFSET ?
      `;
      
      this.db.all(query, [limit, offset], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getOrphanedFasts(limit = 50, offset = 0) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM fasts 
        WHERE user_profile_id IS NULL
        ORDER BY start_time DESC 
        LIMIT ? OFFSET ?
      `;
      
      this.db.all(query, [limit, offset], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getFastsByUserProfile(userProfileId, limit = 50, offset = 0) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM fasts 
        WHERE user_profile_id = ?
        ORDER BY start_time DESC 
        LIMIT ? OFFSET ?
      `;
      
      this.db.all(query, [userProfileId, limit, offset], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getFastById(id) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fasts WHERE id = ?';
      
      this.db.get(query, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async createFast(fastData) {
    return new Promise((resolve, reject) => {
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
        planned_duration_hours = null
      } = fastData;

      const query = `
        INSERT INTO fasts (start_time, end_time, notes, weight, photos, is_manual, is_active, user_profile_id, source, planned_instance_id, planned_duration_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(query, [start_time, end_time, notes, weight, photos, is_manual, is_active, user_profile_id, source, planned_instance_id, planned_duration_hours], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...fastData });
        }
      });
    });
  }

  // Convenience method for server compatibility
  async createFastEntry(fastData) {
    return this.createFast(fastData);
  }

  async updateFast(id, fastData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      Object.entries(fastData).forEach(([key, value]) => {
        if (value !== undefined && key !== 'id') {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (fields.length === 0) {
        resolve({ id, ...fastData });
        return;
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const query = `UPDATE fasts SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(query, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, changes: this.changes });
        }
      });
    });
  }

  async deleteFast(id) {
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM fasts WHERE id = ?';
      
      this.db.run(query, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  }

  async endFast(id, endTime) {
    return new Promise((resolve, reject) => {
      // First get the fast to calculate duration
      this.getFastById(id).then(fast => {
        if (!fast) {
          reject(new Error('Fast not found'));
          return;
        }

        const startTime = new Date(fast.start_time);
        const end = new Date(endTime);
        const durationHours = (end - startTime) / (1000 * 60 * 60);

        this.updateFast(id, {
          end_time: endTime,
          duration_hours: durationHours,
          is_active: false
        }).then(resolve).catch(reject);
      }).catch(reject);
    });
  }

  async getActiveFast() {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fasts WHERE is_active = TRUE ORDER BY start_time DESC LIMIT 1';
      
      this.db.get(query, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async getActiveFastByUserId(userId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fasts WHERE is_active = TRUE AND user_profile_id = ? ORDER BY start_time DESC LIMIT 1';

      this.db.get(query, [userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async createMilestone(milestoneData) {
    return new Promise((resolve, reject) => {
      const { fast_id, milestone_type, achieved_at, hours_elapsed } = milestoneData;

      const query = `
        INSERT INTO milestones (fast_id, milestone_type, achieved_at, hours_elapsed)
        VALUES (?, ?, ?, ?)
      `;

      this.db.run(query, [fast_id, milestone_type, achieved_at, hours_elapsed], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...milestoneData });
        }
      });
    });
  }

  async getFastMilestones(fastId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM milestones WHERE fast_id = ? ORDER BY hours_elapsed ASC';
      
      this.db.all(query, [fastId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async createUserProfile(profileData) {
    return new Promise((resolve, reject) => {
      const {
        session_id,
        weight,
        weight_unit,
        body_fat,
        target_body_fat,
        activity_level,
        goal_date,
        forecast_data
      } = profileData;

      const query = `
        INSERT INTO user_profiles (session_id, weight, weight_unit, body_fat, target_body_fat, activity_level, goal_date, forecast_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(query, [session_id, weight, weight_unit, body_fat, target_body_fat, activity_level, goal_date, forecast_data], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...profileData });
        }
      });
    });
  }

  async getUserProfileBySessionId(sessionId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM user_profiles WHERE session_id = ?';
      
      this.db.get(query, [sessionId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async getUserProfileById(id) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM user_profiles WHERE id = ?';
      
      this.db.get(query, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async updateUserProfile(sessionId, updateData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined && key !== 'id' && key !== 'session_id') {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (fields.length === 0) {
        resolve({ session_id: sessionId, ...updateData });
        return;
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(sessionId);

      const query = `UPDATE user_profiles SET ${fields.join(', ')} WHERE session_id = ?`;

      this.db.run(query, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ session_id: sessionId, changes: this.changes });
        }
      });
    });
  }

  async markUserOnboarded(sessionId) {
    return new Promise((resolve, reject) => {
      const query = 'UPDATE user_profiles SET onboarded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?';
      
      this.db.run(query, [sessionId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ session_id: sessionId, changes: this.changes });
        }
      });
    });
  }

  // Schedule CRUD methods
  async createSchedule(scheduleData) {
    return new Promise((resolve, reject) => {
      const { user_profile_id, week_anchor = 1, is_paused = false } = scheduleData;

      const query = `
        INSERT INTO schedules (user_profile_id, week_anchor, is_paused)
        VALUES (?, ?, ?)
      `;

      this.db.run(query, [user_profile_id, week_anchor, is_paused], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...scheduleData });
        }
      });
    });
  }

  async getScheduleByUserProfile(userProfileId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM schedules WHERE user_profile_id = ? AND is_paused = FALSE ORDER BY created_at DESC LIMIT 1';
      
      this.db.get(query, [userProfileId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async updateSchedule(scheduleId, updateData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined && key !== 'id') {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (fields.length === 0) {
        resolve({ id: scheduleId, ...updateData });
        return;
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(scheduleId);

      const query = `UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(query, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: scheduleId, changes: this.changes });
        }
      });
    });
  }

  // Fasting Block CRUD methods
  async createFastingBlock(blockData) {
    return new Promise((resolve, reject) => {
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(query, [schedule_id, name, start_dow, start_time, end_dow, end_time, tz_mode, anchor_tz, notificationsJson, is_active], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...blockData });
        }
      });
    });
  }

  async getFastingBlocksBySchedule(scheduleId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fasting_blocks WHERE schedule_id = ? AND is_active = TRUE ORDER BY start_dow, start_time';
      
      this.db.all(query, [scheduleId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Parse notifications JSON for each row
          const blocks = rows.map(row => ({
            ...row,
            notifications: row.notifications ? JSON.parse(row.notifications) : null
          }));
          resolve(blocks);
        }
      });
    });
  }

  async getFastingBlockById(blockId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fasting_blocks WHERE id = ?';
      
      this.db.get(query, [blockId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          if (row && row.notifications) {
            try {
              row.notifications = JSON.parse(row.notifications);
            } catch (e) {
              console.error('Error parsing notifications JSON:', e);
            }
          }
          resolve(row || null);
        }
      });
    });
  }

  async updateFastingBlock(blockId, updateData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined && key !== 'id') {
          if (key === 'notifications' && value) {
            fields.push(`${key} = ?`);
            values.push(JSON.stringify(value));
          } else {
            fields.push(`${key} = ?`);
            values.push(value);
          }
        }
      });

      if (fields.length === 0) {
        resolve({ id: blockId, ...updateData });
        return;
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(blockId);

      const query = `UPDATE fasting_blocks SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(query, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: blockId, changes: this.changes });
        }
      });
    });
  }

  async deleteFastingBlock(blockId) {
    return new Promise((resolve, reject) => {
      const query = 'UPDATE fasting_blocks SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      
      this.db.run(query, [blockId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  }

  // Override CRUD methods
  async createOverride(overrideData) {
    return new Promise((resolve, reject) => {
      const { block_id, occurrence_date, type, payload, reason } = overrideData;
      const payloadJson = payload ? JSON.stringify(payload) : null;

      const query = `
        INSERT INTO overrides (block_id, occurrence_date, type, payload, reason)
        VALUES (?, ?, ?, ?, ?)
      `;

      this.db.run(query, [block_id, occurrence_date, type, payloadJson, reason], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...overrideData });
        }
      });
    });
  }

  async getOverridesByBlock(blockId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM overrides WHERE block_id = ? ORDER BY occurrence_date';
      
      this.db.all(query, [blockId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Parse payload JSON for each row
          const overrides = rows.map(row => ({
            ...row,
            payload: row.payload ? JSON.parse(row.payload) : null
          }));
          resolve(overrides);
        }
      });
    });
  }

  async getOverrideByBlockAndDate(blockId, occurrenceDate) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM overrides WHERE block_id = ? AND occurrence_date = ?';
      
      this.db.get(query, [blockId, occurrenceDate], (err, row) => {
        if (err) {
          reject(err);
        } else {
          if (row && row.payload) {
            try {
              row.payload = JSON.parse(row.payload);
            } catch (e) {
              console.error('Error parsing payload JSON:', e);
            }
          }
          resolve(row || null);
        }
      });
    });
  }

  // Instance generation methods
  async generatePlannedInstances(scheduleId, weeksAhead = 4) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get schedule details
        const schedule = await this.getScheduleById(scheduleId);
        if (!schedule) {
          resolve([]);
          return;
        }

        // Get all active fasting blocks for this schedule
        const blocks = await this.getFastingBlocksBySchedule(scheduleId);
        if (blocks.length === 0) {
          resolve([]);
          return;
        }

        const instances = [];
        const now = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + (weeksAhead * 7));

        for (const block of blocks) {
          // Generate instances for this block
          const blockInstances = await this.generateInstancesForBlock(block, schedule, now, endDate);
          instances.push(...blockInstances);
        }

        // Sort instances by start time
        instances.sort((a, b) => new Date(a.start_at_utc) - new Date(b.start_at_utc));

        resolve(instances);
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateInstancesForBlock(block, schedule, startDate, endDate) {
    const instances = [];
    
    // Find the next occurrence of the specified day of week (start_dow)
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    
    // Find the first occurrence of this day of week on or after startDate
    const targetDayOfWeek = block.start_dow; // 0 = Sunday, 1 = Monday, etc.
    const currentDayOfWeek = current.getDay();
    
    let daysUntilTarget = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
    if (daysUntilTarget === 0) {
      // If it's the same day, check if we've passed the start time
      const [startHour, startMinute] = block.start_time.split(':').map(Number);
      const startTimeToday = new Date(current);
      startTimeToday.setHours(startHour, startMinute, 0, 0);
      
      if (startDate > startTimeToday) {
        // We've passed today's start time, so look for next week
        daysUntilTarget = 7;
      }
    }
    
    current.setDate(current.getDate() + daysUntilTarget);

    // Generate instances week by week
    while (current <= endDate) {
      const instanceStartDate = new Date(current);
      
      const [startHour, startMinute] = block.start_time.split(':').map(Number);
      instanceStartDate.setHours(startHour, startMinute, 0, 0);

      // Calculate end date using end_dow and end_time
      const instanceEndDate = new Date(current);

      // Calculate days from start_dow to end_dow
      let daysDifference = (block.end_dow - block.start_dow + 7) % 7;

      // If end_dow equals start_dow, the fast spans to the same day next week
      if (daysDifference === 0) {
        daysDifference = 7;
      }

      instanceEndDate.setDate(instanceEndDate.getDate() + daysDifference);

      const [endHour, endMinute] = block.end_time.split(':').map(Number);
      instanceEndDate.setHours(endHour, endMinute, 0, 0);

      // Only include instances that start after the current time
      if (instanceStartDate >= startDate) {
        // Format occurrence date (the date this instance represents)
        const occurrenceDate = instanceStartDate.toISOString().split('T')[0];

        // Check for overrides for this occurrence
        const override = await this.getOverrideByBlockAndDate(block.id, occurrenceDate);
        let status = 'upcoming';
        
        if (override) {
          switch (override.type) {
            case 'skip':
              status = 'skipped';
              break;
            case 'shift':
              // Apply time shift from override payload
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

        // Determine if this instance is currently active
        if (status !== 'skipped') {
          if (instanceStartDate <= new Date() && new Date() <= instanceEndDate) {
            status = 'active';
          } else if (instanceEndDate < new Date()) {
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

      // Move to next week
      current.setDate(current.getDate() + 7);
    }

    return instances;
  }

  async getScheduleById(scheduleId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM schedules WHERE id = ?';
      
      this.db.get(query, [scheduleId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log('Database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = new Database();