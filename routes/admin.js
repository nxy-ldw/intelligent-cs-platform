const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authMiddleware, roleMiddleware('admin'));

router.get('/users', (req, res) => {
  const { role, keyword } = req.query;
  let sql = "SELECT id, username, role, phone, qq, class_code, identity, is_banned, created_by, created_at FROM users";
  const params = [];
  const conditions = [];

  if (role && role !== 'all') {
    conditions.push("role = ?");
    params.push(role);
  }
  if (keyword) {
    conditions.push("(username LIKE ? OR phone LIKE ? OR qq LIKE ? OR identity LIKE ?)");
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw, kw);
  }
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY created_at DESC";

  const users = db.prepare(sql).all(...params);
  res.json({ users });
});

router.post('/users', (req, res) => {
  const { username, password, role, phone, qq, identity, classCode } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: '用户名、密码和身份为必填项' });
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(409).json({ error: '用户名已存在' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (username, password, role, phone, qq, identity, class_code, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(username, hash, role, phone || '', qq || '', identity || '', classCode || '', req.user.username);

  res.json({ message: '用户创建成功' });
});

router.put('/users/:id', (req, res) => {
  const { username, phone, qq, password, classCode, identity } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const updates = [];
  const params = [];
  if (username) { updates.push("username = ?"); params.push(username); }
  if (phone !== undefined) { updates.push("phone = ?"); params.push(phone); }
  if (qq !== undefined) { updates.push("qq = ?"); params.push(qq); }
  if (classCode !== undefined) { updates.push("class_code = ?"); params.push(classCode); }
  if (identity !== undefined) { updates.push("identity = ?"); params.push(identity); }
  if (password) {
    updates.push("password = ?");
    params.push(bcrypt.hashSync(password, 10));
  }

  if (updates.length === 0) return res.status(400).json({ error: '没有需要更新的字段' });

  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ message: '用户信息已更新' });
});

router.put('/users/:id/ban', (req, res) => {
  const { banned } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.role === 'admin') return res.status(403).json({ error: '不能封禁管理员账号' });

  db.prepare("UPDATE users SET is_banned = ? WHERE id = ?").run(banned ? 1 : 0, req.params.id);
  res.json({ message: banned ? '账号已封禁' : '账号已解封' });
});

router.delete('/users/:id', (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (user.role === 'admin') return res.status(403).json({ error: '不能删除管理员账号' });

  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  db.prepare("DELETE FROM messages WHERE user_id = ?").run(req.params.id);
  db.prepare("DELETE FROM student_logs WHERE user_id = ?").run(req.params.id);
  res.json({ message: '用户已删除' });
});

router.post('/users/batch-generate', (req, res) => {
  const { role, prefix, count, classCode } = req.body;
  if (!prefix || !count || !role) {
    return res.status(400).json({ error: '请填写完整的生成参数' });
  }

  const num = parseInt(count);
  if (num > 100) return res.status(400).json({ error: '单次最多生成100个账号' });

  const generated = [];
  for (let i = 1; i <= num; i++) {
    const username = `${prefix}${String(i).padStart(3, '0')}`;
    const password = `${prefix}${String(i).padStart(3, '0')}123`;
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) continue;

    const hash = bcrypt.hashSync(password, 10);
    db.prepare(
      "INSERT INTO users (username, password, role, class_code, created_by) VALUES (?, ?, ?, ?, ?)"
    ).run(username, hash, role, classCode || '', req.user.username);
    generated.push({ username, password });
  }
  res.json({ message: `成功生成${generated.length}个账号`, accounts: generated });
});

router.get('/announcements', (req, res) => {
  const anns = db.prepare("SELECT * FROM announcements ORDER BY created_at DESC").all();
  res.json({ announcements: anns });
});

router.post('/announcements', (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: '标题和内容为必填项' });

  db.prepare("INSERT INTO announcements (title, content, created_by) VALUES (?, ?, ?)").run(
    title, content, req.user.username
  );
  res.json({ message: '公告发布成功' });
});

router.put('/announcements/:id', (req, res) => {
  const { title, content, isActive } = req.body;
  const ann = db.prepare("SELECT * FROM announcements WHERE id = ?").get(req.params.id);
  if (!ann) return res.status(404).json({ error: '公告不存在' });

  const updates = [];
  const params = [];
  if (title !== undefined) { updates.push("title = ?"); params.push(title); }
  if (content !== undefined) { updates.push("content = ?"); params.push(content); }
  if (isActive !== undefined) { updates.push("is_active = ?"); params.push(isActive ? 1 : 0); }
  params.push(req.params.id);

  if (updates.length > 0) {
    db.prepare(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  res.json({ message: '公告已更新' });
});

router.delete('/announcements/:id', (req, res) => {
  db.prepare("DELETE FROM announcements WHERE id = ?").run(req.params.id);
  res.json({ message: '公告已删除' });
});

router.put('/maintenance', (req, res) => {
  const { enabled } = req.body;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'maintenance_mode'").run(enabled ? 'true' : 'false');
  res.json({ message: enabled ? '维护模式已开启' : '维护模式已关闭', maintenance: enabled });
});

router.get('/stats', (req, res) => {
  const studentCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student'").get().c;
  const teacherCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'teacher'").get().c;
  const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
  const bannedCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE is_banned = 1").get().c;
  const classCount = db.prepare("SELECT COUNT(*) as c FROM classes").get().c;
  const messageCount = db.prepare("SELECT COUNT(*) as c FROM messages").get().c;
  const kbCount = db.prepare("SELECT COUNT(*) as c FROM knowledge_base").get().c;
  const annCount = db.prepare("SELECT COUNT(*) as c FROM announcements WHERE is_active = 1").get().c;
  const maintenance = db.prepare("SELECT value FROM settings WHERE key = 'maintenance_mode'").get();

  res.json({
    students: studentCount,
    teachers: teacherCount,
    admins: adminCount,
    banned: bannedCount,
    classes: classCount,
    messages: messageCount,
    knowledgeBase: kbCount,
    announcements: annCount,
    maintenance: maintenance ? maintenance.value === 'true' : false
  });
});

router.get('/knowledge-base', (req, res) => {
  const rows = db.prepare("SELECT * FROM knowledge_base ORDER BY category, id").all();
  res.json({ items: rows });
});

router.post('/knowledge-base', (req, res) => {
  const { category, question, answer, keywords } = req.body;
  if (!category || !question || !answer) return res.status(400).json({ error: '分类、问题和答案为必填项' });

  db.prepare("INSERT INTO knowledge_base (category, question, answer, keywords) VALUES (?, ?, ?, ?)").run(
    category, question, answer, keywords || ''
  );
  res.json({ message: '知识条目添加成功' });
});

router.put('/knowledge-base/:id', (req, res) => {
  const { category, question, answer, keywords } = req.body;
  db.prepare(
    "UPDATE knowledge_base SET category = ?, question = ?, answer = ?, keywords = ? WHERE id = ?"
  ).run(category, question, answer, keywords || '', req.params.id);
  res.json({ message: '知识条目已更新' });
});

router.delete('/knowledge-base/:id', (req, res) => {
  db.prepare("DELETE FROM knowledge_base WHERE id = ?").run(req.params.id);
  res.json({ message: '知识条目已删除' });
});

module.exports = router;
