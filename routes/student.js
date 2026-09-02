const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const ai = require('../services/aiDiagnosis');

router.use(authMiddleware);

router.post('/join-class', roleMiddleware('student'), (req, res) => {
  const { classCode } = req.body;
  if (!classCode) return res.status(400).json({ error: '请输入班级代码' });
  const cls = db.prepare("SELECT * FROM classes WHERE class_code = ?").get(classCode);
  if (!cls) return res.status(404).json({ error: '班级代码不存在' });
  db.prepare("UPDATE users SET class_code = ? WHERE id = ?").run(classCode, req.user.id);
  db.prepare("INSERT INTO student_logs (user_id, action, detail) VALUES (?, 'join_class', ?)").run(req.user.id, '加入班级：' + cls.class_name);
  ai.addNotification(req.user.id, 'class', '成功加入班级', '您已加入班级：' + cls.class_name);
  res.json({ message: '成功加入班级', class: cls });
});

router.get('/my-class', roleMiddleware('student'), (req, res) => {
  const user = db.prepare("SELECT class_code FROM users WHERE id = ?").get(req.user.id);
  if (!user.class_code) return res.json({ class: null });
  const cls = db.prepare("SELECT * FROM classes WHERE class_code = ?").get(user.class_code);
  res.json({ class: cls });
});

router.get('/tasks', roleMiddleware('student'), (req, res) => {
  const user = db.prepare("SELECT class_code FROM users WHERE id = ?").get(req.user.id);
  if (!user.class_code) return res.json({ tasks: [] });
  const tasks = db.prepare("SELECT t.*, c.class_name FROM tasks t JOIN classes c ON t.class_code = c.class_code WHERE t.class_code = ? AND t.is_active = 1 ORDER BY t.created_at DESC").all(user.class_code);
  for (const task of tasks) {
    const answered = db.prepare("SELECT COUNT(DISTINCT question_id) as c FROM answers WHERE user_id = ? AND task_id = ?").get(req.user.id, task.id).c;
    const correct = db.prepare("SELECT COUNT(*) as c FROM answers WHERE user_id = ? AND task_id = ? AND is_correct = 1").get(req.user.id, task.id).c;
    task.answered = answered;
    task.total_questions = task.question_count || 0;
    task.correct = correct;
    task.completed = answered >= task.total_questions;
  }
  res.json({ tasks });
});

router.get('/tasks/:id', roleMiddleware('student'), (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  const user = db.prepare("SELECT class_code FROM users WHERE id = ?").get(req.user.id);
  if (task.class_code !== user.class_code) return res.status(403).json({ error: '无权访问此任务' });
  const qids = (task.question_ids || '').split(',').filter(Boolean).map(Number);
  let questions = [];
  if (qids.length > 0) {
    const ph = qids.map(() => '?').join(',');
    questions = db.prepare("SELECT id, kp_id, kp_name, difficulty, type, question, options FROM questions WHERE id IN (" + ph + ")").all(...qids);
  }
  const answeredMap = {};
  const answers = db.prepare("SELECT * FROM answers WHERE user_id = ? AND task_id = ?").all(req.user.id, task.id);
  for (const a of answers) { answeredMap[a.question_id] = a; }
  res.json({ task, questions, answeredMap });
});

