const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'ciwei.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT DEFAULT 'default',
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('✅ 小c的大脑（Node自带SQLite）初始化成功！');

module.exports = db;
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
)
`);

// 动态检查并添加 source 字段
try {
    const columns = db.prepare("PRAGMA table_info(messages)").all();
    const hasSource = columns.some(c => c.name === 'source');
    if (!hasSource) {
        db.exec("ALTER TABLE messages ADD COLUMN source TEXT DEFAULT 'web'");
        console.log("✅ 数据库升级：已成功添加 source 字段用于频道隔离");
    }
} catch (e) {
    console.log("⚠️ 数据库升级检查跳过:", e.message);
}
