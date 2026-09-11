import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ai_defense',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        avatar VARCHAR(10) DEFAULT '用',
        is_admin TINYINT(1) DEFAULT 0,
        subscription_tier ENUM('free', 'monthly', 'yearly') DEFAULT 'free',
        subscription_expires_at DATETIME NULL,
        monthly_question_count INT DEFAULT 0,
        monthly_reset_date DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        session_id VARCHAR(100) NOT NULL,
        title VARCHAR(200) DEFAULT '',
        messages JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_session (user_id, session_id)
      )
    `);
    console.log('Database tables initialized');

    // 兼容旧表：添加订阅相关列（如果不存在）
    const [cols] = await conn.execute(`SHOW COLUMNS FROM users LIKE 'subscription_tier'`);
    if (cols.length === 0) {
      await conn.execute(`ALTER TABLE users ADD COLUMN subscription_tier ENUM('free', 'monthly', 'yearly') DEFAULT 'free'`);
      await conn.execute(`ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME NULL`);
      await conn.execute(`ALTER TABLE users ADD COLUMN monthly_question_count INT DEFAULT 0`);
      await conn.execute(`ALTER TABLE users ADD COLUMN monthly_reset_date DATE NULL`);
      console.log('Added subscription columns to users table');
    }
  } finally {
    conn.release();
  }
}

export { pool, initDB };