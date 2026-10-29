import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = resolve(process.env.SCC10_DB_PATH || 'data/scc10.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS realtime_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    active_users_5m INTEGER NOT NULL DEFAULT 0,
    active_users_30m INTEGER NOT NULL DEFAULT 0,
    page_views_30m INTEGER NOT NULL DEFAULT 0,
    active_articles_count INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_realtime_snapshots_property_time
    ON realtime_snapshots(property_id, captured_at);
`);

const insertSnapshot = db.prepare(`
  INSERT INTO realtime_snapshots (
    property_id,
    captured_at,
    active_users_5m,
    active_users_30m,
    page_views_30m,
    active_articles_count,
    payload_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const listSnapshots = db.prepare(`
  SELECT * FROM realtime_snapshots
  WHERE property_id = ?
    AND captured_at >= COALESCE(?, '0000-01-01T00:00:00.000Z')
    AND captured_at <= COALESCE(?, '9999-12-31T23:59:59.999Z')
  ORDER BY captured_at DESC
  LIMIT ?
`);

export function saveSnapshot(snapshot) {
  const result = insertSnapshot.run(
    snapshot.propertyId,
    snapshot.capturedAt || new Date().toISOString(),
    Number(snapshot.activeUsers5m) || 0,
    Number(snapshot.activeUsers30m) || 0,
    Number(snapshot.pageViews30m) || 0,
    Number(snapshot.activeArticlesCount) || 0,
    JSON.stringify(snapshot.payload || {})
  );
  return { id: Number(result.lastInsertRowid) };
}

export function getSnapshots({ propertyId, from, to, limit = 500 }) {
  return listSnapshots.all(propertyId, from || null, to || null, Math.min(Number(limit) || 500, 5000));
}
