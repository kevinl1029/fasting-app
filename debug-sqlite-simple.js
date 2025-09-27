const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Test minimal SQLite operations to isolate the issue
async function testMinimalSQLite() {
  console.log('=== Minimal SQLite Test ===');

  // Use the same path as production
  const dbPath = process.env.NODE_ENV === 'production'
    ? '/opt/render/project/src/database/fasting.db'
    : path.join(__dirname, 'database', 'test-minimal.db');

  console.log('Database path:', dbPath);

  // Check directory
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log('Database directory contents before:', fs.readdirSync(dbDir));

  // Check if database file exists
  const existsBefore = fs.existsSync(dbPath);
  console.log('Database file exists before connection:', existsBefore);

  if (existsBefore) {
    const statsBefore = fs.statSync(dbPath);
    console.log('Database file size before connection:', statsBefore.size, 'bytes');
  }

  return new Promise((resolve, reject) => {
    // Create database with minimal flags
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Database connection error:', err);
        reject(err);
        return;
      }

      console.log('SQLite connection successful');

      // Check file after connection
      const existsAfter = fs.existsSync(dbPath);
      console.log('Database file exists after connection:', existsAfter);

      if (existsAfter) {
        const statsAfter = fs.statSync(dbPath);
        console.log('Database file size after connection:', statsAfter.size, 'bytes');
      }

      // Create a simple test table
      db.run('CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, data TEXT)', (err) => {
        if (err) {
          console.error('Table creation error:', err);
          db.close();
          reject(err);
          return;
        }

        console.log('Test table created successfully');

        // Insert test data
        db.run('INSERT OR IGNORE INTO test_table (id, data) VALUES (1, ?)', [`Test data at ${new Date().toISOString()}`], (err) => {
          if (err) {
            console.error('Data insertion error:', err);
            db.close();
            reject(err);
            return;
          }

          console.log('Test data inserted successfully');

          // Read back data
          db.get('SELECT * FROM test_table WHERE id = 1', (err, row) => {
            if (err) {
              console.error('Data read error:', err);
              db.close();
              reject(err);
              return;
            }

            console.log('Test data retrieved:', row);

            // Check final file size
            const finalStats = fs.statSync(dbPath);
            console.log('Final database file size:', finalStats.size, 'bytes');

            // Close cleanly
            db.close((err) => {
              if (err) {
                console.error('Database close error:', err);
                reject(err);
              } else {
                console.log('Database closed successfully');

                // Check file size after close
                const finalStatsAfterClose = fs.statSync(dbPath);
                console.log('Database file size after close:', finalStatsAfterClose.size, 'bytes');

                resolve();
              }
            });
          });
        });
      });
    });
  });
}

testMinimalSQLite().catch(console.error);