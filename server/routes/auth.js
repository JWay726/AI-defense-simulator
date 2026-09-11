import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ai_defense_secret_key_2024';

// 注册
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需在 2-20 位之间' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: '密码长度至少 4 位' });
    }

    const [existing] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash, avatar) VALUES (?, ?, ?)',
      [username, password_hash, username.charAt(0).toUpperCase()],
    );

    const token = jwt.sign({ userId: result.insertId, username, isAdmin: false }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: result.insertId,
        username,
        avatar: username.charAt(0).toUpperCase(),
        isAdmin: false,
        subscription: { tier: 'free', expiresAt: null },
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const [rows] = await pool.execute(
      'SELECT id, username, password_hash, avatar, is_admin, subscription_tier, subscription_expires_at FROM users WHERE username = ?',
      [username],
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: '用户名不存在' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '密码错误' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        isAdmin: !!user.is_admin,
        subscription: {
          tier: user.subscription_tier || 'free',
          expiresAt: user.subscription_expires_at ? new Date(user.subscription_expires_at).toISOString() : null,
        },
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// 验证 token 中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

export { router, authMiddleware, JWT_SECRET };