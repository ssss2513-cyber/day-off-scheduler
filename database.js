const path = require('path');
const fs = require('fs');

const isPostgres = !!process.env.DATABASE_URL;

let pgPool = null;
let sqliteDb = null;

if (isPostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else {
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  sqliteDb = new Database(path.join(dataDir, 'dayoff.db'));
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
}

// Convert ? to $1, $2, ... for Postgres
function toPgSql(sql) {
  let count = 1;
  return sql.replace(/\?/g, () => `$${count++}`);
}

async function initDb() {
  if (isPostgres) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'member' CHECK(role IN ('admin', 'member')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS weeks (
        id SERIAL PRIMARY KEY,
        year INTEGER NOT NULL,
        week_number INTEGER NOT NULL,
        start_date VARCHAR(50) NOT NULL,
        end_date VARCHAR(50) NOT NULL,
        is_closed INTEGER DEFAULT 0,
        closed_at TIMESTAMP,
        closed_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, week_number)
      );

      CREATE TABLE IF NOT EXISTS day_offs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        date VARCHAR(50) NOT NULL,
        week_id INTEGER NOT NULL REFERENCES weeks(id),
        is_fixed INTEGER DEFAULT 0,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_day_offs_week ON day_offs(week_id);
      CREATE INDEX IF NOT EXISTS idx_day_offs_user ON day_offs(user_id);
      CREATE INDEX IF NOT EXISTS idx_day_offs_date ON day_offs(date);
    `);
    console.log('✅ PostgreSQL (Cloud DB) 연결 및 테이블 준비 완료');
  } else {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS weeks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        week_number INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        is_closed INTEGER DEFAULT 0,
        closed_at DATETIME,
        closed_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, week_number),
        FOREIGN KEY (closed_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS day_offs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        week_id INTEGER NOT NULL,
        is_fixed INTEGER DEFAULT 0,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (week_id) REFERENCES weeks(id)
      );

      CREATE INDEX IF NOT EXISTS idx_day_offs_week ON day_offs(week_id);
      CREATE INDEX IF NOT EXISTS idx_day_offs_user ON day_offs(user_id);
      CREATE INDEX IF NOT EXISTS idx_day_offs_date ON day_offs(date);
    `);
    console.log('✅ SQLite (로컬 DB) 준비 완료');
  }
}

async function queryAll(sql, params = []) {
  if (isPostgres) {
    const res = await pgPool.query(toPgSql(sql), params);
    return res.rows;
  } else {
    return sqliteDb.prepare(sql).all(...params);
  }
}

async function queryOne(sql, params = []) {
  if (isPostgres) {
    const res = await pgPool.query(toPgSql(sql), params);
    return res.rows[0] || null;
  } else {
    return sqliteDb.prepare(sql).get(...params) || null;
  }
}

async function execute(sql, params = []) {
  if (isPostgres) {
    let execSql = sql;
    if (sql.trim().toUpperCase().startsWith('INSERT') && !sql.toUpperCase().includes('RETURNING')) {
      execSql += ' RETURNING id';
    }
    const res = await pgPool.query(toPgSql(execSql), params);
    const lastId = res.rows && res.rows[0] ? res.rows[0].id : null;
    return { lastInsertRowid: lastId, rowCount: res.rowCount };
  } else {
    const info = sqliteDb.prepare(sql).run(...params);
    return { lastInsertRowid: info.lastInsertRowid, rowCount: info.changes };
  }
}

module.exports = {
  initDb,
  queryAll,
  queryOne,
  execute,
  isPostgres
};
