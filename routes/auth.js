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
    { expiresIn: '30d' }
  );

  db.prepare("INSERT INTO operation_logs (user_id, action, detail, ip) VALUES (?, 'login', ?, ?)").run(
    user.id, '用户登录', req.ip || ''
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
      identity: user.identity,
      email: user.email || ''
    }
  });
});

router.post('/register', (req, res) => {
  const { username, password, role, phone, email, classCode } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: '请填写完整的注册信息' });
  }

  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度应为2-20个字符' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码长度不能少于6位' });
  }
  if (!['student', 'teacher'].includes(role)) {
    return res.status(400).json({ error: '注册角色无效' });
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: '用户名已被注册' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    "INSERT INTO users (username, password, role, phone, email, class_code, created_by) VALUES (?, ?, ?, ?, ?, ?, 'self')"
  ).run(username, hash, role, phone || '', email || '', classCode || '');

  const userId = result.lastInsertRowid;
  const token = jwt.sign(
    { id: userId, username, role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    message: '注册成功',
    token,
    user: { id: userId, username, role, phone: phone || '', qq: '', email: email || '', class_code: classCode || '', identity: '' }
  });
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = db.prepare("SELECT id, username, role, phone, qq, email, class_code, identity, is_banned FROM users WHERE id = ?").get(decoded.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ user });
  } catch (e) {
    res.status(401).json({ error: '登录已过期' });
  }
});

router.put('/profile', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const { phone, qq, email } = req.body;
    db.prepare("UPDATE users SET phone = ?, qq = ?, email = ? WHERE id = ?").run(
      phone || '', qq || '', email || '', decoded.id
    );
    res.json({ message: '个人信息已更新' });
  } catch (e) {
    res.status(401).json({ error: '登录已过期' });
  }
});

router.put('/password', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const { oldPassword, newPassword } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.id);

    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(400).json({ error: '原密码错误' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6位' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hash, decoded.id);

    db.prepare("INSERT INTO operation_logs (user_id, action, detail) VALUES (?, 'password_change', '修改密码')").run(decoded.id);

    res.json({ message: '密码修改成功' });
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

router.get('/home', (req, res) => {
  const stats = {
    totalStudents: db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student' AND is_banned = 0").get().c,
    totalTeachers: db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'teacher' AND is_banned = 0").get().c,
    totalQuestions: db.prepare("SELECT COUNT(*) as c FROM questions").get().c,
    totalKps: db.prepare("SELECT COUNT(*) as c FROM knowledge_points").get().c,
    totalAnswers: db.prepare("SELECT COUNT(*) as c FROM answers").get().c
  };

  const features = [
    { icon: '📊', title: 'AI学情诊断', desc: '基于答题记录智能分析知识点掌握程度，生成个性化诊断报告' },
    { icon: '🎯', title: '自适应辅导', desc: '针对薄弱知识点智能推送习题，动态调整难度，精准提升' },
    { icon: '📚', title: '错题本', desc: '自动归集错题，AI智能讲解，举一反三巩固薄弱项' },
    { icon: '🗺️', title: '学习路径', desc: '根据知识点依赖关系，规划最优学习顺序，循序渐进' },
    { icon: '👨‍🏫', title: '教师管理', desc: '班级管理、任务发布、学情看板，全面掌握教学情况' },
    { icon: '📈', title: '数据大盘', desc: '多维度数据统计，直观展示学习效果和教学质量' }
  ];

  const roles = [
    { role: '学生', icon: '🎓', desc: '在线练习、AI诊断、错题本、个性化辅导' },
    { role: '教师', icon: '👨‍🏫', desc: '班级管理、题库建设、任务发布、学情分析' },
    { role: '管理员', icon: '🛡️', desc: '账号管理、全局配置、数据监控、系统维护' }
  ];

  res.json({ stats, features, roles });
});

module.exports = router;
