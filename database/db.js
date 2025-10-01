const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');


class Database {
  constructor() {
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      // Use persistent volume on Render, fallback to local for development
      const dbPath = process.env.NODE_ENV === 'production'
        ? '/data/fasting.db'
        : path.join(__dirname, 'fasting.db');

      console.log('Database path:', dbPath);
      console.log('NODE_ENV:', process.env.NODE_ENV);

      // Ensure database directory exists
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        console.log('Creating database directory:', dbDir);
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Check if database already exists
      const dbExists = fs.existsSync(dbPath);
      console.log('Database file exists:', dbExists);
      if (dbExists) {
        const stats = fs.statSync(dbPath);
        console.log('Database file size:', stats.size, 'bytes');
      }

      this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');

          // Check if this is an existing database by looking for tables
          this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profiles'", (err, row) => {
            if (err) {
              console.error('Error checking for existing tables:', err);
            } else {
              console.log('user_profiles table exists:', !!row);
              if (row) {
                // Count existing user profiles
                this.db.get("SELECT COUNT(*) as count FROM user_profiles", (err, countRow) => {
                  if (!err && countRow) {
                    console.log('Existing user profiles count:', countRow.count);
                  }
                });
              }
            }
          });

          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    return new Promise((resolve, reject) => {
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

      const createFastsTable = `
        CREATE TABLE IF NOT EXISTS fasts (
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

      const createScheduleDraftsTable = `
        CREATE TABLE IF NOT EXISTS schedule_drafts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_profile_id INTEGER NOT NULL UNIQUE,
          payload TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          dismissed_at DATETIME,
          FOREIGN KEY (user_profile_id) REFERENCES user_profiles (id) ON DELETE CASCADE
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

      const createBodyLogEntriesTable = `
        CREATE TABLE IF NOT EXISTS body_log_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_profile_id INTEGER NOT NULL,
          fast_id INTEGER,
          logged_at DATETIME NOT NULL,
          local_date TEXT NOT NULL,
          timezone_offset_minutes INTEGER,
          weight REAL NOT NULL,
          body_fat REAL,
          entry_tag TEXT DEFAULT 'ad_hoc',
          source TEXT DEFAULT 'manual',
          notes TEXT,
          is_canonical BOOLEAN DEFAULT 0,
          canonical_status TEXT DEFAULT 'auto',
          canonical_reason TEXT,
          canonical_override_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_profile_id) REFERENCES user_profiles (id) ON DELETE CASCADE,
          FOREIGN KEY (fast_id) REFERENCES fasts (id) ON DELETE SET NULL
        )
      `;

      const createBodyLogUserDateIndex = `
        CREATE INDEX IF NOT EXISTS idx_body_log_user_date
        ON body_log_entries (user_profile_id, local_date, logged_at DESC)
      `;

      const createBodyLogFastIndex = `
        CREATE INDEX IF NOT EXISTS idx_body_log_fast
        ON body_log_entries (fast_id)
      `;

      const createBodyLogCanonicalIndex = `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_body_log_canonical_per_day
        ON body_log_entries (user_profile_id, local_date)
        WHERE is_canonical = 1
      `;

      // Create all tables in sequence
      this.db.serialize(() => {
        this.db.run(createUserProfilesTable, (err) => {
          if (err) {
            console.error('Error creating user_profiles table:', err);
            reject(err);
            return;
          }
          console.log('User profiles table ready');
        });

        this.db.run(createFastsTable, (err) => {
          if (err) {
            console.error('Error creating fasts table:', err);
            reject(err);
            return;
          }
          console.log('Fasts table ready');
        });

        this.db.run(createMilestonesTable, (err) => {
          if (err) {
            console.error('Error creating milestones table:', err);
            reject(err);
            return;
          }
          console.log('Milestones table ready');
        });

        this.db.run(createSchedulesTable, (err) => {
          if (err) {
            console.error('Error creating schedules table:', err);
            reject(err);
            return;
          }
          console.log('Schedules table ready');
        });

        this.db.run(createScheduleDraftsTable, (err) => {
          if (err) {
            console.error('Error creating schedule_drafts table:', err);
            reject(err);
            return;
          }
          console.log('Schedule drafts table ready');
        });

        this.db.run(createFastingBlocksTable, (err) => {
          if (err) {
            console.error('Error creating fasting_blocks table:', err);
            reject(err);
            return;
          }
          console.log('Fasting blocks table ready');
        });

        this.db.run(createOverridesTable, (err) => {
          if (err) {
            console.error('Error creating overrides table:', err);
            reject(err);
            return;
          }
          console.log('Overrides table ready');
        });

        this.db.run(createPlannedInstancesTable, (err) => {
          if (err) {
            console.error('Error creating planned_instances table:', err);
            reject(err);
            return;
          }
          console.log('Planned instances table ready');

          this.db.run(createBodyLogEntriesTable, (err) => {
            if (err) {
              console.error('Error creating body_log_entries table:', err);
              reject(err);
              return;
            }
            console.log('Body log entries table ready');

            this.db.run(createBodyLogUserDateIndex, (err) => {
              if (err) {
                console.error('Error creating body log user/date index:', err);
                reject(err);
                return;
              }

              this.db.run(createBodyLogFastIndex, (err) => {
                if (err) {
                  console.error('Error creating body log fast index:', err);
                  reject(err);
                  return;
                }

                this.db.run(createBodyLogCanonicalIndex, (err) => {
                  if (err) {
                    console.error('Error creating body log canonical index:', err);
                    reject(err);
                    return;
                  }

                  console.log('Body log indexes ready');
                  console.log('Database initialized successfully');
                  resolve();
                });
              });
            });
          });
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

  async getFastsByUserAndDateRange(userProfileId, startIso, endIso) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM fasts
        WHERE user_profile_id = ?
          AND (
            (start_time BETWEEN ? AND ?)
            OR (end_time IS NOT NULL AND end_time BETWEEN ? AND ?)
            OR (start_time <= ? AND (end_time IS NULL OR end_time >= ?))
          )
        ORDER BY start_time ASC
      `;

      this.db.all(
        query,
        [
          userProfileId,
          startIso,
          endIso,
          startIso,
          endIso,
          startIso,
          endIso
        ],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
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

  async getFastEndingNearTimestamp(user_profile_id, timestampIso, windowMinutes = 120) {
    return new Promise((resolve, reject) => {
      if (!timestampIso) {
        reject(new Error('timestampIso is required to query fast end proximity'));
        return;
      }

      const ts = new Date(timestampIso);
      if (Number.isNaN(ts.getTime())) {
        reject(new Error('Invalid timestampIso provided'));
        return;
      }

      const windowStart = new Date(ts.getTime() - windowMinutes * 60 * 1000).toISOString();

      const query = `
        SELECT * FROM fasts
        WHERE user_profile_id = ?
          AND end_time IS NOT NULL
          AND end_time <= ?
          AND end_time >= ?
        ORDER BY end_time DESC
        LIMIT 1
      `;

      this.db.get(query, [user_profile_id, timestampIso, windowStart], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  // Body Log CRUD methods
  async createBodyLogEntry(entryData) {
    return new Promise((resolve, reject) => {
      const {
        user_profile_id,
        fast_id = null,
        logged_at,
        local_date,
        timezone_offset_minutes = null,
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
        reject(new Error('Missing required fields for body log entry'));
        return;
      }

      const canonicalFlag = is_canonical ? 1 : 0;
      const overrideTimestamp = canonicalFlag && canonical_status === 'manual'
        ? (canonical_override_at || new Date().toISOString())
        : null;

      const query = `
        INSERT INTO body_log_entries (
          user_profile_id,
          fast_id,
          logged_at,
          local_date,
          timezone_offset_minutes,
          weight,
          body_fat,
          entry_tag,
          source,
          notes,
          is_canonical,
          canonical_status,
          canonical_reason,
          canonical_override_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        user_profile_id,
        fast_id,
        logged_at,
        local_date,
        timezone_offset_minutes,
        weight,
        body_fat,
        entry_tag,
        source,
        notes,
        canonicalFlag,
        canonical_status,
        canonical_reason,
        overrideTimestamp
      ];

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...entryData, is_canonical: !!canonicalFlag, canonical_override_at: overrideTimestamp });
        }
      });
    });
  }

  async getBodyLogEntryById(id) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM body_log_entries WHERE id = ?';

      this.db.get(query, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async getBodyLogEntriesByUser(user_profile_id, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        startDate,
        endDate,
        limit,
        offset = 0,
        includeSecondary = true
      } = options;

      const conditions = ['user_profile_id = ?'];
      const params = [user_profile_id];

      if (startDate) {
        conditions.push('local_date >= ?');
        params.push(startDate);
      }

      if (endDate) {
        conditions.push('local_date <= ?');
        params.push(endDate);
      }

      if (!includeSecondary) {
        conditions.push('is_canonical = 1');
      }

      let query = `
        SELECT * FROM body_log_entries
        WHERE ${conditions.join(' AND ')}
        ORDER BY logged_at DESC
      `;

      if (limit) {
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async getBodyLogEntriesForDate(user_profile_id, localDate) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM body_log_entries
        WHERE user_profile_id = ? AND local_date = ?
        ORDER BY logged_at ASC
      `;

      this.db.all(query, [user_profile_id, localDate], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async updateBodyLogEntry(id, updateData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined && key !== 'id') {
          if (key === 'is_canonical') {
            fields.push(`${key} = ?`);
            values.push(value ? 1 : 0);
          } else {
            fields.push(`${key} = ?`);
            values.push(value);
          }
        }
      });

      if (fields.length === 0) {
        resolve({ id, ...updateData });
        return;
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const query = `UPDATE body_log_entries SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(query, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, changes: this.changes });
        }
      });
    });
  }

  async deleteBodyLogEntry(id) {
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM body_log_entries WHERE id = ?';

      this.db.run(query, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  }

  async clearCanonicalForDate(user_profile_id, localDate, excludeEntryId = null) {
    return new Promise((resolve, reject) => {
      const params = [user_profile_id, localDate];
      let query = `
        UPDATE body_log_entries
        SET is_canonical = 0,
            canonical_reason = NULL,
            canonical_override_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_profile_id = ? AND local_date = ? AND is_canonical = 1
      `;

      if (excludeEntryId) {
        query += ' AND id <> ?';
        params.push(excludeEntryId);
      }

      this.db.run(query, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
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

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
          if (beginErr) {
            reject(beginErr);
            return;
          }

          const finalize = () => {
            this.db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                reject(commitErr);
                return;
              }
              this.getBodyLogEntryById(entryId)
                .then(resolve)
                .catch(reject);
            });
          };

          const rollback = (error) => {
            this.db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                console.error('Rollback error while marking canonical entry:', rollbackErr);
              }
              reject(error || rollbackErr);
            });
          };

          this.db.run(
            `UPDATE body_log_entries
             SET is_canonical = 0,
                 canonical_reason = NULL,
                 canonical_override_at = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_profile_id = ? AND local_date = ? AND id <> ?`,
            [entry.user_profile_id, entry.local_date, entryId],
            (clearErr) => {
              if (clearErr) {
                rollback(clearErr);
                return;
              }

              this.db.run(
                `UPDATE body_log_entries
                 SET is_canonical = 1,
                     canonical_status = ?,
                     canonical_reason = ?,
                     canonical_override_at = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [canonicalStatus, canonicalReason, overrideAt, entryId],
                (updateErr) => {
                  if (updateErr) {
                    rollback(updateErr);
                    return;
                  }

                  finalize();
                }
              );
            }
          );
        });
      });
    });
  }

  async getCanonicalEntryForDate(user_profile_id, localDate) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM body_log_entries
        WHERE user_profile_id = ? AND local_date = ? AND is_canonical = 1
        LIMIT 1
      `;

      this.db.get(query, [user_profile_id, localDate], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async getCanonicalEntriesByRange(user_profile_id, startDate, endDate) {
    return new Promise((resolve, reject) => {
      const conditions = ['user_profile_id = ?', 'is_canonical = 1'];
      const params = [user_profile_id];

      if (startDate) {
        conditions.push('local_date >= ?');
        params.push(startDate);
      }

      if (endDate) {
        conditions.push('local_date <= ?');
        params.push(endDate);
      }

      const query = `
        SELECT * FROM body_log_entries
        WHERE ${conditions.join(' AND ')}
        ORDER BY local_date ASC
      `;

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async getBodyLogEntriesByFastId(fast_id) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM body_log_entries
        WHERE fast_id = ?
        ORDER BY logged_at ASC
      `;

      this.db.all(query, [fast_id], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
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

  async getScheduleDraftByUserProfile(userProfileId, { includeDismissed = false } = {}) {
    return new Promise((resolve, reject) => {
      const query = includeDismissed
        ? 'SELECT * FROM schedule_drafts WHERE user_profile_id = ?'
        : 'SELECT * FROM schedule_drafts WHERE user_profile_id = ? AND dismissed_at IS NULL';

      this.db.get(query, [userProfileId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          if (!row) {
            resolve(null);
            return;
          }

          try {
            const payload = JSON.parse(row.payload);
            resolve({ ...row, payload });
          } catch (parseError) {
            console.error('Error parsing schedule draft payload:', parseError);
            resolve({ ...row, payload: null, payloadParseError: true });
          }
        }
      });
    });
  }

  async upsertScheduleDraft(userProfileId, payload) {
    return new Promise((resolve, reject) => {
      const payloadJson = JSON.stringify(payload);
      const query = `
        INSERT INTO schedule_drafts (user_profile_id, payload, dismissed_at)
        VALUES (?, ?, NULL)
        ON CONFLICT(user_profile_id) DO UPDATE SET
          payload = excluded.payload,
          dismissed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      `;

      this.db.run(query, [userProfileId, payloadJson], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, user_profile_id: userProfileId });
        }
      });
    });
  }

  async deleteScheduleDraft(userProfileId) {
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM schedule_drafts WHERE user_profile_id = ?';

      this.db.run(query, [userProfileId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  }

  async markScheduleDraftDismissed(userProfileId) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE schedule_drafts
        SET dismissed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_profile_id = ?
      `;

      this.db.run(query, [userProfileId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ dismissed: this.changes > 0 });
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
  async generatePlannedInstances(scheduleId, weeksAhead = 4, options = {}) {
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
          const blockInstances = await this.generateInstancesForBlock(block, schedule, now, endDate, options);
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
