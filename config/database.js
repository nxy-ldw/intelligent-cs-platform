const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.json');

let db = {
  users: [],
  classes: [],
  announcements: [],
  messages: [],
  settings: [],
  knowledge_base: [],
  student_logs: [],
  _seq: { users: 0, classes: 0, announcements: 0, messages: 0, knowledge_base: 0, student_logs: 0 }
};

function load() {
  if (fs.existsSync(dbPath)) {
    try {
      const raw = fs.readFileSync(dbPath, 'utf8');
      db = JSON.parse(raw);
      if (!db._seq) db._seq = { users: 0, classes: 0, announcements: 0, messages: 0, knowledge_base: 0, student_logs: 0 };
      if (!db.users) db.users = [];
      if (!db.classes) db.classes = [];
      if (!db.announcements) db.announcements = [];
      if (!db.messages) db.messages = [];
      if (!db.settings) db.settings = [];
      if (!db.knowledge_base) db.knowledge_base = [];
      if (!db.student_logs) db.student_logs = [];
    } catch (e) {
      console.error('Failed to load database, starting fresh:', e.message);
    }
  }
}

let saveTimer = null;
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 0), 'utf8');
    } catch (e) {
      console.error('Failed to save database:', e.message);
    }
  }, 100);
}

function saveNow() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 0), 'utf8');
  } catch (e) {
    console.error('Failed to save database:', e.message);
  }
}

load();

function nextId(table) {
  if (!db._seq[table]) db._seq[table] = 0;
  return ++db._seq[table];
}

function nowStr() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - offset);
  return local.toISOString().replace('T', ' ').substring(0, 19);
}

function where(table, conditions) {
  return db[table].filter(row => {
    for (const [key, val] of Object.entries(conditions)) {
      if (row[key] !== val) return false;
    }
    return true;
  });
}

function insert(table, data) {
  const row = { id: nextId(table), ...data, created_at: data.created_at || nowStr() };
  db[table].push(row);
  save();
  return row;
}

function update(table, conditions, updates) {
  let count = 0;
  for (const row of db[table]) {
    let match = true;
    for (const [key, val] of Object.entries(conditions)) {
      if (row[key] !== val) { match = false; break; }
    }
    if (match) {
      Object.assign(row, updates);
      count++;
    }
  }
  if (count > 0) save();
  return { changes: count };
}

function del(table, conditions) {
  const before = db[table].length;
  db[table] = db[table].filter(row => {
    for (const [key, val] of Object.entries(conditions)) {
      if (row[key] !== val) return true;
    }
    return false;
  });
  const changes = before - db[table].length;
  if (changes > 0) save();
  return { changes };
}

const dbWrapper = {
  prepare(sql) {
    return {
      get(...params) {
        return _execute(sql, params, 'get');
      },
      all(...params) {
        return _execute(sql, params, 'all');
      },
      run(...params) {
        return _execute(sql, params, 'run');
      }
    };
  },
  pragma() {},
  exec() {}
};

