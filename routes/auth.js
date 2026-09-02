const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth');

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (user.is_banned) {
    return res.status(403).json({ error: '该账号已被封禁，请联系管理员' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const maintenance = db.prepare("SELECT value FROM settings WHERE key = 'maintenance_mode'").get();
  if (maintenance && maintenance.value === 'true' && user.role !== 'admin') {
    return res.status(503).json({ error: '系统正在维护中，暂时无法登录，请稍后再试', maintenance: true });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  db.prepare("INSERT INTO student_logs (user_id, action, detail) VALUES (?, 'login', ?)").run(
    user.id,
    `用户${user.username}登录系统`
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      phone: user.phone,
      qq: user.qq,
      class_code: user.class_code,
      identity: user.identity
    }
  });
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = db.prepare("SELECT id, username, role, phone, qq, class_code, identity, is_banned FROM users WHERE id = ?").get(decoded.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ user });
  } catch (e) {
    res.status(401).json({ error: '登录已过期' });
  }
});

router.get('/announcements', (req, res) => {
  const anns = db.prepare("SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC").all();
  res.json({ announcements: anns });
});

router.get('/maintenance', (req, res) => {
  const m = db.prepare("SELECT value FROM settings WHERE key = 'maintenance_mode'").get();
  res.json({ maintenance: m ? m.value === 'true' : false });
});

module.exports = router;
