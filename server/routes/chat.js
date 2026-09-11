import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// JWT 认证中间件（简化版，与 auth.js 保持一致）
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    return res.status(401).json({ error: 'Token 无效' });
  }
}

router.use(authMiddleware);

// 获取用户的所有会话列表
router.get('/sessions', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, session_id, title, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC',
      [req.userId],
    );
    res.json({ sessions: rows });
  } catch (err) {
    console.error('获取会话列表失败:', err.message);
    res.status(500).json({ error: '获取会话列表失败' });
  }
});

// 获取指定会话的聊天记录
router.get('/history/:sessionId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT messages, title FROM chat_sessions WHERE user_id = ? AND session_id = ?',
      [req.userId, req.params.sessionId],
    );
    if (rows.length === 0) {
      return res.json({ messages: [], title: '' });
    }
    const messages = typeof rows[0].messages === 'string'
      ? JSON.parse(rows[0].messages)
      : (rows[0].messages || []);
    res.json({ messages, title: rows[0].title || '' });
  } catch (err) {
    console.error('获取聊天记录失败:', err.message);
    res.status(500).json({ error: '获取聊天记录失败' });
  }
});

// 保存/更新聊天记录
router.post('/history/:sessionId', async (req, res) => {
  try {
    const { messages, title } = req.body;
    const messagesJson = JSON.stringify(messages || []);
    const sessionTitle = title || '';

    await pool.execute(
      `INSERT INTO chat_sessions (user_id, session_id, title, messages)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), messages = VALUES(messages), updated_at = CURRENT_TIMESTAMP`,
      [req.userId, req.params.sessionId, sessionTitle, messagesJson],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('保存聊天记录失败:', err.message);
    res.status(500).json({ error: '保存聊天记录失败' });
  }
});

// 删除会话
router.delete('/history/:sessionId', async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM chat_sessions WHERE user_id = ? AND session_id = ?',
      [req.userId, req.params.sessionId],
    );
    res.json({ success: true });
  } catch (err) {
    console.error('删除会话失败:', err.message);
    res.status(500).json({ error: '删除会话失败' });
  }
});

export { router as chatRouter };