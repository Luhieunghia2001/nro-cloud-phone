import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "user";
  created_at: string;
}

export interface DeviceSessionRow {
  id: string;
  name: string;
  owner_id: number;
  runtime_type: string;
  created_at: string;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS device_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        runtime_type TEXT NOT NULL DEFAULT 'kemulator-0.9.8',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS web_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        at TEXT NOT NULL DEFAULT (datetime('now')),
        level TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL
      );
    `);
  }

  findUserByUsername(username: string): UserRow | null {
    return (this.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined) ?? null;
  }

  findUserById(id: number): UserRow | null {
    return (this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined) ?? null;
  }

  createUser(username: string, passwordHash: string, role: "admin" | "user"): UserRow {
    const r = this.db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)").run(username, passwordHash, role);
    return this.findUserById(Number(r.lastInsertRowid))!;
  }

  countUsers(): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  }

  createWebSession(tokenHash: string, userId: number, expiresAt: string): void {
    this.db.prepare("INSERT INTO web_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, userId, expiresAt);
  }

  findWebSession(tokenHash: string): { token_hash: string; user_id: number; expires_at: string } | null {
    const row = this.db.prepare("SELECT * FROM web_sessions WHERE token_hash = ?").get(tokenHash) as
      | { token_hash: string; user_id: number; expires_at: string }
      | undefined;
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      this.db.prepare("DELETE FROM web_sessions WHERE token_hash = ?").run(tokenHash);
      return null;
    }
    return row;
  }

  deleteWebSession(tokenHash: string): void {
    this.db.prepare("DELETE FROM web_sessions WHERE token_hash = ?").run(tokenHash);
  }

  listSessions(ownerId: number, isAdmin: boolean): DeviceSessionRow[] {
    if (isAdmin) return this.db.prepare("SELECT * FROM device_sessions ORDER BY created_at DESC").all() as unknown as DeviceSessionRow[];
    return this.db.prepare("SELECT * FROM device_sessions WHERE owner_id = ? ORDER BY created_at DESC").all(ownerId) as unknown as DeviceSessionRow[];
  }

  getSession(id: string): DeviceSessionRow | null {
    return (this.db.prepare("SELECT * FROM device_sessions WHERE id = ?").get(id) as DeviceSessionRow | undefined) ?? null;
  }

  createSession(id: string, name: string, ownerId: number, runtimeType: string): DeviceSessionRow {
    this.db.prepare("INSERT INTO device_sessions (id, name, owner_id, runtime_type) VALUES (?, ?, ?, ?)").run(id, name, ownerId, runtimeType);
    return this.getSession(id)!;
  }

  addEvent(sessionId: string, level: string, message: string): void {
    this.db.prepare("INSERT INTO session_events (session_id, level, message) VALUES (?, ?, ?)").run(sessionId, level, message);
    // Giữ tối đa 100 event/phiên.
    this.db.prepare("DELETE FROM session_events WHERE session_id = ? AND id NOT IN (SELECT id FROM session_events WHERE session_id = ? ORDER BY id DESC LIMIT 100)").run(sessionId, sessionId);
  }

  recentEvents(sessionId: string): { at: string; level: "info" | "warn" | "error"; message: string }[] {
    const rows = this.db.prepare("SELECT at, level, message FROM session_events WHERE session_id = ? ORDER BY id DESC LIMIT 20").all(sessionId) as {
      at: string;
      level: string;
      message: string;
    }[];
    return rows.reverse().map((r) => ({ at: r.at, level: (r.level as "info" | "warn" | "error") || "info", message: r.message }));
  }

  close(): void {
    this.db.close();
  }
}
