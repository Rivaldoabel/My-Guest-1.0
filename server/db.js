import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
dotenv.config();

const dbPath = process.env.DATABASE_PATH || "./data/convites.sqlite";
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','operator')),
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 venue TEXT,
 event_date TEXT,
 capacity INTEGER,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS invitations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id INTEGER NOT NULL REFERENCES events(id),
 guest_name TEXT,
 note TEXT,
 token TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused','used','revoked')),
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 used_at TEXT,
 used_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_inv_event ON invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_inv_status ON invitations(status);
CREATE TABLE IF NOT EXISTS scan_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 invitation_id INTEGER,
 token_fragment TEXT,
 result TEXT NOT NULL,
 operator_id INTEGER REFERENCES users(id),
 scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(invitation_id) REFERENCES invitations(id)
);
`);
