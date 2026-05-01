#!/usr/bin/env node
/**
 * Migrate SQLite (Render) → PostgreSQL (Neon)
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/migrate-to-neon.js /path/to/fasting.db
 *
 * After migrating, the script prints your session ID(s) and the localStorage
 * snippet you need to paste in the browser console on the new domain to restore
 * your session.
 */

'use strict';

require('dotenv').config();

const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// ── helpers ──────────────────────────────────────────────────────────────────

const BOOLEAN_FIELDS = {
  user_profiles:    ['hunger_coach_enabled', 'benefits_enabled', 'benefits_onboarded'],
  fasts:            ['is_manual', 'is_active', 'start_in_ketosis'],
  schedules:        ['is_paused'],
  fasting_blocks:   ['is_active'],
  body_log_entries: ['is_canonical'],
};

// SQLite stores datetimes as "YYYY-MM-DD HH:MM:SS" (UTC on Render).
// PostgreSQL needs a timezone-aware value.
function toUtcTimestamp(val) {
  if (val == null) return null;
  const s = String(val).trim();
  // Already has timezone info: ends with Z, +HH:MM, or -HH:MM offset
  if (/Z$|[+-]\d{2}:\d{2}$/.test(s) || s.toUpperCase().endsWith(' UTC')) return s;
  // "YYYY-MM-DD HH:MM:SS" with no timezone → treat as UTC
  return s.replace(' ', 'T') + 'Z';
}

const DATETIME_COLS = new Set([
  'onboarded_at', 'last_hunger_notification',
  'created_at', 'updated_at', 'dismissed_at',
  'start_time', 'end_time', 'achieved_at', 'logged_at',
  'start_at_utc', 'end_at_utc', 'canonical_override_at',
]);

function transformRow(table, row) {
  const out = {};
  const bools = BOOLEAN_FIELDS[table] || [];

  for (const [col, val] of Object.entries(row)) {
    if (bools.includes(col)) {
      // SQLite stores booleans as 0/1 integers
      out[col] = val == null ? null : Boolean(val);
    } else if (DATETIME_COLS.has(col)) {
      out[col] = toUtcTimestamp(val);
    } else {
      out[col] = val;
    }
  }
  return out;
}

// ── SQLite helpers ────────────────────────────────────────────────────────────

function sqliteAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// ── PostgreSQL bulk insert ────────────────────────────────────────────────────

async function insertRows(pgClient, table, rows) {
  if (!rows.length) return 0;

  // Build parameterised INSERT … ON CONFLICT DO NOTHING
  // (safe to re-run; ids are preserved)
  const cols = Object.keys(rows[0]);
  let paramIdx = 1;
  const valuePlaceholders = rows.map((row) => {
    const ph = cols.map(() => `$${paramIdx++}`).join(', ');
    return `(${ph})`;
  });

  const sql = `
    INSERT INTO ${table} (${cols.join(', ')})
    VALUES ${valuePlaceholders.join(', ')}
    ON CONFLICT DO NOTHING
  `;

  const flatValues = rows.flatMap((row) => cols.map((c) => row[c]));
  await pgClient.query(sql, flatValues);
  return rows.length;
}

