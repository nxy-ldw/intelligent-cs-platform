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
  settings: [],
  student_logs: [],
  knowledge_points: [],
  questions: [],
  tasks: [],
  task_questions: [],
  answers: [],
  wrong_questions: [],
  diagnosis_reports: [],
  notifications: [],
  operation_logs: [],
  admin_logs: [],
  system_config: [],
  _seq: {
    users: 0, classes: 0, announcements: 0, student_logs: 0,
    knowledge_points: 0, questions: 0, tasks: 0, task_questions: 0,
    answers: 0, wrong_questions: 0, diagnosis_reports: 0,
    notifications: 0, operation_logs: 0, admin_logs: 0,
    system_config: 0
  }
};

function load() {
  if (fs.existsSync(dbPath)) {
    try {
      const raw = fs.readFileSync(dbPath, 'utf8');
      db = JSON.parse(raw);
      const defaults = ['users', 'classes', 'announcements', 'settings', 'student_logs',
        'knowledge_points', 'questions', 'tasks', 'task_questions', 'answers',
        'wrong_questions', 'diagnosis_reports', 'notifications', 'operation_logs',
        'admin_logs', 'system_config'];
      for (const t of defaults) { if (!db[t]) db[t] = []; }
      if (!db._seq) {
        db._seq = {};
        for (const t of defaults) db._seq[t] = 0;
      }
    } catch (e) {
      console.error('Failed to load database, starting fresh:', e.message);
    }
  }
}

let saveTimer = null;
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(dbPath, JSON.stringify(db, null, 0), 'utf8'); }
    catch (e) { console.error('Failed to save database:', e.message); }
  }, 100);
}

function saveNow() {
  try { fs.writeFileSync(dbPath, JSON.stringify(db, null, 0), 'utf8'); }
  catch (e) { console.error('Failed to save database:', e.message); }
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
      if (val && typeof val === 'object' && val.$in) {
        if (!val.$in.includes(row[key])) return false;
      } else if (val && typeof val === 'object' && val.$like) {
        const pattern = val.$like.replace(/%/g, '.*').replace(/\?/g, '.');
        if (!new RegExp(pattern, 'i').test(String(row[key] || ''))) return false;
      } else {
        if (row[key] !== val) return false;
      }
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
    if (match) { Object.assign(row, updates); count++; }
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
      get(...params) { return _execute(sql, params, 'get'); },
      all(...params) { return _execute(sql, params, 'all'); },
      run(...params) { return _execute(sql, params, 'run'); }
    };
  },
  pragma() {},
  exec() {}
};

