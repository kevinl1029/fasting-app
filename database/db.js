const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      const dbPath = path.join(__dirname, 'fasting.db');
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_profile_id) REFERENCES user_profiles (id)
        )
      `;

      const copyDataFromOldTable = `
        INSERT INTO fasts_new (id, start_time, end_time, duration_hours, notes, weight, photos, is_manual, is_active, created_at, updated_at)
        SELECT id, start_time, end_time, duration_hours, notes, weight, photos, is_manual, is_active, created_at, updated_at
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

        this.db.run(createMilestonesTable, (err) => {
          if (err) {
            console.error('Error creating milestones table:', err);
            reject(err);
            return;
          }
          console.log('Milestones table created successfully');
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
        user_profile_id = null
      } = fastData;

      const query = `
        INSERT INTO fasts (start_time, end_time, notes, weight, photos, is_manual, is_active, user_profile_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(query, [start_time, end_time, notes, weight, photos, is_manual, is_active, user_profile_id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...fastData });
        }
      });
    });
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