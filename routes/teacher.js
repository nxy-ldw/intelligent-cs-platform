const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const ai = require('../services/aiDiagnosis');
const extBank = require('../services/externalQuestionBank');

router.use(authMiddleware);

router.get('/classes', roleMiddleware('teacher'), (req, res) => {
  const classes = db.prepare("SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC").all(req.user.id);
  for (const cls of classes) {
    cls.studentCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE class_code = ? AND role = 'student'").get(cls.class_code).c;
  }
  res.json({ classes });
});

router.post('/create-class', roleMiddleware('teacher'), (req, res) => {
  const { className } = req.body;
  if (!className) return res.status(400).json({ error: '请输入班级名称' });
  const classCode = uuidv4().substring(0, 8).toUpperCase();
  db.prepare("INSERT INTO classes (class_code, class_name, teacher_id, teacher_name) VALUES (?, ?, ?, ?)").run(classCode, className, req.user.id, req.user.username);
  res.json({ message: '班级创建成功', classCode, className });
});

router.delete('/classes/:id', roleMiddleware('teacher'), (req, res) => {
  const cls = db.prepare("SELECT * FROM classes WHERE id = ? AND teacher_id = ?").get(req.params.id, req.user.id);
  if (!cls) return res.status(404).json({ error: '班级不存在或无权限' });
  db.prepare("UPDATE users SET class_code = '' WHERE class_code = ?").run(cls.class_code);
  db.prepare("DELETE FROM classes WHERE id = ?").run(req.params.id);
  res.json({ message: '班级已删除' });
});

router.get('/students', roleMiddleware('teacher'), (req, res) => {
  const { classCode } = req.query;
  let students;
  if (classCode) {
    students = db.prepare("SELECT id, username, phone, qq, class_code, identity, is_banned, created_at FROM users WHERE role = 'student' AND class_code = ? ORDER BY created_at DESC").all(classCode);
  } else {
    const classes = db.prepare("SELECT class_code FROM classes WHERE teacher_id = ?").all(req.user.id);
    const codes = classes.map(c => c.class_code);
    if (codes.length === 0) return res.json({ students: [] });
    const ph = codes.map(() => '?').join(',');
    students = db.prepare("SELECT id, username, phone, qq, class_code, identity, is_banned, created_at FROM users WHERE role = 'student' AND class_code IN (" + ph + ") ORDER BY created_at DESC").all(...codes);
  }
  for (const s of students) {
    const total = db.prepare("SELECT COUNT(*) as c FROM answers WHERE user_id = ?").get(s.id).c;
    const correct = db.prepare("SELECT COUNT(*) as c FROM answers WHERE user_id = ? AND is_correct = 1").get(s.id).c;
    s.total_answers = total;
    s.correct_rate = total > 0 ? Math.round(correct / total * 100) : 0;
  }
  res.json({ students });
});

router.put('/students/:id/identity', roleMiddleware('teacher'), (req, res) => {
  const { identity } = req.body;
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  db.prepare("UPDATE users SET identity = ? WHERE id = ?").run(identity, req.params.id);
  res.json({ message: '身份已更新' });
});

