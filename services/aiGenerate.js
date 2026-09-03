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
    } else if (apiConfig.provider === 'zhipu') {
      headers['Authorization'] = 'Bearer ' + apiConfig.api_key;
    } else if (apiConfig.provider === 'baidu') {
      headers['Authorization'] = 'Bearer ' + apiConfig.api_key;
    } else if (apiConfig.provider === 'tencent') {
      headers['Authorization'] = 'Bearer ' + apiConfig.api_key;
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

  var diffMap = {
    1: {
      name: '简单',
      desc: '【难度定位：学业水平合格考/课后基础题】直接考查基本概念、公式、定理的记忆和直接套用。解题步骤不超过2步，无陷阱，计算量极小。所有学生经过课堂学习后都应能正确解答。'
    },
    2: {
      name: '较易',
      desc: '【难度定位：期中期末基础题】考查对概念的理解和简单应用。解题步骤2-3步，需要简单的变形或代入，无明显陷阱。中等以上学生可顺利完成。'
    },
    3: {
      name: '中等',
      desc: '【难度定位：期中期末中档题/高考基础题】需要综合运用2-3个知识点，有一定的计算量和推理过程。可能设置常见易错点，需要仔细审题。成绩中等的学生经过思考可以解答。'
    },
    4: {
      name: '较难',
      desc: '【难度定位：高考中档题/竞赛入门题】需要综合运用3个以上知识点，题目有一定灵活性和隐蔽性，需要挖掘隐含条件。计算量较大，可能涉及分类讨论、数形结合等思想方法。只有成绩较好的学生能顺利解答。'
    },
    5: {
      name: '困难',
      desc: '【难度定位：高考压轴题/竞赛提高题】高度综合，需要创造性思维和多维度分析。可能涉及多个知识模块的交叉融合，解题路径不明显，需要尝试多种方法。计算量大、步骤多、技巧性强。即使是优秀学生也需要较长时间思考。'
    }
  };
  var diffInfo = diffMap[Math.min(Math.max(parseInt(difficulty) || 3, 1), 5)];

  var prompt = '你是一位经验丰富的' + subject + '高级教师，擅长精准把控题目难度。请严格按照以下要求生成' + count + '道题目：\n';
  prompt += '【基本信息】\n';
  prompt += '年级段：' + gradeLevel + '\n';
  prompt += '科目：' + subject + '\n';
  prompt += '教材版本：' + textbookVersion + '\n';
  prompt += '课程：' + course + '\n';
  if (knowledgePoint) prompt += '知识点：' + knowledgePoint + '\n';
  prompt += '题型：' + (typeDesc[type] || typeDesc['single']) + '\n';
  prompt += '难度等级：' + diffInfo.name + '（' + difficulty + '/5级）\n';
  prompt += diffInfo.desc + '\n\n';
  prompt += '【题目要求】\n';
  prompt += '1. 每道题必须严格匹配上述难度等级，不得随意降低或提高难度\n';
  prompt += '2. 题干表述清晰、严谨，符合' + gradeLevel + '学生认知水平\n';
  prompt += '3. 选项设置科学：错误选项应具有典型性和迷惑性，对应常见错误\n';
  prompt += '4. 答案必须准确无误\n\n';
  prompt += '【解析要求】\n';
  prompt += '每道题的analysis字段必须包含详细解析，结构为：\n';
  prompt += '- 【考查知识点】明确指出本题考查的核心知识点\n';
  prompt += '- 【解题思路】说明解题的关键突破口和整体思路\n';
  prompt += '- 【详细解答】分步写出完整解题过程，关键步骤标注理由\n';
  prompt += '- 【易错点提醒】指出学生容易出错的地方及原因\n\n';
  prompt += '【输出格式】\n';
  prompt += '请严格按照以下JSON数组格式返回，数组中有' + count + '个题目对象。不要包含任何其他文字说明，不要使用markdown代码块：\n';
  prompt += '[\n';
  prompt += '  {\n';
  prompt += '    "question": "题干内容",\n';
  if (type === 'single' || type === 'multi') {
    prompt += '    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],\n';
  } else {
    prompt += '    "options": [],\n';
  }
  prompt += '    "answer": "正确答案",\n';
  prompt += '    "analysis": "【考查知识点】...\\n【解题思路】...\\n【详细解答】...\\n【易错点提醒】...",\n';
  prompt += '    "kp_name": "知识点名称",\n';
  prompt += '    "difficulty": ' + difficulty + '\n';
  prompt += '  }\n';
  prompt += ']\n';
  prompt += '\n重要提醒：只返回JSON数组，确保JSON语法完全正确，逗号、括号、引号都要配对。';

  return [
    { role: 'system', content: '你是一个专业的教育题目生成专家，精通中学各学科各难度层级的题目设计。你能够精确把控题目难度，确保题目质量高、表述严谨、解析详尽。你必须严格按照JSON格式输出，不要包含任何其他文字。' },
    { role: 'user', content: prompt }
  ];
}

