const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    phone TEXT DEFAULT '',
    qq TEXT DEFAULT '',
    class_code TEXT DEFAULT '',
    identity TEXT DEFAULT '',
    created_by TEXT DEFAULT 'system',
    is_banned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_code TEXT UNIQUE NOT NULL,
    class_name TEXT NOT NULL,
    teacher_id INTEGER NOT NULL,
    teacher_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (teacher_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    intent TEXT DEFAULT '',
    confidence REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS knowledge_base (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    keywords TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS student_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

function ensureDefaultData() {
  const bcrypt = require('bcryptjs');
  const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get();
  if (adminCount.c === 0) {
    const admins = [
      { name: '陆楚航', pwd: 'lch12345600' },
      { name: '乔子煜', pwd: 'qzy12345600' },
      { name: '季彦熹', pwd: 'jyx12345600' }
    ];
    const stmt = db.prepare("INSERT INTO users (username, password, role, identity) VALUES (?, ?, 'admin', '系统管理员')");
    for (const a of admins) {
      const hash = bcrypt.hashSync(a.pwd, 10);
      stmt.run(a.name, hash);
    }
  }

  const maintenance = db.prepare("SELECT value FROM settings WHERE key = 'maintenance_mode'").get();
  if (!maintenance) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('maintenance_mode', 'false')").run();
  }

  const kbCount = db.prepare("SELECT COUNT(*) as c FROM knowledge_base").get();
  if (kbCount.c === 0) {
    const kbs = [
      { cat: '系统介绍', q: '这个系统是做什么的', a: '本系统是一个智能客服系统教学平台，基于医学知识库的智能应答系统。包含意图识别、多轮对话、知识库问答、人机协同等核心功能。', kw: '系统,介绍,做什么,功能,是什么' },
      { cat: '系统介绍', q: '系统的核心功能有哪些', a: '核心功能包括：1.核心对话系统（意图识别、多轮对话、知识库问答）2.知识库管理 3.智能分配（人机协同）4.多渠道接入 5.数据分析与监控', kw: '核心,功能,有哪些,包括' },
      { cat: '对话系统', q: '如何进行意图识别', a: '意图识别通过自然语言处理技术，将用户输入分类为症状咨询、用药指导、预约挂号、报告解读等类别。系统使用关键词匹配和语义分析实现意图分类。', kw: '意图,识别,分类,自然语言' },
      { cat: '对话系统', q: '支持多轮对话吗', a: '是的，系统支持多轮对话。能够在连续对话中保持上下文，理解用户追问和补充信息，提供连贯的医疗服务咨询体验。', kw: '多轮,对话,上下文,追问' },
      { cat: '知识库', q: '知识库包含哪些内容', a: '知识库包含：疾病信息、症状描述、治疗方案、药物信息、科室信息、医生信息等。通过知识图谱建立症状-疾病-科室-医生的关联关系。', kw: '知识库,包含,内容,疾病,症状' },
      { cat: '知识库', q: '知识库如何维护', a: '知识库支持内容版本管理、审核工作流、定期更新机制。管理员可以添加、编辑、删除知识条目，确保医疗信息的准确性和时效性。', kw: '维护,更新,版本,审核' },
      { cat: '人机协同', q: '什么时候转人工', a: '系统在以下情况自动转人工：1.AI置信度低于阈值 2.检测到紧急/危重症状 3.用户主动要求人工服务 4.复杂案例需要专业判断。转接时保留完整对话上下文。', kw: '转人工,人工,转接,什么时候' },
      { cat: '性能指标', q: '系统的性能指标', a: '关键性能指标：响应时间<2秒，意图识别准确率≥95%，知识库回答准确率≥90%，用户满意度≥4.2/5，首次解决率≥85%，人工转接率≤15%，系统可用性99.9%。', kw: '性能,指标,响应时间,准确率,满意度' },
      { cat: '安全要求', q: '系统有哪些安全要求', a: '安全要求包括：数据加密传输、访问控制、审计日志、患者数据匿名化、隐私保护（知情同意、数据保留策略、删除权）等，符合医疗数据保护规范。', kw: '安全,要求,加密,隐私,保护' },
      { cat: '多渠道', q: '支持哪些接入渠道', a: '系统支持多渠道接入：Web聊天界面、移动应用、微信小程序、语音交互（ASR/TTS）。用户可通过多种方式访问智能客服服务。', kw: '渠道,接入,微信,小程序,语音,多渠道' },
      { cat: '架构设计', q: '系统架构是怎样的', a: '系统采用分层架构：用户界面层、应用层（对话管理/会话/用户管理/路由）、AI引擎层（NLP/意图识别/实体提取/NLG）、知识库层（知识图谱/FAQ/文档检索）、数据层（用户数据/对话日志/分析/训练数据）。', kw: '架构,分层,设计,引擎' },
      { cat: '项目管理', q: '项目的开发阶段', a: '开发分为四个阶段：阶段1-MVP（核心FAQ+症状检查，Web单渠道）阶段2-增强智能（多轮对话+知识图谱+扩展领域）阶段3-全面部署（多渠道+语音+高级分析+医院系统集成）阶段4-持续优化（持续学习+个性化+预测能力）', kw: '阶段,开发,计划,路线图' },
      { cat: '风险控制', q: '有哪些风险和应对措施', a: '主要风险：1.医疗准确性-AI提供错误建议→应对：专家审核循环+置信度阈值+免责声明 2.法规合规→法律审查+适应性合规框架 3.用户信任→透明AI披露+便捷人工接入 4.知识维护→自动更新提醒+专家审核周期', kw: '风险,应对,措施,控制' },
      { cat: '通用问答', q: '你好', a: '您好！我是智能客服助手，很高兴为您服务。您可以向我咨询关于系统功能、知识库、对话系统、人机协同等方面的问题。请问有什么可以帮您的？', kw: '你好,您好,hi,hello' },
      { cat: '通用问答', q: '谢谢', a: '不客气！如果您还有其他问题，随时可以向我咨询。祝您使用愉快！', kw: '谢谢,感谢,thanks' },
      { cat: '通用问答', q: '再见', a: '感谢您的使用，再见！如有需要随时回来咨询。', kw: '再见,拜拜,bye,goodbye' }
    ];
    const stmt = db.prepare("INSERT INTO knowledge_base (category, question, answer, keywords) VALUES (?, ?, ?, ?)");
    for (const kb of kbs) {
      stmt.run(kb.cat, kb.q, kb.a, kb.kw);
    }
  }
}

ensureDefaultData();

module.exports = db;
