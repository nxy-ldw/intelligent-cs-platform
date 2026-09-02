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
  chat_groups: [],
  chat_members: [],
  chat_messages: [],
  chat_settings: [],
  chat_announcements: [],
  _seq: {
    users: 0, classes: 0, announcements: 0, student_logs: 0,
    knowledge_points: 0, questions: 0, tasks: 0, task_questions: 0,
    answers: 0, wrong_questions: 0, diagnosis_reports: 0,
    notifications: 0, operation_logs: 0, admin_logs: 0,
    system_config: 0, chat_groups: 0, chat_members: 0,
    chat_messages: 0, chat_settings: 0, chat_announcements: 0
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
  exec() {},
  joinRows(rows1, rows2, key1, key2, fields) {
    return rows1.map(r1 => {
      const r2 = rows2.find(x => x[key2] === r1[key1]);
      if (r2 && fields) {
        const merged = { ...r1 };
        for (const f of fields) { if (r2[f] !== undefined) merged[f] = r2[f]; }
        return merged;
      }
      return r2 ? { ...r1, ...r2 } : r1;
    });
  },
  countDistinct(table, distinctCol, conditions) {
    const rows = where(table, conditions || {});
    const set = new Set(rows.map(r => r[distinctCol]));
    return set.size;
  },
  updateCalc(table, conditions, col, delta) {
    for (const row of db[table]) {
      let match = true;
      for (const [k, v] of Object.entries(conditions)) {
        if (row[k] !== v) { match = false; break; }
      }
      if (match) {
        row[col] = (row[col] || 0) + delta;
      }
    }
    save();
    return { changes: 1 };
  }
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

  var extraQuestions = [
    { kp_id: 1, kp_name: '一元一次方程', subject: '数学', difficulty: 1, type: 'fill',
      question: '若 3x + 2 = 11，则 x = ____',
      options: '[]', answer: '3',
      analysis: '3x = 11 - 2 = 9，x = 3。' },
    { kp_id: 1, kp_name: '一元一次方程', subject: '数学', difficulty: 2, type: 'judge',
      question: '方程 2x - 6 = 0 的解是 x = 3。',
      options: '[]', answer: '正确',
      analysis: '2x = 6，x = 3，判断正确。' },
    { kp_id: 2, kp_name: '二元一次方程组', subject: '数学', difficulty: 2, type: 'single',
      question: '方程组 x + y = 5, x - y = 1 的解是？',
      options: JSON.stringify(['A. x=3, y=2', 'B. x=2, y=3', 'C. x=4, y=1', 'D. x=1, y=4']),
      answer: 'A',
      analysis: '两式相加得 2x = 6，x = 3；代入得 y = 2。' },
    { kp_id: 2, kp_name: '二元一次方程组', subject: '数学', difficulty: 3, type: 'multi',
      question: '下列哪些是方程组 2x + y = 7, x - y = 2 的解？',
      options: JSON.stringify(['A. x=3, y=1', 'B. x=1, y=5', 'C. x=3, y=2（近似）', 'D. 以上都不是']),
      answer: 'A',
      analysis: '两式相加得 3x = 9，x = 3；代入 y = 7-6 = 1。' },
    { kp_id: 3, kp_name: '一元二次方程', subject: '数学', difficulty: 3, type: 'single',
      question: '方程 x² - 5x + 6 = 0 的解是？',
      options: JSON.stringify(['A. x=2 或 x=3', 'B. x=1 或 x=6', 'C. x=-2 或 x=-3', 'D. x=5 或 x=1']),
      answer: 'A',
      analysis: '因式分解 (x-2)(x-3) = 0，所以 x=2 或 x=3。' },
    { kp_id: 3, kp_name: '一元二次方程', subject: '数学', difficulty: 4, type: 'single',
      question: '方程 2x² + 3x - 2 = 0 的判别式值为？',
      options: JSON.stringify(['A. 25', 'B. 9', 'C. -7', 'D. 0']),
      answer: 'A',
      analysis: 'Δ = b² - 4ac = 9 + 16 = 25 > 0，有两个不等实根。' },
    { kp_id: 4, kp_name: '二次函数', subject: '数学', difficulty: 3, type: 'single',
      question: '函数 y = x² + 2x - 3 的顶点坐标是？',
      options: JSON.stringify(['A. (-1, -4)', 'B. (1, 0)', 'C. (-1, 4)', 'D. (1, -4)']),
      answer: 'A',
      analysis: 'x = -b/(2a) = -1，y = 1 - 2 - 3 = -4。顶点 (-1, -4)。' },
    { kp_id: 5, kp_name: '指数函数', subject: '数学', difficulty: 2, type: 'single',
      question: '2³ × 2² = ?',
      options: JSON.stringify(['A. 32', 'B. 16', 'C. 64', 'D. 8']),
      answer: 'A',
      analysis: '同底数幂相乘，指数相加：2³⁺² = 2⁵ = 32。' },
    { kp_id: 5, kp_name: '对数函数', subject: '数学', difficulty: 3, type: 'single',
      question: 'log₂8 = ?',
      options: JSON.stringify(['A. 2', 'B. 3', 'C. 4', 'D. 8']),
      answer: 'B',
      analysis: '2³ = 8，所以 log₂8 = 3。' },
    { kp_id: 6, kp_name: '三角函数', subject: '数学', difficulty: 3, type: 'single',
      question: 'tan45° = ?',
      options: JSON.stringify(['A. 1/2', 'B. 1', 'C. √3', 'D. √3/3']),
      answer: 'B',
      analysis: 'tan45° = sin45°/cos45° = 1。' },
    { kp_id: 6, kp_name: '三角函数', subject: '数学', difficulty: 4, type: 'single',
      question: 'sin²θ + cos²θ = ?',
      options: JSON.stringify(['A. 0', 'B. 1', 'C. 2', 'D. θ']),
      answer: 'B',
      analysis: '这是三角恒等式，对任意角 θ 都成立。' },
    { kp_id: 7, kp_name: '数列', subject: '数学', difficulty: 3, type: 'fill',
      question: '等差数列前n项和公式 Sn = n(a₁ + aₙ)/2。若 a₁=1, d=2, 求 S₁₀ = ____',
      options: '[]', answer: '100',
      analysis: 'a₁₀ = 1 + 9×2 = 19，S₁₀ = 10(1+19)/2 = 100。' },
    { kp_id: 7, kp_name: '数列', subject: '数学', difficulty: 4, type: 'single',
      question: '等比数列 1, 3, 9, 27, ... 前5项的和是？',
      options: JSON.stringify(['A. 81', 'B. 121', 'C. 243', 'D. 363']),
      answer: 'B',
      analysis: 'S₅ = 1(1-3⁵)/(1-3) = (1-243)/(-2) = 121。' },
    { kp_id: 8, kp_name: '不等式', subject: '数学', difficulty: 2, type: 'single',
      question: '不等式 2x - 6 < 0 的解集是？',
      options: JSON.stringify(['A. x < 3', 'B. x > 3', 'C. x < -3', 'D. x > -3']),
      answer: 'A',
      analysis: '2x < 6，x < 3。' },
    { kp_id: 9, kp_name: '立体几何', subject: '数学', difficulty: 3, type: 'single',
      question: '圆柱底面半径为2，高为5，体积为？',
      options: JSON.stringify(['A. 10π', 'B. 20π', 'C. 15π', 'D. 25π']),
      answer: 'B',
      analysis: 'V = πr²h = π × 4 × 5 = 20π。' },
    { kp_id: 10, kp_name: '解析几何', subject: '数学', difficulty: 3, type: 'single',
      question: '过点 (1, 2) 和 (3, 6) 的直线斜率是？',
      options: JSON.stringify(['A. 1', 'B. 2', 'C. 3', 'D. 4']),
      answer: 'B',
      analysis: 'k = (6-2)/(3-1) = 4/2 = 2。' },
    { kp_id: 11, kp_name: '导数', subject: '数学', difficulty: 3, type: 'single',
      question: '函数 f(x) = sin(x) 的导数是？',
      options: JSON.stringify(['A. cos(x)', 'B. -cos(x)', 'C. -sin(x)', 'D. tan(x)']),
      answer: 'A',
      analysis: 'sin(x) 的导数是 cos(x)，这是基本导数公式。' },
    { kp_id: 13, kp_name: '概率统计', subject: '数学', difficulty: 2, type: 'single',
      question: '从5个球中任取2个，共有多少种取法？',
      options: JSON.stringify(['A. 5', 'B. 10', 'C. 20', 'D. 25']),
      answer: 'B',
      analysis: 'C(5,2) = 5!/(2!×3!) = 10。' },
    { kp_id: 14, kp_name: '向量', subject: '数学', difficulty: 3, type: 'single',
      question: '向量 a=(1,0), b=(0,1)，a·b = ?',
      options: JSON.stringify(['A. 1', 'B. 0', 'C. -1', 'D. 2']),
      answer: 'B',
      analysis: '点积 a·b = 1×0 + 0×1 = 0，两向量垂直。' },
    { kp_id: 15, kp_name: '集合与逻辑', subject: '数学', difficulty: 1, type: 'judge',
      question: '空集是任何集合的子集。',
      options: '[]', answer: '正确',
      analysis: '空集 ∅ 是任何集合的子集，这是集合论的基本性质。' },

    { kp_id: 1, kp_name: '一元一次方程', subject: '数学', difficulty: 2, type: 'single',
      question: '小明买了3本笔记本和2支笔共花了18元，每支笔3元，每本笔记本多少元？',
      options: JSON.stringify(['A. 3元', 'B. 4元', 'C. 5元', 'D. 6元']),
      answer: 'B',
      analysis: '设笔记本x元，3x + 6 = 18，x = 4。' },
    { kp_id: 3, kp_name: '一元二次方程', subject: '数学', difficulty: 2, type: 'fill',
      question: '方程 x² = 9 的解是 x = ____',
      options: '[]', answer: '±3',
      analysis: 'x² = 9，x = ±3。注意有两个解。' },
    { kp_id: 4, kp_name: '二次函数', subject: '数学', difficulty: 4, type: 'single',
      question: '函数 y = -x² + 4x - 3 的最大值是？',
      options: JSON.stringify(['A. 1', 'B. 2', 'C. 3', 'D. 4']),
      answer: 'A',
      analysis: '开口向下，顶点 x=2，y = -4+8-3 = 1，最大值为1。' },
    { kp_id: 6, kp_name: '三角函数', subject: '数学', difficulty: 4, type: 'single',
      question: '在△ABC中，若∠C=90°, a=3, b=4，则 sinA = ?',
      options: JSON.stringify(['A. 3/5', 'B. 4/5', 'C. 3/4', 'D. 5/3']),
      answer: 'A',
      analysis: 'c = √(9+16) = 5，sinA = a/c = 3/5。' },
    { kp_id: 9, kp_name: '立体几何', subject: '数学', difficulty: 4, type: 'single',
      question: '圆锥底面半径3，高4，母线长为？',
      options: JSON.stringify(['A. 3', 'B. 4', 'C. 5', 'D. 7']),
      answer: 'C',
      analysis: '母线 l = √(r²+h²) = √(9+16) = 5。' },
    { kp_id: 11, kp_name: '导数', subject: '数学', difficulty: 4, type: 'single',
      question: '函数 f(x) = e^x 的导数是？',
      options: JSON.stringify(['A. e^x', 'B. x·e^x', 'C. 1/e^x', 'D. ln(x)']),
      answer: 'A',
      analysis: 'e^x 的导数是 e^x 自身，这是指数函数的特殊性质。' },
    { kp_id: 13, kp_name: '概率统计', subject: '数学', difficulty: 3, type: 'single',
      question: '一个袋子中有3红2白共5个球，随机取一球是红球的概率？',
      options: JSON.stringify(['A. 2/5', 'B. 3/5', 'C. 1/2', 'D. 1/5']),
      answer: 'B',
      analysis: 'P(红) = 3/5。' },
    { kp_id: 14, kp_name: '向量', subject: '数学', difficulty: 4, type: 'single',
      question: '向量 a=(2,3), b=(4,-1)，a·b = ?',
      options: JSON.stringify(['A. 5', 'B. 7', 'C. 11', 'D. -3']),
      answer: 'A',
      analysis: 'a·b = 2×4 + 3×(-1) = 8-3 = 5。' },

    { kp_id: 1, kp_name: '物理-力学', subject: '物理', difficulty: 2, type: 'single',
      question: '牛顿第二定律的表达式是？',
      options: JSON.stringify(['A. F = ma', 'B. F = mv', 'C. F = m/a', 'D. F = a/m']),
      answer: 'A',
      analysis: '牛顿第二定律：力等于质量乘以加速度 F = ma。' },
    { kp_id: 2, kp_name: '物理-电学', subject: '物理', difficulty: 3, type: 'single',
      question: '欧姆定律的公式是？',
      options: JSON.stringify(['A. U = IR', 'B. U = I/R', 'C. U = R/I', 'D. I = UR']),
      answer: 'A',
      analysis: '欧姆定律：电压等于电流乘以电阻 U = IR。' },
    { kp_id: 3, kp_name: '物理-运动学', subject: '物理', difficulty: 2, type: 'single',
      question: '匀加速直线运动中，速度公式 v = ?',
      options: JSON.stringify(['A. v₀ + at', 'B. v₀ - at', 'C. v₀/a + t', 'D. at - v₀']),
      answer: 'A',
      analysis: '初速度 v₀，加速度 a，时间 t，则 v = v₀ + at。' },
    { kp_id: 4, kp_name: '物理-能量', subject: '物理', difficulty: 3, type: 'single',
      question: '动能的表达式是？',
      options: JSON.stringify(['A. ½mv²', 'B. mv²', 'C. ½mv', 'D. mv']),
      answer: 'A',
      analysis: '动能 Ek = ½mv²，m为质量，v为速度。' },
    { kp_id: 5, kp_name: '物理-光学', subject: '物理', difficulty: 2, type: 'judge',
      question: '光在真空中传播速度约为 3×10⁸ m/s。',
      options: '[]', answer: '正确',
      analysis: '光在真空中的速度 c ≈ 3×10⁸ m/s，这是物理学基本常数。' },

    { kp_id: 1, kp_name: '语文-文言文', subject: '语文', difficulty: 2, type: 'single',
      question: '"学而时习之"出自下列哪部典籍？',
      options: JSON.stringify(['A. 《论语》', 'B. 《孟子》', 'C. 《大学》', 'D. 《中庸》']),
      answer: 'A',
      analysis: '"学而时习之，不亦说乎"出自《论语·学而》篇。' },
    { kp_id: 2, kp_name: '语文-古诗', subject: '语文', difficulty: 2, type: 'single',
      question: '"床前明月光"的作者是？',
      options: JSON.stringify(['A. 李白', 'B. 杜甫', 'C. 白居易', 'D. 王维']),
      answer: 'A',
      analysis: '《静夜思》作者李白，是中国最著名的古诗之一。' },
    { kp_id: 3, kp_name: '语文-修辞', subject: '语文', difficulty: 2, type: 'single',
      question: '"飞流直下三千尺"使用了什么修辞手法？',
      options: JSON.stringify(['A. 夸张', 'B. 比喻', 'C. 拟人', 'D. 排比']),
      answer: 'A',
      analysis: '"三千尺"是夸张手法，突出瀑布的壮观。' },

    { kp_id: 1, kp_name: '英语-语法', subject: '英语', difficulty: 2, type: 'single',
      question: 'Choose the correct form: "He ___ to school every day."',
      options: JSON.stringify(['A. go', 'B. goes', 'C. going', 'D. gone']),
      answer: 'B',
      analysis: '第三人称单数，一般现在时动词加es：goes。' },
    { kp_id: 2, kp_name: '英语-词汇', subject: '英语', difficulty: 1, type: 'single',
      question: 'What is the opposite of "happy"?',
      options: JSON.stringify(['A. sad', 'B. angry', 'C. tired', 'D. busy']),
      answer: 'A',
      analysis: 'happy（快乐）的反义词是 sad（悲伤）。' },
    { kp_id: 3, kp_name: '英语-时态', subject: '英语', difficulty: 3, type: 'single',
      question: 'Which tense: "I have finished my homework."',
      options: JSON.stringify(['A. Present Perfect', 'B. Past Simple', 'C. Future', 'D. Present']),
      answer: 'A',
      analysis: 'have + 过去分词表示现在完成时。' },
    { kp_id: 4, kp_name: '英语-语法', subject: '英语', difficulty: 3, type: 'fill',
      question: 'Fill in: "If I ___ rich, I would travel the world." (be 的过去式)',
      options: '[]', answer: 'were',
      analysis: '虚拟语气中，be动词用were形式。' }
  ];

  for (const q of extraQuestions) {
    var exists = db.questions.some(function(eq) { return eq.question === q.question; });
    if (!exists) {
      db.questions.push({
        id: nextId('questions'),
        ...q,
        source: 'BUILTIN',
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
      welcome_message: '欢迎使用AI个性化学习诊断辅导系统！',
      cnki_api_key: '',
      xkw_api_key: '',
      zyb_api_key: ''
    });
    saveNow();
  }
}

try {
  ensureSystemConfig();
  ensureDefaultData();
  try {
    var gen = require('../services/questionGenerator');
    var result = gen.populateDatabase(1000, { _raw: db, _seq: db._seq, _saveNow: saveNow, _nowStr: nowStr });
    if (result.added > 0) console.log('Question bank populated: ' + result.added + ' new questions, total: ' + result.total);
  } catch(gErr) {
    console.error('Question generation error:', gErr.message);
  }
} catch(e) {
  console.error('Database initialization error:', e.message);
}

module.exports = dbWrapper;
module.exports._raw = db;
module.exports._saveNow = saveNow;
module.exports._nowStr = nowStr;
module.exports._insert = insert;
module.exports._update = update;
module.exports._delete = del;
module.exports._where = where;
module.exports._nextId = nextId;