function parseQuestions(content) {
  content = content.trim();
  // 去除markdown代码块
  content = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  var questions;
  // 尝试1: 直接JSON解析
  try {
    questions = JSON.parse(content);
    if (Array.isArray(questions) && questions.length > 0) {
      return questions.filter(function(q) { return q && q.question && q.answer; });
    }
  } catch(e) {}

  // 尝试2: 提取第一个数组
  try {
    var match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      questions = JSON.parse(match[0]);
      if (Array.isArray(questions) && questions.length > 0) {
        return questions.filter(function(q) { return q && q.question && q.answer; });
      }
    }
  } catch(e) {}

  // 尝试3: 逐题提取对象
  try {
    var results = [];
    var objPattern = /\{[\s\S]*?\}/g;
    var objMatch;
    while ((objMatch = objPattern.exec(content)) !== null) {
      try {
        var obj = JSON.parse(objMatch[0]);
        if (obj && obj.question && obj.answer) {
          results.push(obj);
        }
      } catch(e) {}
    }
    if (results.length > 0) return results;
  } catch(e) {}

  return [];
}

async function generateQuestions(params) {
  var api = getDefaultApi();
  if (!api) throw new Error('没有可用的AI API，请在管理后台配置');
  if (!api.api_key) throw new Error('当前AI API未设置API Key，请管理员在后台配置。推荐的免费API：智谱GLM(https://open.bigmodel.cn/) 或 DeepSeek(https://platform.deepseek.com/)');

  var count = params.count || 1;
  var allQuestions = [];

  // 策略: 先尝试一次生成所有题目
  var messages = buildPrompt(params);
  try {
    var content = await callApi(api, messages);
    allQuestions = parseQuestions(content);
  } catch(e) {
    console.error('Batch generation failed:', e.message);
  }

  // 如果批量生成不足，逐题生成补充
  if (allQuestions.length < count) {
    var remaining = count - allQuestions.length;
    var singleParams = Object.assign({}, params, { count: 1 });
    var maxRetries = remaining + 2; // 允许少量重试
    var retryCount = 0;

    while (allQuestions.length < count && retryCount < maxRetries) {
      try {
        var singleMessages = buildPrompt(singleParams);
        var singleContent = await callApi(api, singleMessages);
        var singleResult = parseQuestions(singleContent);
        if (singleResult.length > 0) {
          allQuestions.push(singleResult[0]);
        }
      } catch(e) {
        console.error('Single question generation failed (retry ' + retryCount + '):', e.message);
      }
      retryCount++;
    }
  }

  // 截断到请求数量
  allQuestions = allQuestions.slice(0, count);

  // 写入数据库
  var added = 0;
  for (var i = 0; i < allQuestions.length; i++) {
    var q = allQuestions[i];
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
  return { added: added, questions: allQuestions, api_used: api.name };
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
  if (updates.is_free !== undefined) api.is_free = updates.is_free ? 1 : 0;
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

function addApi(data) {
  var api = {
    id: db._nextId('ai_apis'),
    name: data.name || '未命名API',
    provider: data.provider || 'custom',
    api_url: data.api_url || '',
    api_key: data.api_key || '',
    model: data.model || '',
    is_free: data.is_free ? 1 : 0,
    is_active: data.is_active ? 1 : 0,
    is_default: 0,
    max_tokens: parseInt(data.max_tokens) || 2048,
    temperature: parseFloat(data.temperature) || 0.7,
    created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
  };
  if (data.is_default) {
    (db._raw.ai_apis || []).forEach(function(a) { a.is_default = 0; });
    api.is_default = 1;
  }
  db._raw.ai_apis.push(api);
  db._saveNow();
  return true;
}

// ===== 图片OCR识别（拍照录题） =====
function ocrImage(base64Image, options) {
  return new Promise(function(resolve, reject) {
    var api = getDefaultApi();
    if (!api) { reject(new Error('没有可用的AI API，请在管理后台配置')); return; }
    if (!api.api_key) { reject(new Error('当前AI API未设置API Key')); return; }

    var subject = (options && options.subject) || '数学';
    var prompt = '请仔细识别这张图片中的所有题目。图片可能是一张试卷或练习册的照片。';
    prompt += '\n\n请按以下要求识别并提取题目：';
    prompt += '\n1. 识别所有可见的题目，包括题干、选项（如果有）、分值等信息';
    prompt += '\n2. 保持题目原有的序号和顺序';
    prompt += '\n3. 准确识别数学公式、符号、图表描述';
    prompt += '\n4. 如果题目有配图，用文字描述图中的关键信息';
    prompt += '\n\n请以JSON数组格式返回识别结果，每个题目包含以下字段：';
    prompt += '\n- question: 题干内容（完整文字）';
    prompt += '\n- type: 题型（single单选/multi多选/fill填空/judge判断/short简答/calc计算/proof证明）';
    prompt += '\n- options: 选项数组（单选/多选题填写，其他题型为空数组）';
    prompt += '\n- answer: 参考答案或标准答案（如果图片中有答案）';
    prompt += '\n- analysis: 题目解析或解答过程（如果图片中有）';
    prompt += '\n- kp_name: 涉及的知识点（根据题目内容判断）';
    prompt += '\n- difficulty: 难度估计（1-5，1最简单，5最难）';
    prompt += '\n\n只返回JSON数组，不要包含其他文字说明，不要使用markdown代码块。科目：' + subject;

    var parsedUrl = url.parse(api.api_url);
    // 构建多模态消息（智谱glm-4v格式）
    var messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: base64Image } }
        ]
      }
    ];

    var body = JSON.stringify({
      model: api.model || 'glm-4v-flash',
      messages: messages,
      max_tokens: api.max_tokens || 4096,
      temperature: 0.3
    });

    var headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': 'Bearer ' + api.api_key
    };

    var options2 = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.path,
      method: 'POST',
      headers: headers,
      timeout: 60000
    };

    var req = https.request(options2, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          var result = JSON.parse(data);
          var content = '';
          if (result.choices && result.choices[0] && result.choices[0].message) {
            content = result.choices[0].message.content;
          } else if (result.error) {
            reject(new Error(result.error.message || 'API调用失败'));
            return;
          }
          resolve(content);
        } catch(e) {
          reject(new Error('解析响应失败: ' + e.message));
        }
      });
    });

    req.on('error', function(e) { reject(new Error('网络请求失败: ' + e.message)); });
    req.on('timeout', function() { req.destroy(); reject(new Error('请求超时')); });
    req.write(body);
    req.end();
  });
}

