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

  CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT NOT NULL,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    page_path TEXT,
    category TEXT,
    author TEXT,
    published_at TEXT,
    historical_views INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE(property_id, normalized_title)
  );

  CREATE INDEX IF NOT EXISTS idx_articles_property_title
    ON articles(property_id, normalized_title);
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

const getSettingStatement = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?');
const setSettingStatement = db.prepare(`
  INSERT INTO app_settings (setting_key, setting_value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
`);

export function getSetting(key) {
  return getSettingStatement.get(key)?.setting_value ?? null;
}

export function setSetting(key, value) {
  setSettingStatement.run(key, String(value), new Date().toISOString());
}

const upsertArticleStatement = db.prepare(`
  INSERT INTO articles (
    property_id, title, normalized_title, page_path, category, author,
    published_at, historical_views, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(property_id, normalized_title) DO UPDATE SET
    title = excluded.title,
    page_path = excluded.page_path,
    category = excluded.category,
    author = excluded.author,
    published_at = excluded.published_at,
    historical_views = excluded.historical_views,
    updated_at = excluded.updated_at
`);

const findArticleStatement = db.prepare(`
  SELECT * FROM articles WHERE property_id = ? AND normalized_title = ? LIMIT 1
`);

const findArticleByPathStatement = db.prepare(`
  SELECT * FROM articles WHERE property_id = ? AND page_path = ? LIMIT 1
`);

export function upsertArticle(article) {
  upsertArticleStatement.run(
    article.propertyId,
    article.title,
    article.normalizedTitle,
    article.pagePath || null,
    article.category || null,
    article.author || null,
    article.publishedAt || null,
    Number(article.historicalViews) || 0,
    new Date().toISOString()
  );
}

export function findArticle(propertyId, normalizedTitle) {
  return findArticleStatement.get(propertyId, normalizedTitle) || null;
}

export function findArticleByPath(propertyId, pagePath) {
  return findArticleByPathStatement.get(propertyId, pagePath) || null;
}
