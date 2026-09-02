const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authMiddleware);

router.post('/create-class', roleMiddleware('teacher'), (req, res) => {
  const { className } = req.body;
  if (!className) return res.status(400).json({ error: '请输入班级名称' });

  const classCode = uuidv4().substring(0, 8).toUpperCase();
  const user = db.prepare("SELECT id, username FROM users WHERE id = ?").get(req.user.id);

  db.prepare(
    "INSERT INTO classes (class_code, class_name, teacher_id, teacher_name) VALUES (?, ?, ?, ?)"
  ).run(classCode, className, user.id, user.username);

  res.json({ message: '班级创建成功', class: { classCode, className, teacherName: user.username } });
});

router.get('/classes', roleMiddleware('teacher'), (req, res) => {
  const classes = db.prepare("SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC").all(req.user.id);
  for (const cls of classes) {
    const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE class_code = ? AND role = 'student'").get(cls.class_code);
    cls.studentCount = count.c;
  }
  res.json({ classes });
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
    students = db.prepare(
      "SELECT id, username, phone, qq, class_code, identity, is_banned, created_at FROM users WHERE role = 'student' AND class_code = ? ORDER BY created_at DESC"
    ).all(classCode);
  } else {
    const classes = db.prepare("SELECT class_code FROM classes WHERE teacher_id = ?").all(req.user.id);
    const codes = classes.map(c => c.class_code);
    if (codes.length === 0) {
      return res.json({ students: [] });
    }
    const placeholders = codes.map(() => '?').join(',');
    students = db.prepare(
      `SELECT id, username, phone, qq, class_code, identity, is_banned, created_at FROM users WHERE role = 'student' AND class_code IN (${placeholders}) ORDER BY created_at DESC`
    ).all(...codes);
  }
  res.json({ students });
});

router.put('/students/:id/identity', roleMiddleware('teacher'), (req, res) => {
  const { identity } = req.body;
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });

  const teacherClasses = db.prepare("SELECT class_code FROM classes WHERE teacher_id = ?").all(req.user.id);
  const teacherCodes = teacherClasses.map(c => c.class_code);
  if (!teacherCodes.includes(student.class_code)) {
    return res.status(403).json({ error: '该学生不在您的班级中' });
  }

  db.prepare("UPDATE users SET identity = ? WHERE id = ?").run(identity, req.params.id);
  db.prepare("INSERT INTO student_logs (user_id, action, detail) VALUES (?, 'identity_change', ?)").run(
    student.id, `身份变更为：${identity}（由教师${req.user.username}操作）`
  );

  res.json({ message: '学生身份已更新' });
});

router.get('/student/:id/logs', roleMiddleware('teacher'), (req, res) => {
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });

  const teacherClasses = db.prepare("SELECT class_code FROM classes WHERE teacher_id = ?").all(req.user.id);
  const teacherCodes = teacherClasses.map(c => c.class_code);
  if (!teacherCodes.includes(student.class_code)) {
    return res.status(403).json({ error: '无权查看该学生信息' });
  }

  const logs = db.prepare("SELECT * FROM student_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").all(req.params.id);
  const chatCount = db.prepare("SELECT COUNT(*) as c FROM messages WHERE user_id = ?").get(req.params.id);
  res.json({ student, logs, chatCount: chatCount.c });
});

router.put('/students/:id/qq', roleMiddleware('teacher'), (req, res) => {
  const { qq } = req.body;
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });

  const teacherClasses = db.prepare("SELECT class_code FROM classes WHERE teacher_id = ?").all(req.user.id);
  const teacherCodes = teacherClasses.map(c => c.class_code);
  if (!teacherCodes.includes(student.class_code)) {
    return res.status(403).json({ error: '该学生不在您的班级中' });
  }

  db.prepare("UPDATE users SET qq = ? WHERE id = ?").run(qq, req.params.id);
  res.json({ message: 'QQ号已更新' });
});

router.put('/students/:id/phone', roleMiddleware('teacher'), (req, res) => {
  const { phone } = req.body;
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(req.params.id);
  if (!student) return res.status(404).json({ error: '学生不存在' });

  const teacherClasses = db.prepare("SELECT class_code FROM classes WHERE teacher_id = ?").all(req.user.id);
  const teacherCodes = teacherClasses.map(c => c.class_code);
  if (!teacherCodes.includes(student.class_code)) {
    return res.status(403).json({ error: '该学生不在您的班级中' });
  }

  db.prepare("UPDATE users SET phone = ? WHERE id = ?").run(phone, req.params.id);
  res.json({ message: '手机号已更新' });
});

module.exports = router;
