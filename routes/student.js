const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const ai = require('../services/ai');

router.use(authMiddleware);

router.post('/join-class', roleMiddleware('student'), (req, res) => {
  const { classCode } = req.body;
  if (!classCode) return res.status(400).json({ error: '请输入班级代码' });

  const cls = db.prepare("SELECT * FROM classes WHERE class_code = ?").get(classCode);
  if (!cls) return res.status(404).json({ error: '班级代码不存在' });

  db.prepare("UPDATE users SET class_code = ? WHERE id = ?").run(classCode, req.user.id);
  db.prepare("INSERT INTO student_logs (user_id, action, detail) VALUES (?, 'join_class', ?)").run(
    req.user.id, `加入班级：${cls.class_name}(${classCode})`
  );

  res.json({ message: '成功加入班级', class: cls });
});

router.get('/my-class', roleMiddleware('student'), (req, res) => {
  const user = db.prepare("SELECT class_code FROM users WHERE id = ?").get(req.user.id);
  if (!user.class_code) return res.json({ class: null });

  const cls = db.prepare("SELECT * FROM classes WHERE class_code = ?").get(user.class_code);
  res.json({ class: cls });
});

router.post('/chat', roleMiddleware('student', 'teacher', 'admin'), (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: '请输入消息内容' });

  ai.saveMessage(req.user.id, 'user', message);

  const result = ai.generateResponse(message, req.user.id);
  ai.saveMessage(req.user.id, 'assistant', result.content, result.intent, result.confidence);

  db.prepare("INSERT INTO student_logs (user_id, action, detail) VALUES (?, 'chat', ?)").run(
    req.user.id, `AI对话：${message.substring(0, 50)}`
  );

  res.json(result);
});

router.get('/chat/history', roleMiddleware('student', 'teacher', 'admin'), (req, res) => {
  const history = ai.getHistory(req.user.id);
  res.json({ history });
});

router.delete('/chat/history', roleMiddleware('student', 'teacher', 'admin'), (req, res) => {
  db.prepare("DELETE FROM messages WHERE user_id = ?").run(req.user.id);
  res.json({ message: '聊天记录已清空' });
});

router.get('/knowledge-base', roleMiddleware('student', 'teacher', 'admin'), (req, res) => {
  const { category } = req.query;
  let rows;
  if (category) {
    rows = db.prepare("SELECT id, category, question, answer FROM knowledge_base WHERE category = ? ORDER BY id").all(category);
  } else {
    rows = db.prepare("SELECT id, category, question, answer FROM knowledge_base ORDER BY category, id").all();
  }
  const categories = [...new Set(rows.map(r => r.category))];
  res.json({ items: rows, categories });
});

router.get('/project-info', roleMiddleware('student', 'teacher', 'admin'), (req, res) => {
  res.json({
    title: '智能客服系统',
    subtitle: '基于医学知识库的智能应答系统',
    description: '本系统是一个基于医学知识库的智能客服系统教学平台，实现意图识别、多轮对话、知识库问答、人机协同等核心功能。学生端完整实现立项内容规则，教师端可管理学生并验证实现，管理端负责平台运营。',
    features: [
      { name: '核心对话系统', desc: '意图识别、多轮对话、知识库问答、实体提取', icon: 'chat' },
      { name: '知识库管理', desc: '医学知识结构化组织、知识图谱、版本管理、审核工作流', icon: 'book' },
      { name: '智能分配', desc: '人机协同工作流、置信度阈值转人工、紧急症状检测', icon: 'route' },
      { name: '多渠道接入', desc: 'Web聊天、移动应用、微信小程序、语音交互', icon: 'device' },
      { name: '数据分析', desc: '对话日志、用户画像、服务质量监控、性能仪表盘', icon: 'chart' },
      { name: '安全合规', desc: '数据加密、访问控制、审计日志、隐私保护', icon: 'shield' }
    ],
    kpis: [
      { name: '响应时间', target: '< 2秒' },
      { name: '意图识别准确率', target: '≥ 95%' },
      { name: '知识库回答准确率', target: '≥ 90%' },
      { name: '用户满意度', target: '≥ 4.2/5' },
      { name: '首次解决率', target: '≥ 85%' },
      { name: '人工转接率', target: '≤ 15%' },
      { name: '系统可用性', target: '99.9%' }
    ],
    architecture: [
      { layer: '用户界面层', desc: 'Web、App、微信、语音多渠道接入' },
      { layer: '应用层', desc: '对话管理、会话管理、用户管理、智能路由' },
      { layer: 'AI引擎层', desc: 'NLP、意图识别、实体提取、自然语言生成' },
      { layer: '知识库层', desc: '医学知识图谱、FAQ、文档检索' },
      { layer: '数据层', desc: '用户数据、对话日志、分析数据、模型训练数据' }
    ],
    phases: [
      { phase: '阶段1', name: 'MVP', desc: '核心FAQ + 症状检查，Web单渠道' },
      { phase: '阶段2', name: '增强智能', desc: '多轮对话 + 知识图谱 + 扩展领域' },
      { phase: '阶段3', name: '全面部署', desc: '多渠道 + 语音 + 高级分析 + 系统集成' },
      { phase: '阶段4', name: '持续优化', desc: '持续学习 + 个性化 + 预测能力' }
    ]
  });
});

router.get('/logs', roleMiddleware('student'), (req, res) => {
  const logs = db.prepare("SELECT * FROM student_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(req.user.id);
  res.json({ logs });
});

module.exports = router;
