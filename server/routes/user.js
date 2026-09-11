import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authMiddleware } from './auth.js';

const router = Router();

// 获取当前用户信息
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, avatar, subscription_tier, subscription_expires_at, monthly_question_count, monthly_reset_date, created_at FROM users WHERE id = ?',
      [req.userId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const u = rows[0];
    res.json({
      user: {
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        created_at: u.created_at,
        subscription: {
          tier: u.subscription_tier || 'free',
          expiresAt: u.subscription_expires_at ? new Date(u.subscription_expires_at).toISOString() : null,
        },
        usage: {
          monthlyQuestionCount: u.monthly_question_count || 0,
          monthlyResetDate: u.monthly_reset_date || null,
        },
      },
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 修改用户名和头像
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, avatar } = req.body;
    if (!username && !avatar) {
      return res.status(400).json({ error: '至少需要修改一项' });
    }

    if (username) {
      if (username.length < 2 || username.length > 20) {
        return res.status(400).json({ error: '用户名长度需在 2-20 位之间' });
      }
      const [existing] = await pool.execute(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username, req.userId],
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: '用户名已被占用' });
      }
    }

    const updates = [];
    const values = [];
    if (username) {
      updates.push('username = ?');
      values.push(username);
    }
    if (avatar) {
      updates.push('avatar = ?');
      values.push(avatar);
    }
    values.push(req.userId);

    await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    const [updated] = await pool.execute(
      'SELECT id, username, avatar FROM users WHERE id = ?',
      [req.userId],
    );
    res.json({ user: updated[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: '修改失败，请稍后重试' });
  }
});

// 修改密码
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '旧密码和新密码不能为空' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: '新密码长度至少 4 位' });
    }

    const [rows] = await pool.execute(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.userId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const valid = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ error: '旧密码不正确' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.userId]);

    res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: '修改密码失败，请稍后重试' });
  }
});

// 订阅
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { tier } = req.body;
    if (!['monthly', 'yearly'].includes(tier)) {
      return res.status(400).json({ error: '无效的订阅类型' });
    }

    const now = new Date();
    let expiresAt;
    if (tier === 'monthly') {
      expiresAt = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    } else {
      expiresAt = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    }

    await pool.execute(
      'UPDATE users SET subscription_tier = ?, subscription_expires_at = ? WHERE id = ?',
      [tier, expiresAt, req.userId],
    );

    res.json({
      subscription: { tier, expiresAt: expiresAt.toISOString() },
    });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: '订阅失败，请稍后重试' });
  }
});

// 记录提问次数
router.post('/usage/increment', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await pool.execute(
      'SELECT monthly_question_count, monthly_reset_date, subscription_tier FROM users WHERE id = ?',
      [req.userId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const u = rows[0];

    // 如果是新月或首次记录，重置计数
    let count = u.monthly_question_count || 0;
    if (!u.monthly_reset_date || u.monthly_reset_date !== today) {
      const resetDate = new Date();
      resetDate.setDate(1); // 每月1号重置（简化处理）
      count = 0;
    }

    count += 1;
    await pool.execute(
      'UPDATE users SET monthly_question_count = ?, monthly_reset_date = ? WHERE id = ?',
      [count, today, req.userId],
    );

    res.json({
      monthlyQuestionCount: count,
      monthlyResetDate: today,
    });
  } catch (err) {
    console.error('Usage increment error:', err);
    res.status(500).json({ error: '记录失败' });
  }
});

export default router;