function _execute(sql, params, mode) {
  sql = sql.trim().replace(/\s+/g, ' ');

  if (sql.startsWith('SELECT COUNT(*) as c FROM')) {
    const tableMatch = sql.match(/FROM (\w+)/);
    if (!tableMatch) return mode === 'get' ? { c: 0 } : [];
    let table = tableMatch[1];

    let conditions = {};
    const whereMatch = sql.match(/WHERE (.+)/i);
    if (whereMatch) {
      conditions = _parseWhere(whereMatch[1], params);
    }
    const rows = where(table, conditions);
    const result = { c: rows.length };
    return mode === 'get' ? result : [result];
  }

  if (sql.startsWith('SELECT')) {
    const tableMatch = sql.match(/FROM (\w+)/);
    if (!tableMatch) return mode === 'get' ? null : [];
    let table = tableMatch[1];
    let rows = db[table] ? [...db[table]] : [];

    const whereMatch = sql.match(/WHERE (.+?)(?:ORDER BY|LIMIT|$)/i);
    if (whereMatch) {
      conditions = _parseWhere(whereMatch[1], params);
      rows = rows.filter(row => {
        for (const [key, val] of Object.entries(conditions)) {
          if (val && typeof val === 'object' && val.$in) {
            if (!val.$in.includes(row[key])) return false;
          } else if (val && typeof val === 'object' && val.$like) {
            const pattern = val.$like.replace(/%/g, '.*');
            if (!new RegExp(pattern, 'i').test(row[key] || '')) return false;
          } else {
            if (row[key] !== val) return false;
          }
        }
        return true;
      });
    }

    const orderMatch = sql.match(/ORDER BY (\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const col = orderMatch[1];
      const dir = (orderMatch[2] || 'ASC').toUpperCase();
      rows.sort((a, b) => {
        if (a[col] < b[col]) return dir === 'ASC' ? -1 : 1;
        if (a[col] > b[col]) return dir === 'ASC' ? 1 : -1;
        return 0;
      });
    }

    const limitMatch = sql.match(/LIMIT (\d+)/i);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1]);
      if (sql.match(/ORDER BY.*DESC/i)) {
        rows = rows.slice(0, limit).reverse();
      } else {
        rows = rows.slice(0, limit);
      }
    }

    if (mode === 'get') return rows[0] || null;
    return rows;
  }

  if (sql.startsWith('INSERT INTO')) {
    const tableMatch = sql.match(/INSERT INTO (\w+)/);
    if (!tableMatch) return { changes: 0 };
    const table = tableMatch[1];
    const row = {};
    const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/);
    if (colsMatch) {
      const cols = colsMatch[1].split(',').map(s => s.trim());
      cols.forEach((col, i) => {
        row[col] = params[i];
      });
    }
    insert(table, row);
    return { changes: 1, lastInsertRowid: row.id };
  }

  if (sql.startsWith('UPDATE')) {
    const tableMatch = sql.match(/UPDATE (\w+) SET/);
    if (!tableMatch) return { changes: 0 };
    const table = tableMatch[1];
    const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
    const whereMatch = sql.match(/WHERE\s+(.+)/i);

    if (!setMatch || !whereMatch) return { changes: 0 };
    const setParts = setMatch[1].split(',').map(s => s.trim());
    const updates = {};
    let paramIdx = 0;
    for (const part of setParts) {
      const [col] = part.split('=').map(s => s.trim());
      updates[col] = params[paramIdx++];
    }
    const conditions = _parseWhere(whereMatch[1], params.slice(paramIdx));
    return update(table, conditions, updates);
  }

  if (sql.startsWith('DELETE FROM')) {
    const tableMatch = sql.match(/DELETE FROM (\w+)/);
    if (!tableMatch) return { changes: 0 };
    const table = tableMatch[1];
    const whereMatch = sql.match(/WHERE\s+(.+)/i);
    if (!whereMatch) {
      const count = db[table].length;
      db[table] = [];
      save();
      return { changes: count };
    }
    const conditions = _parseWhere(whereMatch[1], params);
    return del(table, conditions);
  }

  return mode === 'get' ? null : [];
}

function _parseWhere(whereClause, params) {
  const conditions = {};
  let paramIdx = 0;
  let cleaned = whereClause.replace(/AND/gi, '§AND§').split('§');

  for (const part of cleaned) {
    const trimmed = part.trim().replace(/^AND\s+/i, '').trim();
    if (!trimmed) continue;

    const likeMatch = trimmed.match(/(\w+)\s+LIKE\s*\?/i);
    if (likeMatch) {
      conditions[likeMatch[1]] = { $like: params[paramIdx++] };
      continue;
    }

    const inMatch = trimmed.match(/(\w+)\s+IN\s+\(([^)]+)\)/i);
    if (inMatch) {
      const placeholders = inMatch[2].split(',').map(s => s.trim());
      const values = placeholders.map(() => params[paramIdx++]);
      conditions[inMatch[1]] = { $in: values };
      continue;
    }

    const eqMatch = trimmed.match(/(\w+)\s*=\s*\?/);
    if (eqMatch) {
      conditions[eqMatch[1]] = params[paramIdx++];
      continue;
    }
  }

  return conditions;
}

function ensureDefaultData() {
  const adminCount = db.users.filter(u => u.role === 'admin').length;
  if (adminCount === 0) {
    const admins = [
      { name: '陆楚航', pwd: 'lch12345600' },
      { name: '乔子煜', pwd: 'qzy12345600' },
      { name: '季彦熹', pwd: 'jyx12345600' }
    ];
    for (const a of admins) {
      const hash = bcrypt.hashSync(a.pwd, 10);
      db.users.push({
        id: nextId('users'),
        username: a.name,
        password: hash,
        role: 'admin',
        phone: '',
        qq: '',
        class_code: '',
        identity: '系统管理员',
        created_by: 'system',
        is_banned: 0,
        created_at: nowStr()
      });
    }
  }

  const maintenance = db.settings.find(s => s.key === 'maintenance_mode');
  if (!maintenance) {
    db.settings.push({ key: 'maintenance_mode', value: 'false' });
  }

  const kbCount = db.knowledge_base.length;
  if (kbCount === 0) {
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
    for (const kb of kbs) {
      db.knowledge_base.push({
        id: nextId('knowledge_base'),
        category: kb.cat,
        question: kb.q,
        answer: kb.a,
        keywords: kb.kw,
        created_at: nowStr()
      });
    }
  }

  saveNow();
}

ensureDefaultData();

module.exports = dbWrapper;
module.exports._raw = db;
module.exports._saveNow = saveNow;
