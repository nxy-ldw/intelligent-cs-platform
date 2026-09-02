const db = require('../config/database');

const INTENT_CATEGORIES = [
  { intent: '系统介绍', keywords: ['系统', '介绍', '做什么', '功能', '是什么', '平台'] },
  { intent: '对话系统', keywords: ['意图', '识别', '多轮', '对话', '上下文', '自然语言', 'NLP'] },
  { intent: '知识库', keywords: ['知识库', '维护', '更新', '版本', '知识图谱', '审核'] },
  { intent: '人机协同', keywords: ['转人工', '人工', '转接', '协同', '分配', '路由'] },
  { intent: '性能指标', keywords: ['性能', '指标', '响应时间', '准确率', '满意度', 'KPI'] },
  { intent: '安全要求', keywords: ['安全', '加密', '隐私', '保护', '合规', '审计'] },
  { intent: '多渠道', keywords: ['渠道', '接入', '微信', '小程序', '语音', 'ASR', 'TTS'] },
  { intent: '架构设计', keywords: ['架构', '分层', '设计', '引擎', '层'] },
  { intent: '项目管理', keywords: ['阶段', '开发', '计划', '路线图', '里程碑', '时间'] },
  { intent: '风险控制', keywords: ['风险', '应对', '措施', '控制', '策略'] },
  { intent: '通用问候', keywords: ['你好', '您好', 'hi', 'hello', '嗨'] },
  { intent: '通用致谢', keywords: ['谢谢', '感谢', 'thanks', '多谢'] },
  { intent: '通用告别', keywords: ['再见', '拜拜', 'bye', 'goodbye', '88'] },
  { intent: '紧急咨询', keywords: ['紧急', '急救', '危险', '严重', '马上', '立刻'] }
];

function tokenize(text) {
  return text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function recognizeIntent(input) {
  const tokens = tokenize(input);
  const scores = {};

  for (const cat of INTENT_CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      if (input.includes(kw)) {
        score += kw.length * 2;
      }
      for (const token of tokens) {
        if (token.includes(kw) || kw.includes(token)) {
          score += 1;
        }
      }
    }
    scores[cat.intent] = score;
  }

  let bestIntent = '通用问答';
  let bestScore = 0;
  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? Math.min(bestScore / totalScore, 1.0) : 0;

  return { intent: bestIntent, confidence: Math.round(confidence * 100) / 100 };
}

function searchKnowledgeBase(input, intent) {
  let rows;
  if (intent && intent !== '通用问答') {
    const catMap = {
      '系统介绍': '系统介绍',
      '对话系统': '对话系统',
      '人机协同': '人机协同',
      '性能指标': '性能指标',
      '安全要求': '安全要求',
      '多渠道': '多渠道',
      '架构设计': '架构设计',
      '项目管理': '项目管理',
      '风险控制': '风险控制',
      '通用问候': '通用问答',
      '通用致谢': '通用问答',
      '通用告别': '通用问答'
    };
    const category = catMap[intent] || null;
    if (category) {
      rows = db.prepare("SELECT * FROM knowledge_base WHERE category = ?").all(category);
    } else {
      rows = db.prepare("SELECT * FROM knowledge_base").all();
    }
  } else {
    rows = db.prepare("SELECT * FROM knowledge_base").all();
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const row of rows) {
    let score = 0;
    const keywords = row.keywords.split(',').map(k => k.trim());
    for (const kw of keywords) {
      if (kw && input.includes(kw)) {
        score += kw.length * 3;
      }
    }
    const questionTokens = tokenize(row.question);
    const inputTokens = tokenize(input);
    for (const qt of questionTokens) {
      for (const it of inputTokens) {
        if (qt.length > 1 && it.length > 1 && (qt.includes(it) || it.includes(qt))) {
          score += 2;
        }
      }
    }
    if (input.includes(row.question) || row.question.includes(input)) {
      score += 20;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = row;
    }
  }

  return { match: bestMatch, score: bestScore };
}

function generateResponse(input, userId) {
  const { intent, confidence } = recognizeIntent(input);

  const isEmergency = intent === '紧急咨询' || /紧急|急救|危险|危及|生命|休克|大出血|心脏骤停/i.test(input);
  if (isEmergency) {
    return {
      content: '检测到您可能遇到紧急情况！请立即拨打120急救电话或前往最近的医院急诊科。系统已准备为您转接人工服务。',
      intent: '紧急咨询',
      confidence: 0.95,
      needEscalation: true,
      suggestions: ['我需要转人工客服', '查看急救知识', '返回主菜单']
    };
  }

  const { match, score } = searchKnowledgeBase(input, intent);

  if (match && score > 0) {
    const matchConfidence = Math.min(confidence + score / 30, 0.99);
    return {
      content: match.answer,
      intent: intent,
      confidence: Math.round(matchConfidence * 100) / 100,
      needEscalation: false,
      suggestions: generateSuggestions(intent),
      source: match.category
    };
  }

  if (confidence < 0.3) {
    return {
      content: '抱歉，我暂时无法准确理解您的问题。您可以尝试更详细地描述，或者选择转接人工客服获取帮助。您也可以询问关于系统功能、知识库、对话系统等方面的问题。',
      intent: '未识别',
      confidence: confidence,
      needEscalation: true,
      suggestions: ['系统是做什么的？', '核心功能有哪些？', '转人工客服', '查看知识库']
    };
  }

  return {
    content: `关于「${intent}」方面的问题，让我为您简要介绍。您可以更具体地描述您想了解的内容，例如：系统功能、对话机制、知识库管理、人机协同、性能指标等。如果需要更专业的帮助，我可以为您转接人工客服。`,
    intent: intent,
    confidence: confidence,
    needEscalation: false,
    suggestions: generateSuggestions(intent)
  };
}

function generateSuggestions(intent) {
  const suggestionMap = {
    '系统介绍': ['核心功能有哪些？', '系统架构是怎样的？', '知识库包含哪些内容？'],
    '对话系统': ['如何进行意图识别？', '支持多轮对话吗？', '实体提取是什么？'],
    '知识库': ['知识库包含哪些内容？', '知识库如何维护？', '什么是知识图谱？'],
    '人机协同': ['什么时候转人工？', '人机协同如何工作？', '转接流程是什么？'],
    '性能指标': ['系统的性能指标', '响应时间是多久？', '准确率是多少？'],
    '安全要求': ['系统有哪些安全要求？', '如何保护隐私？', '数据如何加密？'],
    '多渠道': ['支持哪些接入渠道？', '可以用微信吗？', '支持语音吗？'],
    '架构设计': ['系统架构是怎样的？', '有哪些层级？', 'AI引擎层做什么？'],
    '项目管理': ['项目的开发阶段', '什么时候上线？', '有哪些里程碑？'],
    '风险控制': ['有哪些风险？', '如何应对风险？', '医疗准确性怎么保证？'],
    '通用问候': ['系统是做什么的？', '核心功能有哪些？', '知识库包含哪些内容？'],
    '通用问答': ['系统是做什么的？', '核心功能有哪些？', '什么时候转人工？']
  };
  return suggestionMap[intent] || suggestionMap['通用问答'];
}

function saveMessage(userId, role, content, intent, confidence) {
  db.prepare(
    "INSERT INTO messages (user_id, role, content, intent, confidence) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, role, content, intent || '', confidence || 0);
}

function getHistory(userId, limit = 50) {
  return db.prepare(
    "SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(userId, limit).reverse();
}

module.exports = { generateResponse, recognizeIntent, saveMessage, getHistory, searchKnowledgeBase };