function parseOcrResult(content) {
  content = content.trim();
  content = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  var questions;
  try {
    questions = JSON.parse(content);
    if (Array.isArray(questions) && questions.length > 0) {
      return questions.filter(function(q) { return q && q.question; });
    }
  } catch(e) {}

  try {
    var match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      questions = JSON.parse(match[0]);
      if (Array.isArray(questions) && questions.length > 0) {
        return questions.filter(function(q) { return q && q.question; });
      }
    }
  } catch(e) {}

  return [];
}

async function ocrAndImport(base64Image, options) {
  var content = await ocrImage(base64Image, options);
  var questions = parseOcrResult(content);
  var api = getDefaultApi();
  var added = 0;
  var results = [];

  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    var seq = (db._seq.questions || 0) + 1;
    db._seq.questions = seq;
    var record = {
      id: seq,
      kp_id: 0,
      kp_name: q.kp_name || (options && options.knowledgePoint) || '',
      subject: (options && options.subject) || '数学',
      grade_level: (options && options.gradeLevel) || '',
      textbook_version: (options && options.textbookVersion) || '',
      course: (options && options.course) || '',
      difficulty: q.difficulty || 3,
      type: q.type || 'single',
      question: q.question,
      options: JSON.stringify(q.options || []),
      answer: String(q.answer || ''),
      analysis: q.analysis || '',
      source: 'OCR_' + (api ? api.provider : 'unknown'),
      created_by: 'ocr_import',
      created_at: new Date().toISOString()
    };
    db._raw.questions.push(record);
    added++;
    results.push(record);
  }
  if (added > 0) db._saveNow();
  return { added: added, questions: results, api_used: api ? api.name : '未知', raw_count: questions.length };
}

module.exports = {
  generateQuestions: generateQuestions,
  getApis: getApis,
  addApi: addApi,
  updateApi: updateApi,
  getDefaultApi: getDefaultApi,
  callApi: callApi,
  ocrImage: ocrImage,
  ocrAndImport: ocrAndImport
};