router.get('/student/:id/detail', roleMiddleware('teacher'), (req, res) => {
  const student = db.prepare("SELECT id, username, phone, qq, class_code, identity, created_at FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  const report = ai.generateDiagnosisReport(req.params.id);
  const answers = db.prepare("SELECT * FROM answers WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(req.params.id);
  const questions = db._raw.questions;
  for (const a of answers) {
    const q = questions.find(x => x.id === a.question_id);
    if (q) a.question = q.question;
  }
  const wrongCount = db.prepare("SELECT COUNT(*) as c FROM wrong_questions WHERE user_id = ?").get(req.params.id).c;
  res.json({ student, report, answers, wrongCount });
});

router.post('/students/batch-add', roleMiddleware('teacher'), (req, res) => {
  const { classCode, students } = req.body;
  if (!classCode || !students) return res.status(400).json({ error: '参数不完整' });
  const created = [];
  const failed = [];
  for (const s of students) {
    if (!s.username || !s.password) { failed.push({ reason: '缺少用户名或密码' }); continue; }
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(s.username);
    if (existing) { failed.push({ username: s.username, reason: '已存在' }); continue; }
    const hash = bcrypt.hashSync(s.password, 10);
    db.prepare("INSERT INTO users (username, password, role, class_code, created_by) VALUES (?, ?, 'student', ?, ?)").run(s.username, hash, classCode, req.user.username);
    created.push({ username: s.username, password: s.password });
  }
  res.json({ created, failed, successCount: created.length, failCount: failed.length });
});

router.get('/questions', roleMiddleware('teacher', 'admin'), (req, res) => {
  const { kpId, difficulty, keyword } = req.query;
  let sql = "SELECT * FROM questions WHERE 1=1";
  const params = [];
  if (kpId) { sql += " AND kp_id = ?"; params.push(kpId); }
  if (difficulty) { sql += " AND difficulty = ?"; params.push(difficulty); }
  if (keyword) { sql += " AND question LIKE ?"; params.push('%' + keyword + '%'); }
  sql += " ORDER BY kp_id, difficulty, id DESC";
  const questions = db.prepare(sql).all(...params);
  res.json({ questions, total: questions.length });
});

router.post('/questions', roleMiddleware('teacher', 'admin'), (req, res) => {
  const { kp_id, kp_name, difficulty, type, question, options, answer, analysis } = req.body;
  if (!kp_id || !question || !answer) return res.status(400).json({ error: '必填项不完整' });
  const kp = db.prepare("SELECT * FROM knowledge_points WHERE id = ?").get(kp_id);
  const kpName = kp_name || (kp ? kp.name : '');
  const result = db.prepare("INSERT INTO questions (kp_id, kp_name, difficulty, type, question, options, answer, analysis, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    kp_id, kpName, difficulty || 2, type || 'single', question, options || '[]', answer, analysis || '', req.user.username
  );
  res.json({ message: '题目添加成功', id: result.lastInsertRowid });
});

router.put('/questions/:id', roleMiddleware('teacher', 'admin'), (req, res) => {
  const q = db.prepare("SELECT * FROM questions WHERE id = ?").get(req.params.id);
  if (!q) return res.status(404).json({ error: '题目不存在' });
  const { kp_id, kp_name, difficulty, type, question, options, answer, analysis } = req.body;
  db.prepare("UPDATE questions SET kp_id = ?, kp_name = ?, difficulty = ?, type = ?, question = ?, options = ?, answer = ?, analysis = ? WHERE id = ?").run(
    kp_id || q.kp_id, kp_name || q.kp_name, difficulty || q.difficulty, type || q.type,
    question || q.question, options !== undefined ? options : q.options, answer || q.answer,
    analysis !== undefined ? analysis : q.analysis, req.params.id
  );
  res.json({ message: '题目已更新' });
});

router.delete('/questions/:id', roleMiddleware('teacher', 'admin'), (req, res) => {
  db.prepare("DELETE FROM questions WHERE id = ?").run(req.params.id);
  res.json({ message: '题目已删除' });
});

router.get('/knowledge-points', roleMiddleware('teacher', 'admin'), (req, res) => {
  const kps = db.prepare("SELECT * FROM knowledge_points ORDER BY difficulty, id").all();
  res.json({ knowledgePoints: kps });
});

router.post('/knowledge-points', roleMiddleware('admin'), (req, res) => {
  const { name, subject, difficulty, prerequisites, description } = req.body;
  if (!name) return res.status(400).json({ error: '名称必填' });
  db.prepare("INSERT INTO knowledge_points (name, subject, difficulty, prerequisites, description) VALUES (?, ?, ?, ?, ?)").run(
    name, subject || '数学', difficulty || 2, prerequisites || '', description || ''
  );
  res.json({ message: '知识点添加成功' });
});

router.put('/knowledge-points/:id', roleMiddleware('admin'), (req, res) => {
  const { name, subject, difficulty, prerequisites, description } = req.body;
  db.prepare("UPDATE knowledge_points SET name = ?, subject = ?, difficulty = ?, prerequisites = ?, description = ? WHERE id = ?").run(
    name, subject, difficulty, prerequisites || '', description || '', req.params.id
  );
  res.json({ message: '知识点已更新' });
});

router.delete('/knowledge-points/:id', roleMiddleware('admin'), (req, res) => {
  db.prepare("DELETE FROM knowledge_points WHERE id = ?").run(req.params.id);
  res.json({ message: '知识点已删除' });
});

router.post('/tasks', roleMiddleware('teacher'), (req, res) => {
  const { classCode, title, description, questionIds, deadline } = req.body;
  if (!classCode || !title || !questionIds) return res.status(400).json({ error: '参数不完整' });
  const qidStr = Array.isArray(questionIds) ? questionIds.join(',') : '';
  const result = db.prepare("INSERT INTO tasks (class_code, title, description, question_ids, question_count, deadline, created_by, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)").run(
    classCode, title, description || '', qidStr, (questionIds || []).length, deadline || null, req.user.username
  );
  const students = db.prepare("SELECT id FROM users WHERE class_code = ? AND role = 'student'").all(classCode);
  for (const s of students) {
    ai.addNotification(s.id, 'task', '新练习任务', '老师发布了新任务：' + title);
  }
  res.json({ message: '任务发布成功', taskId: result.lastInsertRowid });
});

router.get('/tasks', roleMiddleware('teacher'), (req, res) => {
  const classes = db.prepare("SELECT class_code FROM classes WHERE teacher_id = ?").all(req.user.id);
  const codes = classes.map(c => c.class_code);
  if (codes.length === 0) return res.json({ tasks: [] });
  const ph = codes.map(() => '?').join(',');
  const tasks = db.prepare("SELECT * FROM tasks WHERE class_code IN (" + ph + ") ORDER BY created_at DESC").all(...codes);
  for (const task of tasks) {
    task.student_count = db.prepare("SELECT COUNT(*) as c FROM users WHERE class_code = ? AND role = 'student'").get(task.class_code).c;
    const studentIds = db._raw.users.filter(u => u.class_code === task.class_code && u.role === 'student').map(u => u.id);
    const allAnswers = db._raw.answers.filter(a => a.task_id === task.id && studentIds.includes(a.user_id));
    const uniqueUsers = new Set(allAnswers.map(a => a.user_id));
    task.completed_count = uniqueUsers.size;
  }
  res.json({ tasks });
});

router.delete('/tasks/:id', roleMiddleware('teacher'), (req, res) => {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  res.json({ message: '任务已删除' });
});

router.get('/class-diagnosis/:classCode', roleMiddleware('teacher'), (req, res) => {
  const diagnosis = ai.calculateClassDiagnosis(req.params.classCode);
  res.json(diagnosis);
});

router.get('/student-diagnosis/:studentId', roleMiddleware('teacher'), (req, res) => {
  const report = ai.generateDiagnosisReport(req.params.studentId);
  res.json(report);
});

router.get('/question-bank/sources', roleMiddleware('teacher', 'admin'), (req, res) => {
  res.json(extBank.getSources());
});

router.get('/question-bank/search', roleMiddleware('teacher', 'admin'), (req, res) => {
  const result = extBank.searchQuestions(req.query);
  res.json(result);
});

router.post('/question-bank/import', roleMiddleware('teacher', 'admin'), (req, res) => {
  const result = extBank.importQuestions(req.body.questions || [], req.body.source || 'BUILTIN');
  res.json({ success: true, imported: result.imported, total: result.total });
});

router.post('/question-bank/generate', roleMiddleware('teacher', 'admin'), (req, res) => {
  const question = extBank.generateQuestion(req.body);
  if (question) {
    res.json({ success: true, question: question });
  } else {
    res.status(400).json({ error: '无法生成该知识点和类型的题目' });
  }
});

router.get('/grade-levels', roleMiddleware('teacher', 'admin'), (req, res) => {
  res.json({ levels: db._raw.grade_levels || [] });
});

router.get('/textbook-versions', roleMiddleware('teacher', 'admin'), (req, res) => {
  var subject = req.query.subject;
  var versions = (db._raw.textbook_versions || []).filter(function(v) {
    return !subject || v.subject === subject;
  });
  res.json({ versions: versions });
});

router.get('/courses', roleMiddleware('teacher', 'admin'), (req, res) => {
  var subject = req.query.subject;
  var grade = req.query.grade;
  var courses = (db._raw.courses || []).filter(function(c) {
    return (!subject || c.subject === subject) && (!grade || c.grade === grade);
  });
  res.json({ courses: courses });
});

router.post('/ai-generate', roleMiddleware('teacher', 'admin'), async (req, res) => {
  var aiGen = require('../services/aiGenerate');
  try {
    var result = await aiGen.generateQuestions(req.body);
    res.json({ success: true, added: result.added, questions: result.questions, api_used: result.api_used });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
