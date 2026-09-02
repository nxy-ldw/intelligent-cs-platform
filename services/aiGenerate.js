var db = require('../config/database');
var https = require('https');
var http = require('http');
var url = require('url');

function getDefaultApi() {
  var apis = db._raw.ai_apis || [];
  var api = apis.find(function(a) { return a.is_default === 1 && a.is_active === 1; });
  if (!api) api = apis.find(function(a) { return a.is_active === 1; });
  return api;
}

function callApi(apiConfig, messages) {
  return new Promise(function(resolve, reject) {
    if (!apiConfig.api_url) { reject(new Error('API URL未配置')); return; }
    if (!apiConfig.api_key) { reject(new Error('API Key未配置，请在管理后台设置')); return; }

    var parsedUrl = url.parse(apiConfig.api_url);
    var body = JSON.stringify({
      model: apiConfig.model || 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: apiConfig.max_tokens || 2048,
      temperature: apiConfig.temperature || 0.7
    });

    var headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    };

    if (apiConfig.provider === 'gemini') {
      headers['x-goog-api-key'] = apiConfig.api_key;
    } else if (apiConfig.provider === 'openrouter') {
      headers['Authorization'] = 'Bearer ' + apiConfig.api_key;
      headers['HTTP-Referer'] = 'https://edu.example.com';
      headers['X-Title'] = 'AI Learning System';
    } else {
      headers['Authorization'] = 'Bearer ' + apiConfig.api_key;
    }

    var options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.path,
      method: 'POST',
      headers: headers
    };

    var transport = parsedUrl.protocol === 'https:' ? https : http;
    var req = transport.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        if (res.statusCode !== 200) {
          reject(new Error('API返回错误(' + res.statusCode + '): ' + data.substring(0, 200)));
          return;
        }
        try {
          var json = JSON.parse(data);
          var content = '';
          if (json.choices && json.choices[0]) {
            content = json.choices[0].message.content;
          } else if (json.candidates && json.candidates[0]) {
            content = json.candidates[0].content.parts[0].text;
          } else if (json.content) {
            content = json.content;
          } else {
            reject(new Error('无法解析API响应: ' + data.substring(0, 200)));
            return;
          }
          resolve(content);
        } catch(e) {
          reject(new Error('解析API响应失败: ' + e.message));
        }
      });
    });

    req.on('error', function(e) { reject(new Error('网络请求失败: ' + e.message)); });
    req.setTimeout(30000, function() { req.destroy(); reject(new Error('请求超时(30秒)')); });
    req.write(body);
    req.end();
  });
}

function buildPrompt(params) {
  var gradeLevel = params.gradeLevel || '高一';
  var subject = params.subject || '数学';
  var textbookVersion = params.textbookVersion || '人教A版';
  var course = params.course || '必修第一册';
  var knowledgePoint = params.knowledgePoint || '';
  var difficulty = params.difficulty || 3;
  var type = params.type || 'single';
  var count = params.count || 1;

  var typeDesc = {
    'single': '单选题（4个选项A/B/C/D，1个正确答案）',
    'multi': '多选题（4个选项A/B/C/D，多个正确答案）',
    'fill': '填空题（填空处用____标记）',
    'judge': '判断题（答案为"正确"或"错误"）'
  };

  var diffDesc = ['简单', '较易', '中等', '较难', '困难'][Math.min(Math.max(difficulty - 1, 0), 4)];

  var prompt = '你是一位专业的' + subject + '教师，请根据以下要求生成' + count + '道题目：\n';
  prompt += '年级段：' + gradeLevel + '\n';
  prompt += '科目：' + subject + '\n';
  prompt += '教材版本：' + textbookVersion + '\n';
  prompt += '课程：' + course + '\n';
  if (knowledgePoint) prompt += '知识点：' + knowledgePoint + '\n';
  prompt += '难度：' + diffDesc + '（' + difficulty + '/5级）\n';
  prompt += '题型：' + (typeDesc[type] || typeDesc['single']) + '\n\n';
  prompt += '请严格按照以下JSON数组格式返回，不要包含其他文字：\n';
  prompt += '[\n';
  prompt += '  {\n';
  prompt += '    "question": "题干内容",\n';
  if (type === 'single' || type === 'multi') {
    prompt += '    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],\n';
  } else {
    prompt += '    "options": [],\n';
  }
  prompt += '    "answer": "正确答案",\n';
  prompt += '    "analysis": "详细解析",\n';
  prompt += '    "kp_name": "知识点名称",\n';
  prompt += '    "difficulty": ' + difficulty + '\n';
  prompt += '  }\n';
  prompt += ']\n';
  prompt += '\n注意：只返回JSON数组，不要有markdown代码块标记，不要有其他说明文字。';

  return [
    { role: 'system', content: '你是一个专业的教育题目生成助手，擅长根据教学大纲和知识点生成高质量题目。必须严格按照JSON格式输出，不要包含任何其他文字。' },
    { role: 'user', content: prompt }
  ];
}

