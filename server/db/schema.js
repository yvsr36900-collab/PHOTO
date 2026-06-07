const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'snapgather.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      displayName TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      googleAccessToken TEXT,
      googleRefreshToken TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      joinCode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      occasionType TEXT NOT NULL,
      hostUserId INTEGER NOT NULL,
      durationMinutes INTEGER NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (hostUserId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS session_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId INTEGER NOT NULL,
      userId TEXT NOT NULL,
      displayName TEXT NOT NULL,
      joinedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sessionId) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId INTEGER NOT NULL,
      uploadedByUserId TEXT NOT NULL,
      uploadedByName TEXT NOT NULL,
      filename TEXT NOT NULL,
      originalName TEXT NOT NULL,
      uploadedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sessionId) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS rsvps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId INTEGER NOT NULL,
      guestName TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('attending', 'not_attending')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sessionId) REFERENCES sessions(id)
    );
  `);

  // Migrations — safe to run on existing DBs
  const migrations = [
    `ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE sessions ADD COLUMN stoppedAt TEXT`,
    `ALTER TABLE session_members ADD COLUMN lastSeenAt TEXT`,
  ];
  for (const sql of migrations) {
    try { database.exec(sql); } catch { /* column already exists */ }
  }

  seedDemoUsers(database);
  console.log('Database initialized.');
}

function seedDemoUsers(database) {
  const existing = database.prepare('SELECT COUNT(*) as cnt FROM users').get();
  if (existing.cnt > 0) return;

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insert = database.prepare(
    'INSERT INTO users (email, passwordHash, displayName, plan) VALUES (?, ?, ?, ?)'
  );

  insert.run('free@demo.com', hash('password123'), 'Free Demo User', 'free');
  insert.run('standard@demo.com', hash('password123'), 'Standard Demo User', 'standard');
  insert.run('premium@demo.com', hash('password123'), 'Premium Demo User', 'premium');

  console.log('Seeded demo users: free@demo.com, standard@demo.com, premium@demo.com (password: password123)');
}

module.exports = { getDb, initDb };