function _execute(sql, params, mode) {
  sql = sql.trim().replace(/\s+/g, ' ');

  if (sql.startsWith('SELECT COUNT(*)')) {
    const tableMatch = sql.match(/FROM (\w+)/);
    if (!tableMatch) return mode === 'get' ? { c: 0 } : [];
    let table = tableMatch[1];
    let conditions = {};
    const whereMatch = sql.match(/WHERE (.+)/i);
    if (whereMatch) conditions = _parseWhere(whereMatch[1], params);
    const rows = where(table, conditions);
    return mode === 'get' ? { c: rows.length } : [{ c: rows.length }];
  }

  if (sql.startsWith('SELECT')) {
    const tableMatch = sql.match(/FROM (\w+)/);
    if (!tableMatch) return mode === 'get' ? null : [];
    let table = tableMatch[1];
    let rows = db[table] ? [...db[table]] : [];

    const whereMatch = sql.match(/WHERE (.+?)(?:ORDER BY|LIMIT|OFFSET|$)/i);
    if (whereMatch) {
      const conditions = _parseWhere(whereMatch[1], params);
      rows = rows.filter(row => {
        for (const [key, val] of Object.entries(conditions)) {
          if (val && typeof val === 'object' && val.$in) {
            if (!val.$in.includes(row[key])) return false;
          } else if (val && typeof val === 'object' && val.$like) {
            const pattern = val.$like.replace(/%/g, '.*');
            if (!new RegExp(pattern, 'i').test(String(row[key] || ''))) return false;
          } else {
            if (row[key] !== val) return false;
          }
        }
        return true;
      });
    }

    const orderMatch = sql.match(/ORDER BY (.+?)(?:LIMIT|OFFSET|$)/i);
    if (orderMatch) {
      const parts = orderMatch[1].split(',').map(s => s.trim());
      rows.sort((a, b) => {
        for (const part of parts) {
          const [col, dir = 'ASC'] = part.split(/\s+/);
          if (a[col] < b[col]) return dir.toUpperCase() === 'ASC' ? -1 : 1;
          if (a[col] > b[col]) return dir.toUpperCase() === 'ASC' ? 1 : -1;
        }
        return 0;
      });
    }

    const offsetMatch = sql.match(/OFFSET (\d+)/i);
    if (offsetMatch) {
      const offset = parseInt(offsetMatch[1]);
      rows = rows.slice(offset);
    }

    const limitMatch = sql.match(/LIMIT (\d+)/i);
    if (limitMatch) {
      rows = rows.slice(0, parseInt(limitMatch[1]));
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
      cols.forEach((col, i) => { row[col] = params[i]; });
    }
    const result = insert(table, row);
    return { changes: 1, lastInsertRowid: result.id };
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
  const parts = whereClause.split(/\s+AND\s+/i);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const likeMatch = trimmed.match(/(\w+)\s+LIKE\s*\?/i);
    if (likeMatch) {
      conditions[likeMatch[1]] = { $like: params[paramIdx++] };
      continue;
    }

    const inMatch = trimmed.match(/(\w+)\s+IN\s*\(([?,]+)\)/i);
    if (inMatch) {
      const count = inMatch[2].split(',').length;
      const values = [];
      for (let i = 0; i < count; i++) values.push(params[paramIdx++]);
      conditions[inMatch[1]] = { $in: values };
      continue;
    }

    const eqMatch = trimmed.match(/(\w+)\s*=\s*\?/);
    if (eqMatch) {
      conditions[eqMatch[1]] = params[paramIdx++];
      continue;
    }

    const gtMatch = trimmed.match(/(\w+)\s*>\s*\?/);
    if (gtMatch) {
      const val = params[paramIdx++];
      conditions['_gt_' + gtMatch[1]] = val;
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
  if (!maintenance) db.settings.push({ key: 'maintenance_mode', value: 'false' });

  if (!db.settings.find(s => s.key === 'ai_config')) {
    db.settings.push({
      key: 'ai_config',
      value: JSON.stringify({
        contextLength: 20,
        safetyFilter: true,
        adaptiveDifficulty: true,
        autoGenerateReport: true
      })
    });
  }

  if (db.knowledge_points.length === 0) {
    const points = [
      { name: '函数基础', subject: '数学', difficulty: 1, prerequisites: '', description: '函数的定义、定义域、值域' },
      { name: '一次函数', subject: '数学', difficulty: 2, prerequisites: '函数基础', description: '一次函数的图像与性质' },
      { name: '二次函数', subject: '数学', difficulty: 3, prerequisites: '一次函数', description: '二次函数的图像、性质、应用' },
      { name: '指数函数', subject: '数学', difficulty: 3, prerequisites: '函数基础', description: '指数函数的概念与性质' },
      { name: '对数函数', subject: '数学', difficulty: 3, prerequisites: '指数函数', description: '对数函数的概念与性质' },
      { name: '三角函数', subject: '数学', difficulty: 3, prerequisites: '函数基础', description: '正弦、余弦、正切函数' },
      { name: '数列', subject: '数学', difficulty: 3, prerequisites: '函数基础', description: '等差数列、等比数列' },
      { name: '不等式', subject: '数学', difficulty: 2, prerequisites: '函数基础', description: '基本不等式、线性规划' },
      { name: '立体几何', subject: '数学', difficulty: 3, prerequisites: '', description: '空间几何体、点线面关系' },
      { name: '解析几何', subject: '数学', difficulty: 4, prerequisites: '二次函数,三角函数', description: '圆锥曲线、直线与圆' },
      { name: '导数', subject: '数学', difficulty: 4, prerequisites: '函数基础', description: '导数的概念与运算' },
      { name: '积分', subject: '数学', difficulty: 4, prerequisites: '导数', description: '定积分与不定积分' },
      { name: '概率统计', subject: '数学', difficulty: 2, prerequisites: '', description: '概率、统计、排列组合' },
      { name: '向量', subject: '数学', difficulty: 2, prerequisites: '', description: '平面向量与空间向量' },
      { name: '集合与逻辑', subject: '数学', difficulty: 1, prerequisites: '', description: '集合运算、命题、充要条件' }
    ];
    for (const p of points) {
      db.knowledge_points.push({
        id: nextId('knowledge_points'),
        ...p,
        created_at: nowStr()
      });
    }
  }

  if (db.questions.length === 0) {
    const questions = [
      {
        kp_id: 1, kp_name: '函数基础', difficulty: 1, type: 'single',
        question: '函数 f(x) = √(x-1) 的定义域是？',
        options: JSON.stringify(['A. x ≥ 1', 'B. x > 1', 'C. x ≥ 0', 'D. x > 0']),
        answer: 'A',
        analysis: '根号下的表达式必须大于等于0，即 x-1 ≥ 0，解得 x ≥ 1。'
      },
      {
        kp_id: 1, kp_name: '函数基础', difficulty: 1, type: 'single',
        question: '下列哪个是函数？',
        options: JSON.stringify(['A. y² = x', 'B. y = x²', 'C. x² + y² = 1', 'D. |y| = x']),
        answer: 'B',
        analysis: '函数要求对于每个x值，有唯一确定的y值与之对应。只有y = x²满足这个条件。'
      },
      {
        kp_id: 2, kp_name: '一次函数', difficulty: 2, type: 'single',
        question: '一次函数 y = 2x + 3 的斜率是？',
        options: JSON.stringify(['A. 2', 'B. 3', 'C. -2', 'D. -3']),
        answer: 'A',
        analysis: '一次函数的标准形式为 y = kx + b，其中 k 为斜率，b 为截距。所以斜率 k = 2。'
      },
      {
        kp_id: 2, kp_name: '一次函数', difficulty: 2, type: 'single',
        question: '直线 y = -x + 2 经过哪几个象限？',
        options: JSON.stringify(['A. 一、二、三', 'B. 一、二、四', 'C. 一、三、四', 'D. 二、三、四']),
        answer: 'B',
        analysis: '斜率 k = -1 < 0，截距 b = 2 > 0，直线经过一、二、四象限。'
      },
      {
        kp_id: 3, kp_name: '二次函数', difficulty: 3, type: 'single',
        question: '二次函数 y = x² - 4x + 3 的顶点坐标是？',
        options: JSON.stringify(['A. (2, -1)', 'B. (2, 1)', 'C. (-2, -1)', 'D. (-2, 1)']),
        answer: 'A',
        analysis: '配方得 y = (x-2)² - 1，顶点坐标为 (2, -1)。顶点公式：(-b/2a, f(-b/2a))。'
      },
      {
        kp_id: 3, kp_name: '二次函数', difficulty: 3, type: 'single',
        question: '方程 x² - 5x + 6 = 0 的两根分别是？',
        options: JSON.stringify(['A. 2和3', 'B. -2和-3', 'C. 1和6', 'D. -1和-6']),
        answer: 'A',
        analysis: '因式分解：(x-2)(x-3) = 0，解得 x = 2 或 x = 3。也可用求根公式验证。'
      },
      {
        kp_id: 3, kp_name: '二次函数', difficulty: 3, type: 'single',
        question: '二次函数 y = -x² + 2x + 3 的最大值是？',
        options: JSON.stringify(['A. 3', 'B. 4', 'C. 2', 'D. 5']),
        answer: 'B',
        analysis: '配方得 y = -(x-1)² + 4，开口向下，顶点为最大值点，最大值为 4。'
      },
      {
        kp_id: 4, kp_name: '指数函数', difficulty: 3, type: 'single',
        question: '若 2^x = 8，则 x = ?',
        options: JSON.stringify(['A. 2', 'B. 3', 'C. 4', 'D. 8']),
        answer: 'B',
        analysis: '8 = 2³，所以 2^x = 2³，x = 3。'
      },
      {
        kp_id: 4, kp_name: '指数函数', difficulty: 3, type: 'single',
        question: '函数 y = 2^(-x) 的图像是？',
        options: JSON.stringify(['A. 递增', 'B. 递减', 'C. 先增后减', 'D. 先减后增']),
        answer: 'B',
        analysis: 'y = 2^(-x) = (1/2)^x，底数 1/2 在 (0,1) 之间，所以是递减函数。'
      },
      {
        kp_id: 5, kp_name: '对数函数', difficulty: 3, type: 'single',
        question: 'log₂8 = ?',
        options: JSON.stringify(['A. 2', 'B. 3', 'C. 4', 'D. 8']),
        answer: 'B',
        analysis: '设 log₂8 = x，则 2^x = 8 = 2³，所以 x = 3。'
      },
      {
        kp_id: 5, kp_name: '对数函数', difficulty: 3, type: 'single',
        question: 'lg100 = ?',
        options: JSON.stringify(['A. 1', 'B. 2', 'C. 10', 'D. 100']),
        answer: 'B',
        analysis: 'lg 是以 10 为底的对数，lg100 = log₁₀100 = 2，因为 10² = 100。'
      },
      {
        kp_id: 6, kp_name: '三角函数', difficulty: 3, type: 'single',
        question: 'sin30° = ?',
        options: JSON.stringify(['A. 1/2', 'B. √2/2', 'C. √3/2', 'D. 1']),
        answer: 'A',
        analysis: 'sin30° = 1/2 是特殊角的三角函数值，需要记住。'
      },
      {
        kp_id: 6, kp_name: '三角函数', difficulty: 3, type: 'single',
        question: 'cos60° = ?',
        options: JSON.stringify(['A. 1/2', 'B. √2/2', 'C. √3/2', 'D. 1']),
        answer: 'A',
        analysis: 'cos60° = 1/2 是特殊角的三角函数值。'
      },
      {
        kp_id: 7, kp_name: '数列', difficulty: 3, type: 'single',
        question: '等差数列 2, 5, 8, 11, ... 的第10项是？',
        options: JSON.stringify(['A. 29', 'B. 32', 'C. 26', 'D. 35']),
        answer: 'A',
        analysis: '首项 a₁ = 2，公差 d = 3。aₙ = a₁ + (n-1)d = 2 + 9×3 = 29。'
      },
      {
        kp_id: 7, kp_name: '数列', difficulty: 3, type: 'single',
        question: '等比数列 1, 2, 4, 8, ... 的公比是？',
        options: JSON.stringify(['A. 1', 'B. 2', 'C. 3', 'D. 4']),
        answer: 'B',
        analysis: '公比 q = a₂/a₁ = 2/1 = 2。'
      },
      {
        kp_id: 8, kp_name: '不等式', difficulty: 2, type: 'single',
        question: '若 a > 0，b > 0，则 a + b ≥ 2√(ab) 等号成立条件是？',
        options: JSON.stringify(['A. a = b', 'B. a > b', 'C. a < b', 'D. ab = 1']),
        answer: 'A',
        analysis: '基本不等式 a + b ≥ 2√(ab)，等号成立当且仅当 a = b。'
      },
      {
        kp_id: 9, kp_name: '立体几何', difficulty: 3, type: 'single',
        question: '正方体的体对角线长与棱长的比是？',
        options: JSON.stringify(['A. √2', 'B. √3', 'C. 2', 'D. 3']),
        answer: 'B',
        analysis: '设棱长为 a，则面对角线为 a√2，体对角线为 √(a² + 2a²) = a√3。比值为 √3。'
      },
      {
        kp_id: 10, kp_name: '解析几何', difficulty: 4, type: 'single',
        question: '椭圆 x²/9 + y²/4 = 1 的离心率是？',
        options: JSON.stringify(['A. √5/3', 'B. 2/3', 'C. √5/2', 'D. 3/5']),
        answer: 'A',
        analysis: 'a² = 9, b² = 4, c² = a² - b² = 5, c = √5。离心率 e = c/a = √5/3。'
      },
      {
        kp_id: 11, kp_name: '导数', difficulty: 4, type: 'single',
        question: '函数 f(x) = x³ 的导数 f\'(x) = ?',
        options: JSON.stringify(['A. 3x²', 'B. x²', 'C. 3x', 'D. x³']),
        answer: 'A',
        analysis: '幂函数求导公式：(xⁿ)\' = nxⁿ⁻¹。(x³)\' = 3x²。'
      },
      {
        kp_id: 13, kp_name: '概率统计', difficulty: 2, type: 'single',
        question: '掷一枚均匀硬币，正面朝上的概率是？',
        options: JSON.stringify(['A. 1/4', 'B. 1/3', 'C. 1/2', 'D. 1']),
        answer: 'C',
        analysis: '均匀硬币有两个等可能结果，正面朝上是其中一种，概率为 1/2。'
      },
      {
        kp_id: 14, kp_name: '向量', difficulty: 2, type: 'single',
        question: '向量 a = (1, 2) 的模是？',
        options: JSON.stringify(['A. 3', 'B. √5', 'C. 5', 'D. √3']),
        answer: 'B',
        analysis: '向量的模 |a| = √(x² + y²) = √(1 + 4) = √5。'
      },
      {
        kp_id: 15, kp_name: '集合与逻辑', difficulty: 1, type: 'single',
        question: '集合 A = {1,2,3}，B = {2,3,4}，A ∩ B = ?',
        options: JSON.stringify(['A. {1,2,3,4}', 'B. {2,3}', 'C. {1,4}', 'D. {1,2,3}']),
        answer: 'B',
        analysis: '交集是两个集合共有的元素，A 和 B 共有的元素是 2 和 3。'
      }
    ];
    for (const q of questions) {
      db.questions.push({
        id: nextId('questions'),
        ...q,
        created_by: 'system',
        created_at: nowStr()
      });
    }
  }

  saveNow();
}

function ensureSystemConfig() {
  if (db.system_config.length === 0) {
    db.system_config.push({
      id: 1,
      ai_model: 'gpt-4o-mini',
      api_base: '',
      api_key: '',
      context_length: 4000,
      safety_filter: 1,
      welcome_message: '欢迎使用AI个性化学习诊断辅导系统！'
    });
    saveNow();
  }
}

ensureSystemConfig();
ensureDefaultData();

module.exports = dbWrapper;
module.exports._raw = db;
module.exports._saveNow = saveNow;
module.exports._nowStr = nowStr;
module.exports._insert = insert;
module.exports._update = update;
module.exports._delete = del;
module.exports._where = where;
module.exports._nextId = nextId;