router.post('/tasks/:taskId/submit', roleMiddleware('student'), (req, res) => {
  const { questionId, answer } = req.body;
  const taskId = req.params.taskId;
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  const question = db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId);
  if (!question) return res.status(404).json({ error: '题目不存在' });
  const isCorrect = answer.trim().toUpperCase() === (question.answer || '').trim().toUpperCase();
  const existing = db.prepare("SELECT * FROM answers WHERE user_id = ? AND task_id = ? AND question_id = ?").get(req.user.id, taskId, questionId);
  let errorType = null;
  if (!isCorrect) { const a = ai.analyzeError(question, answer, question.answer); errorType = a.primary.key; }
  if (existing) {
    db.prepare("UPDATE answers SET user_answer = ?, is_correct = ?, error_type = ?, created_at = ? WHERE id = ?").run(answer, isCorrect ? 1 : 0, errorType, new Date().toISOString(), existing.id);
  } else {
    db.prepare("INSERT INTO answers (user_id, task_id, question_id, kp_id, kp_name, difficulty, user_answer, correct_answer, is_correct, error_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(req.user.id, taskId, questionId, question.kp_id, question.kp_name, question.difficulty, answer, question.answer, isCorrect ? 1 : 0, errorType);
  }
  if (!isCorrect) {
    const wq = db.prepare("SELECT * FROM wrong_questions WHERE user_id = ? AND question_id = ?").get(req.user.id, questionId);
    if (wq) { db.prepare("UPDATE wrong_questions SET wrong_count = wrong_count + 1, last_wrong_at = ? WHERE id = ?").run(new Date().toISOString(), wq.id); }
    else { db.prepare("INSERT INTO wrong_questions (user_id, question_id, kp_id, kp_name, first_wrong_at, last_wrong_at, wrong_count) VALUES (?, ?, ?, ?, ?, ?, 1)").run(req.user.id, questionId, question.kp_id, question.kp_name, new Date().toISOString(), new Date().toISOString()); }
  }
  let explanation = null;
  if (!isCorrect) { explanation = ai.explainWrongQuestion(question, answer); }
  res.json({ isCorrect, correctAnswer: question.answer, analysis: question.analysis, explanation, errorType });
});

router.get('/answers/history', roleMiddleware('student'), (req, res) => {
  const { taskId, kpId } = req.query;
  let sql = "SELECT a.*, q.question, q.options FROM answers a JOIN questions q ON a.question_id = q.id WHERE a.user_id = ?";
  const params = [req.user.id];
  if (taskId) { sql += " AND a.task_id = ?"; params.push(taskId); }
  if (kpId) { sql += " AND a.kp_id = ?"; params.push(kpId); }
  sql += " ORDER BY a.created_at DESC LIMIT 200";
  const answers = db.prepare(sql).all(...params);
  res.json({ answers });
});

router.get('/wrong-questions', roleMiddleware('student'), (req, res) => {
  const { kpId } = req.query;
  let sql = "SELECT wq.*, q.question, q.options, q.answer, q.analysis, q.difficulty FROM wrong_questions wq JOIN questions q ON wq.question_id = q.id WHERE wq.user_id = ?";
  const params = [req.user.id];
  if (kpId) { sql += " AND wq.kp_id = ?"; params.push(kpId); }
  sql += " ORDER BY wq.last_wrong_at DESC";
  const questions = db.prepare(sql).all(...params);
  res.json({ questions, total: questions.length });
});

router.post('/wrong-questions/:id/redo', roleMiddleware('student'), (req, res) => {
  const { answer } = req.body;
  const wq = db.prepare("SELECT * FROM wrong_questions WHERE user_id = ? AND id = ?").get(req.user.id, req.params.id);
  if (!wq) return res.status(404).json({ error: '错题不存在' });
  const question = db.prepare("SELECT * FROM questions WHERE id = ?").get(wq.question_id);
  const isCorrect = answer.trim().toUpperCase() === (question.answer || '').trim().toUpperCase();
  if (isCorrect) { db.prepare("UPDATE wrong_questions SET correct_count = COALESCE(correct_count, 0) + 1, last_correct_at = ? WHERE id = ?").run(new Date().toISOString(), wq.id); }
  db.prepare("INSERT INTO answers (user_id, question_id, kp_id, kp_name, difficulty, user_answer, correct_answer, is_correct, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'redo')").run(req.user.id, question.id, question.kp_id, question.kp_name, question.difficulty, answer, question.answer, isCorrect ? 1 : 0);
  let explanation = null;
  if (!isCorrect) { explanation = ai.explainWrongQuestion(question, answer); }
  res.json({ isCorrect, correctAnswer: question.answer, analysis: question.analysis, explanation });
});

