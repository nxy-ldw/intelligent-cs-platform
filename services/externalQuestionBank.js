const db = require('../config/database');

const SOURCES = {
  CNKI: { name: '知网', baseUrl: 'https://api.cnki.net', enabled: false, apiKey: '' },
  XUEKEWANG: { name: '学科网', baseUrl: 'https://api.xkw.com', enabled: false, apiKey: '' },
  ZUOYEBANG: { name: '作业帮', baseUrl: 'https://api.zybang.com', enabled: false, apiKey: '' },
  BUILTIN: { name: '内置题库', baseUrl: '', enabled: true, apiKey: '' }
};

function getConfig() {
  var config = db._raw.system_config[0] || {};
  if (config.cnki_api_key) { SOURCES.CNKI.apiKey = config.cnki_api_key; SOURCES.CNKI.enabled = true; }
  if (config.xkw_api_key) { SOURCES.XUEKEWANG.apiKey = config.xkw_api_key; SOURCES.XUEKEWANG.enabled = true; }
  if (config.zyb_api_key) { SOURCES.ZUOYEBANG.apiKey = config.zyb_api_key; SOURCES.ZUOYEBANG.enabled = true; }
  return SOURCES;
}

function searchQuestions(params) {
  var source = params.source || 'BUILTIN';
  var subject = params.subject || '数学';
  var kpName = params.kpName || '';
  var difficulty = params.difficulty || 0;
  var type = params.type || '';
  var keyword = params.keyword || '';

  var results = db._raw.questions.filter(function(q) {
    if (subject && q.subject !== subject) return false;
    if (kpName && q.kp_name !== kpName) return false;
    if (difficulty && q.difficulty !== parseInt(difficulty)) return false;
    if (type && q.type !== type) return false;
    if (keyword && q.question.indexOf(keyword) === -1) return false;
    return true;
  });

  return {
    source: 'BUILTIN',
    total: results.length,
    questions: results
  };
}

function importQuestions(questions, source) {
  var imported = 0;
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    var exists = db._raw.questions.some(function(eq) {
      return eq.question === q.question && eq.kp_name === q.kp_name;
    });
    if (exists) continue;

    var seq = (db._seq.questions || 0) + 1;
    db._seq.questions = seq;
    db._raw.questions.push({
      id: seq,
      kp_id: q.kp_id || 0,
      kp_name: q.kp_name || '',
      subject: q.subject || '数学',
      difficulty: q.difficulty || 2,
      type: q.type || 'single',
      question: q.question,
      options: q.options || '[]',
      answer: q.answer || '',
      analysis: q.analysis || '',
      source: source || 'BUILTIN',
      created_by: 'import',
      created_at: db._nowStr()
    });
    imported++;
  }
  if (imported > 0) db._saveNow();
  return { imported: imported, total: questions.length };
}

function generateQuestion(params) {
  var kpName = params.kpName || '';
  var difficulty = params.difficulty || 2;
  var type = params.type || 'single';

  var templates = {
    '一元一次方程': {
      single: {
        question: '解方程 ' + (2 + difficulty) + 'x + ' + difficulty + ' = ' + (difficulty * 3 + 2) + '，x = ?',
        options: JSON.stringify(['A. ' + (difficulty), 'B. ' + (difficulty + 1), 'C. ' + (difficulty + 2), 'D. ' + (difficulty + 3)]),
        answer: 'A',
        analysis: (2 + difficulty) + 'x = ' + (difficulty * 3 + 2 - difficulty) + ' = ' + (2 * difficulty + 2) + '，x = ' + difficulty + '。'
      }
    },
    '一元二次方程': {
      single: {
        question: '方程 x² - ' + (4 + difficulty) + 'x + ' + (3 + difficulty) + ' = 0 的两根之和为？',
        options: JSON.stringify(['A. ' + (4 + difficulty), 'B. ' + (3 + difficulty), 'C. ' + (1 + difficulty), 'D. ' + (7 + 2 * difficulty)]),
        answer: 'A',
        analysis: '由韦达定理，两根之和 = -b/a = ' + (4 + difficulty) + '。'
      }
    },
    '二次函数': {
      single: {
        question: '抛物线 y = x² - ' + (2 + difficulty) + 'x + ' + difficulty + ' 的对称轴是？',
        options: JSON.stringify(['A. x = ' + (1 + difficulty / 2), 'B. x = ' + (2 + difficulty), 'C. x = ' + difficulty, 'D. x = ' + (1 + difficulty)]),
        answer: 'A',
        analysis: '对称轴 x = -b/(2a) = ' + (2 + difficulty) + '/2 = ' + (1 + difficulty / 2) + '。'
      }
    }
  };

  var template = templates[kpName];
  if (!template || !template[type]) return null;
  return template[type];
}

function getSources() {
  getConfig();
  var result = [];
  for (var key in SOURCES) {
    result.push({ key: key, name: SOURCES[key].name, enabled: SOURCES[key].enabled });
  }
  return result;
}

module.exports = {
  getConfig: getConfig,
  getSources: getSources,
  searchQuestions: searchQuestions,
  importQuestions: importQuestions,
  generateQuestion: generateQuestion
};
