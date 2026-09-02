const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

router.get('/users', (req, res) => {
  const { role, keyword } = req.query;
  let sql = "SELECT id, username, role, phone, class_code, is_banned, created_at FROM users WHERE 1=1";
  const params = [];
  if (role) { sql += " AND role = ?"; params.push(role); }
  if (keyword) { sql += " AND username LIKE ?"; params.push('%' + keyword + '%'); }
  sql += " ORDER BY created_at DESC LIMIT 200";
  const users = db.prepare(sql).all(...params);
  res.json({ users });
});

router.post('/users', (req, res) => {
  const { username, password, role, phone } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: '必填项不完整' });
  if (!['student', 'teacher', 'admin'].includes(role)) return res.status(400).json({ error: '角色无效' });
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(400).json({ error: '用户名已存在' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (username, password, role, phone, created_by) VALUES (?, ?, ?, ?, ?)").run(
    username, hash, role, phone || '', req.user.username
  );
  res.json({ message: '用户创建成功' });
});

router.put('/users/:id/ban', (req, res) => {
  const { banned } = req.body;
  db.prepare("UPDATE users SET is_banned = ? WHERE id = ?").run(banned ? 1 : 0, req.params.id);
  res.json({ message: banned ? '已禁用' : '已启用' });
});

router.put('/users/:id/reset-password', (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: '请输入新密码' });
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hash, req.params.id);
  res.json({ message: '密码重置成功' });
});

router.put('/users/:id/role', (req, res) => {
  const { role } = req.body;
  if (!['student', 'teacher', 'admin'].includes(role)) return res.status(400).json({ error: '角色无效' });
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, req.params.id);
  res.json({ message: '角色已更新' });
});

router.delete('/users/:id', (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ message: '用户已删除' });
});

router.get('/dashboard', (req, res) => {
  const totalUsers = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  const studentCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student'").get().c;
  const teacherCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'teacher'").get().c;
  const totalQuestions = db.prepare("SELECT COUNT(*) as c FROM questions").get().c;
  const totalAnswers = db.prepare("SELECT COUNT(*) as c FROM answers").get().c;
  const correctAnswers = db.prepare("SELECT COUNT(*) as c FROM answers WHERE is_correct = 1").get().c;
  const totalTasks = db.prepare("SELECT COUNT(*) as c FROM tasks").get().c;
  const totalClasses = db.prepare("SELECT COUNT(*) as c FROM classes").get().c;
  const avgCorrectRate = totalAnswers > 0 ? Math.round(correctAnswers / totalAnswers * 100) : 0;
  res.json({ totalUsers, studentCount, teacherCount, totalQuestions, totalAnswers, avgCorrectRate, totalTasks, totalClasses });
});

router.get('/config', (req, res) => {
  const config = db.prepare("SELECT * FROM system_config WHERE id = 1").get();
  res.json({ config: config || {} });
});

router.put('/config', (req, res) => {
  const { ai_model, api_base, api_key, context_length, safety_filter, welcome_message } = req.body;
  const existing = db.prepare("SELECT * FROM system_config WHERE id = 1").get();
  if (existing) {
    db.prepare("UPDATE system_config SET ai_model = ?, api_base = ?, api_key = ?, context_length = ?, safety_filter = ?, welcome_message = ? WHERE id = 1").run(
      ai_model || existing.ai_model, api_base || existing.api_base,
      api_key || existing.api_key, context_length || existing.context_length,
      safety_filter !== undefined ? safety_filter : existing.safety_filter,
      welcome_message !== undefined ? welcome_message : existing.welcome_message
    );
  } else {
    db.prepare("INSERT INTO system_config (id, ai_model, api_base, api_key, context_length, safety_filter, welcome_message) VALUES (1, ?, ?, ?, ?, ?, ?)").run(
      ai_model || 'gpt-4o-mini', api_base || '', api_key || '',
      context_length || 4000, safety_filter !== undefined ? safety_filter : 1, welcome_message || ''
    );
  }
  res.json({ message: '配置已更新' });
});

router.get('/logs', (req, res) => {
  const logs = db.prepare("SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 100").all();
  res.json({ logs });
});

router.get('/student-logs', (req, res) => {
  const logs = db.prepare("SELECT * FROM student_logs ORDER BY created_at DESC LIMIT 100").all();
  const users = db._raw.users;
  for (const log of logs) {
    const u = users.find(x => x.id === log.user_id);
    if (u) log.username = u.username;
  }
  res.json({ logs });
});

router.post('/question-bank/generate', (req, res) => {
  const gen = require('../services/questionGenerator');
  const count = parseInt(req.body.count) || 100;
  if (count > 5000) return res.status(400).json({ error: '单次生成不能超过5000题' });
  const result = gen.populateDatabase((db._raw.questions || []).length + count);
  res.json({ success: true, added: result.added, total: result.total });
});

router.get('/ai-apis', (req, res) => {
  var aiGen = require('../services/aiGenerate');
  res.json({ apis: aiGen.getApis() });
});

router.put('/ai-apis/:id', (req, res) => {
  var aiGen = require('../services/aiGenerate');
  var ok = aiGen.updateApi(parseInt(req.params.id), req.body);
  if (ok) res.json({ success: true });
  else res.status(404).json({ error: 'API不存在' });
});

router.get('/grade-levels', (req, res) => {
  res.json({ levels: db._raw.grade_levels || [] });
});

router.get('/textbook-versions', (req, res) => {
  var subject = req.query.subject;
  var versions = (db._raw.textbook_versions || []).filter(function(v) {
    return !subject || v.subject === subject;
  });
  res.json({ versions: versions });
});

router.get('/courses', (req, res) => {
  var subject = req.query.subject;
  var grade = req.query.grade;
  var courses = (db._raw.courses || []).filter(function(c) {
    return (!subject || c.subject === subject) && (!grade || c.grade === grade);
  });
  res.json({ courses: courses });
});

router.post('/ai-generate', async (req, res) => {
  var aiGen = require('../services/aiGenerate');
  try {
    var result = await aiGen.generateQuestions(req.body);
    res.json({ success: true, added: result.added, api_used: result.api_used });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/question-bank/stats', (req, res) => {
  const questions = db._raw.questions || [];
  var stats = { total: questions.length, bySubject: {}, byType: {}, byDifficulty: {} };
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    var s = q.subject || '未分类';
    stats.bySubject[s] = (stats.bySubject[s] || 0) + 1;
    stats.byType[q.type] = (stats.byType[q.type] || 0) + 1;
    stats.byDifficulty[q.difficulty] = (stats.byDifficulty[q.difficulty] || 0) + 1;
  }
  res.json(stats);
});

module.exports = router;