router.get('/diagnosis', roleMiddleware('student'), (req, res) => {
  const report = ai.generateDiagnosisReport(req.user.id);
  res.json(report);
});

router.get('/adaptive-practice', roleMiddleware('student'), (req, res) => {
  const { kpId, count } = req.query;
  const num = parseInt(count) || 5;
  const questions = ai.generateAdaptiveQuestions(req.user.id, num, kpId ? parseInt(kpId) : null);
  const cleanQs = questions.map(q => ({ id: q.id, kp_id: q.kp_id, kp_name: q.kp_name, difficulty: q.difficulty, type: q.type, question: q.question, options: q.options }));
  res.json({ questions: cleanQs, count: cleanQs.length });
});

router.post('/adaptive-practice/submit', roleMiddleware('student'), (req, res) => {
  const { questionId, answer } = req.body;
  const question = db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId);
  if (!question) return res.status(404).json({ error: '题目不存在' });
  const isCorrect = answer.trim().toUpperCase() === (question.answer || '').trim().toUpperCase();
  let errorType = null;
  if (!isCorrect) { const a = ai.analyzeError(question, answer, question.answer); errorType = a.primary.key; }
  db.prepare("INSERT INTO answers (user_id, question_id, kp_id, kp_name, difficulty, user_answer, correct_answer, is_correct, error_type, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'adaptive')").run(req.user.id, questionId, question.kp_id, question.kp_name, question.difficulty, answer, question.answer, isCorrect ? 1 : 0, errorType);
  if (!isCorrect) {
    const wq = db.prepare("SELECT * FROM wrong_questions WHERE user_id = ? AND question_id = ?").get(req.user.id, questionId);
    if (wq) { db.prepare("UPDATE wrong_questions SET wrong_count = wrong_count + 1, last_wrong_at = ? WHERE id = ?").run(new Date().toISOString(), wq.id); }
    else { db.prepare("INSERT INTO wrong_questions (user_id, question_id, kp_id, kp_name, first_wrong_at, last_wrong_at, wrong_count) VALUES (?, ?, ?, ?, ?, ?, 1)").run(req.user.id, questionId, question.kp_id, question.kp_name, new Date().toISOString(), new Date().toISOString()); }
  }
  let explanation = null;
  if (!isCorrect) { explanation = ai.explainWrongQuestion(question, answer); }
  res.json({ isCorrect, correctAnswer: question.answer, analysis: question.analysis, explanation, errorType });
});

router.get('/learning-path', roleMiddleware('student'), (req, res) => {
  const report = ai.generateDiagnosisReport(req.user.id);
  res.json({ path: report.learning_path, suggestions: report.suggestions });
});

router.get('/knowledge-points', roleMiddleware('student', 'teacher', 'admin'), (req, res) => {
  const kps = db.prepare("SELECT * FROM knowledge_points ORDER BY difficulty, id").all();
  res.json({ knowledgePoints: kps });
});

router.get('/notifications', roleMiddleware('student', 'teacher', 'admin'), (req, res) => {
  const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(req.user.id);
  const unread = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0").get(req.user.id).c;
  res.json({ notifications: notifs, unread });
});

router.put('/notifications/read', roleMiddleware('student', 'teacher', 'admin'), (req, res) => {
  const { id } = req.body;
  if (id) { db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?").run(req.user.id, id); }
  else { db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id); }
  res.json({ message: '已标记为已读' });
});

router.get('/export/diagnosis', roleMiddleware('student'), (req, res) => {
  const report = ai.generateDiagnosisReport(req.user.id);
  res.json({ report, format: 'json' });
});

router.get('/export/wrong-questions', roleMiddleware('student'), (req, res) => {
  const wqs = db.prepare("SELECT wq.*, q.question, q.options, q.answer, q.analysis FROM wrong_questions wq JOIN questions q ON wq.question_id = q.id WHERE wq.user_id = ? ORDER BY wq.last_wrong_at DESC").all(req.user.id);
  res.json({ questions: wqs, total: wqs.length });
});

module.exports = router;