function parseQuestions(content) {
  content = content.trim();
  if (content.startsWith('```')) {
    content = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
  }
  var questions;
  try {
    questions = JSON.parse(content);
  } catch(e) {
    var match = content.match(/\[[\s\S]*\]/);
    if (match) {
      try { questions = JSON.parse(match[0]); }
      catch(e2) { return []; }
    } else { return []; }
  }
  if (!Array.isArray(questions)) return [];
  return questions.filter(function(q) { return q.question && q.answer; });
}

async function generateQuestions(params) {
  var api = getDefaultApi();
  if (!api) throw new Error('没有可用的AI API，请在管理后台配置');
  if (!api.api_key) throw new Error('当前AI API未设置API Key，请管理员在后台配置。免费的Google Gemini API Key可在 https://ai.google.dev/ 免费获取');

  var messages = buildPrompt(params);
  var content = await callApi(api, messages);
  var questions = parseQuestions(content);

  var added = 0;
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    var seq = (db._seq.questions || 0) + 1;
    db._seq.questions = seq;
    db._raw.questions.push({
      id: seq,
      kp_id: 0,
      kp_name: q.kp_name || params.knowledgePoint || '',
      subject: params.subject || '数学',
      grade_level: params.gradeLevel || '',
      textbook_version: params.textbookVersion || '',
      course: params.course || '',
      difficulty: q.difficulty || params.difficulty || 3,
      type: params.type || 'single',
      question: q.question,
      options: JSON.stringify(q.options || []),
      answer: String(q.answer),
      analysis: q.analysis || '',
      source: 'AI_' + (api.provider || 'unknown'),
      created_by: 'ai_generate',
      created_at: new Date().toISOString()
    });
    added++;
  }
  if (added > 0) db._saveNow();
  return { added: added, questions: questions, api_used: api.name };
}

function getApis() {
  return (db._raw.ai_apis || []).map(function(a) {
    return {
      id: a.id, name: a.name, provider: a.provider,
      model: a.model, is_free: a.is_free, is_active: a.is_active,
      is_default: a.is_default, has_key: !!a.api_key,
      api_url: a.api_url, max_tokens: a.max_tokens, temperature: a.temperature
    };
  });
}

function updateApi(id, updates) {
  var api = (db._raw.ai_apis || []).find(function(a) { return a.id === id; });
  if (!api) return false;
  if (updates.name !== undefined) api.name = updates.name;
  if (updates.provider !== undefined) api.provider = updates.provider;
  if (updates.api_url !== undefined) api.api_url = updates.api_url;
  if (updates.api_key !== undefined) api.api_key = updates.api_key;
  if (updates.model !== undefined) api.model = updates.model;
  if (updates.is_active !== undefined) api.is_active = updates.is_active ? 1 : 0;
  if (updates.is_default !== undefined) {
    if (updates.is_default) {
      (db._raw.ai_apis || []).forEach(function(a) { a.is_default = 0; });
      api.is_default = 1;
    } else { api.is_default = 0; }
  }
  if (updates.max_tokens !== undefined) api.max_tokens = parseInt(updates.max_tokens) || 2048;
  if (updates.temperature !== undefined) api.temperature = parseFloat(updates.temperature) || 0.7;
  db._saveNow();
  return true;
}

module.exports = {
  generateQuestions: generateQuestions,
  getApis: getApis,
  updateApi: updateApi,
  getDefaultApi: getDefaultApi,
  callApi: callApi
};