// Reset the SERIAL sequence so future inserts don't collide with migrated IDs
async function resetSequence(pgClient, table) {
  await pgClient.query(`
    SELECT setval(
      pg_get_serial_sequence('${table}', 'id'),
      COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1,
      false
    )
  `);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sqlitePath = process.argv[2];

  if (!sqlitePath) {
    console.error('Usage: DATABASE_URL=... node scripts/migrate-to-neon.js /path/to/fasting.db');
    process.exit(1);
  }

  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite file not found: ${sqlitePath}`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // ── open SQLite ──
  const sqlite = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY, (err) => {
    if (err) { console.error('Cannot open SQLite:', err.message); process.exit(1); }
  });

  // ── connect to Neon ──
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const pgClient = await pool.connect();

  try {
    console.log('\n=== Fasting Forecast: SQLite → Neon Migration ===\n');

    // Ensure schema exists (the app's createTables equivalent)
    // We'll let the app handle schema creation; just verify tables exist.
    const { rows: tables } = await pgClient.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);
    const existing = new Set(tables.map((r) => r.tablename));
    const required = ['user_profiles', 'fasts', 'milestones', 'schedules',
                      'schedule_drafts', 'fasting_blocks', 'overrides',
                      'planned_instances', 'body_log_entries'];

    const missing = required.filter((t) => !existing.has(t));
    if (missing.length) {
      console.error(`Missing tables in Neon: ${missing.join(', ')}`);
      console.error('Deploy the app to Vercel first (or run the server once with DATABASE_URL set) so it creates the schema, then re-run this script.');
      process.exit(1);
    }

    await pgClient.query('BEGIN');

    // Migration order respects foreign-key dependencies
    const migrationPlan = [
      'user_profiles',
      'schedules',
      'schedule_drafts',
      'fasts',
      'milestones',
      'fasting_blocks',
      'overrides',
      'planned_instances',
      'body_log_entries',
    ];

    const counts = {};
    for (const table of migrationPlan) {
      process.stdout.write(`  Migrating ${table} … `);
      const rows = await sqliteAll(sqlite, `SELECT * FROM ${table}`);
      const transformed = rows.map((r) => transformRow(table, r));

      // Insert in batches of 500 to stay within PostgreSQL parameter limits
      let inserted = 0;
      const BATCH = 500;
      for (let i = 0; i < transformed.length; i += BATCH) {
        inserted += await insertRows(pgClient, table, transformed.slice(i, i + BATCH));
      }

      await resetSequence(pgClient, table);
      counts[table] = inserted;
      console.log(`${inserted} rows`);
    }

    await pgClient.query('COMMIT');

    console.log('\n✓ Migration complete.\n');
    console.log('Row counts:');
    for (const [table, count] of Object.entries(counts)) {
      console.log(`  ${table.padEnd(22)} ${count}`);
    }

    // ── Print session info for browser restore ──
    const profiles = await sqliteAll(sqlite, 'SELECT id, session_id, weight, time_zone, created_at FROM user_profiles ORDER BY created_at');

    console.log(`\n${'─'.repeat(60)}`);
    console.log('SESSION RESTORE INSTRUCTIONS');
    console.log('─'.repeat(60));
    console.log(`Found ${profiles.length} user profile(s) in your database.\n`);

    profiles.forEach((p, i) => {
      console.log(`Profile ${i + 1}:`);
      console.log(`  Session ID : ${p.session_id}`);
      console.log(`  Weight     : ${p.weight}`);
      console.log(`  Timezone   : ${p.time_zone || '(not set)'}`);
      console.log(`  Created    : ${p.created_at}`);
      console.log('');
    });

    if (profiles.length > 0) {
      const sessionId = profiles[0].session_id;
      console.log('To restore your session on the new Vercel domain, open the browser');
      console.log('console on your Vercel app URL and paste this:');
      console.log('');
      console.log('  ┌─────────────────────────────────────────────────────┐');
      console.log(`  │  localStorage.setItem('fastingForecast_sessionId',  │`);
      console.log(`  │    '${sessionId}');  │`);
      console.log('  │  location.reload();                                 │');
      console.log('  └─────────────────────────────────────────────────────┘');
      console.log('');
      console.log('Or copy this one-liner:');
      console.log('');
      console.log(`localStorage.setItem('fastingForecast_sessionId','${sessionId}');location.reload();`);
      console.log('');
      console.log('Repeat in every browser / device where you want to restore the session.');
    }

  } catch (err) {
    await pgClient.query('ROLLBACK').catch(() => {});
    console.error('\nMigration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    pgClient.release();
    await pool.end();
    sqlite.close();
  }
}

main();
