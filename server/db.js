'use strict';

/**
 * SQLite setup for the collaborative document editor.
 *
 * Responsibilities:
 *   1. Open `database.sqlite` next to this file.
 *   2. Create the `users`, `documents` and `document_shares` tables.
 *   3. Seed exactly three demo users (idempotent).
 *   4. Export promise-based helpers so routes never touch callbacks.
 *
 * Run directly with `npm run db:init` to (re)build the database.
 */

const path = require('path');
const sqlite3 = require('sqlite3');

// Tests set DB_PATH=:memory: before requiring this module.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(DB_PATH);

// --- Promise wrappers -------------------------------------------------------

/** Execute a statement (INSERT/UPDATE/DELETE/DDL). */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/** Fetch a single row, or `undefined` when there is no match. */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/** Fetch every matching row. */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// --- Schema -----------------------------------------------------------------

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL DEFAULT 'Untitled document',
    content    TEXT NOT NULL DEFAULT '',
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS document_shares (
    doc_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (doc_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
  CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
`;

const SEED_USERS = [
  { id: 1, email: 'alice@demo.com', name: 'Alice' },
  { id: 2, email: 'bob@demo.com', name: 'Bob' },
  { id: 3, email: 'charlie@demo.com', name: 'Charlie' },
];

async function initialize() {
  await run('PRAGMA foreign_keys = ON');
  await run('PRAGMA journal_mode = WAL');

  // sqlite3 can only execute one statement per call, so split on ';'.
  const statements = SCHEMA.split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await run(statement);
  }

  for (const user of SEED_USERS) {
    await run(
      'INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)',
      [user.id, user.email, user.name]
    );
  }

  return db;
}

function close() {
  return new Promise((resolve, reject) => {
    db.close((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = { db, DB_PATH, initialize, close, run, get, all };

// Allow `node db.js` / `npm run db:init`.
if (require.main === module) {
  initialize()
    .then(async () => {
      const users = await all('SELECT id, email, name FROM users ORDER BY id');
      console.log(`Database ready at ${DB_PATH}`);
      console.table(users);
      await close();
    })
    .catch(async (err) => {
      console.error('Database initialization failed:', err);
      await close().catch(() => {});
      process.exitCode = 1;
    });
}
