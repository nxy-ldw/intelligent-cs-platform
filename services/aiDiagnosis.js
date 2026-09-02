const db = require('../config/database');

const ERROR_TYPES = [
  { key: 'concept', name: '概念混淆', desc: '对基本概念理解不清，容易混淆相似概念' },
  { key: 'calculation', name: '计算失误', desc: '计算过程中出现错误，方法思路正确' },
  { key: 'misread', name: '审题错误', desc: '没有正确理解题意，看错条件或要求' },
  { key: 'method', name: '方法不当', desc: '解题方法选择错误或不够简便' },
  { key: 'careless', name: '粗心大意', desc: '简单错误，如符号、单位、抄写错误' },
  { key: 'foundation', name: '基础薄弱', desc: '前置知识掌握不足，需要夯实基础' }
];

function analyzeError(question, userAnswer, correctAnswer) {
  const q = question;
  const userAns = (userAnswer || '').trim().toUpperCase();
  const correct = (correctAnswer || '').trim().toUpperCase();

  const features = {
    concept: 0, calculation: 0, misread: 0, method: 0, careless: 0, foundation: 0
  };

  const qText = q.question || '';
  const analysis = q.analysis || '';

  if (analysis.includes('概念') || analysis.includes('理解') || analysis.includes('定义')) {
    features.concept += 3;
  }
  if (analysis.includes('计算') || analysis.includes('公式') || analysis.includes('运算')) {
    features.calculation += 2;
  }
  if (analysis.includes('审题') || analysis.includes('题意') || analysis.includes('看错')) {
    features.misread += 2;
  }
  if (analysis.includes('方法') || analysis.includes('思路') || analysis.includes('技巧')) {
    features.method += 2;
  }

  if (userAns.length > 0 && userAns !== correct) {
    const qLower = qText.toLowerCase();
    if (qLower.includes('求') || qLower.includes('计算') || qLower.includes('值')) {
      features.calculation += 1;
    }
    if (qLower.includes('定义') || qLower.includes('概念') || qLower.includes('什么是')) {
      features.concept += 1;
    }
  }

  const difficulty = q.difficulty || 2;
  if (difficulty >= 4) {
    features.method += 1;
    features.foundation += 1;
  }
  if (difficulty <= 1) {
    features.careless += 2;
  }

  let totalScore = Object.values(features).reduce((a, b) => a + b, 0);
  if (totalScore === 0) {
    features.concept = 1;
    totalScore = 1;
  }

  const sorted = Object.entries(features)
    .map(([key, score]) => ({ key, name: ERROR_TYPES.find(t => t.key === key)?.name || key, score, ratio: Math.round(score / totalScore * 100) }))
    .sort((a, b) => b.score - a.score);

  return {
    primary: sorted[0],
    secondary: sorted.slice(1, 3),
    all: sorted,
    suggestion: generateErrorSuggestion(sorted[0].key, q)
  };
}

function generateErrorSuggestion(errorType, question) {
  const suggestions = {
    concept: `建议回顾「${question.kp_name}」相关的基本概念和定义，理清概念之间的区别与联系。`,
    calculation: `建议加强计算练习，注意运算过程中的符号和步骤，养成验算的好习惯。`,
    misread: `建议审题时放慢速度，圈画出关键条件和所求问题，避免遗漏或误解。`,
    method: `建议总结这类题型的常用解法，多练习不同方法，选择最简便的解题路径。`,
    careless: `建议答题时更加细心，完成后认真检查，特别注意符号、单位等细节。`,
    foundation: `建议先复习相关的前置知识，夯实基础后再挑战更难的题目。`
  };
  return suggestions[errorType] || '建议多做练习，巩固所学知识。';
}

function calculateMastery(userId, kpId) {
  const answers = db.prepare(
    "SELECT * FROM answers WHERE user_id = ? AND kp_id = ? ORDER BY created_at DESC"
  ).all(userId, kpId);

  if (answers.length === 0) return { level: 0, label: '未测评', color: '#94a3b8', total: 0, correct: 0 };

  const recent = answers.slice(0, Math.min(answers.length, 20));
  const correct = recent.filter(a => a.is_correct).length;
  const ratio = correct / recent.length;

  let difficultyBonus = 0;
  let weightedCorrect = 0;
  let weightedTotal = 0;
  for (const a of recent) {
    const diff = a.difficulty || 2;
    const weight = diff;
    weightedTotal += weight;
    if (a.is_correct) weightedCorrect += weight;
  }
  const weightedRatio = weightedTotal > 0 ? weightedCorrect / weightedTotal : 0;

  const finalScore = (ratio * 0.6 + weightedRatio * 0.4);

  let level, label, color;
  if (finalScore >= 0.9) { level = 5; label = '优秀'; color = '#10b981'; }
  else if (finalScore >= 0.75) { level = 4; label = '良好'; color = '#6366f1'; }
  else if (finalScore >= 0.6) { level = 3; label = '及格'; color = '#f59e0b'; }
  else if (finalScore >= 0.4) { level = 2; label = '薄弱'; color = '#f97316'; }
  else { level = 1; label = '需加强'; color = '#ef4444'; }

  return {
    level,
    label,
    color,
    score: Math.round(finalScore * 100),
    total: answers.length,
    correct,
    ratio: Math.round(ratio * 100),
    weightedRatio: Math.round(weightedRatio * 100)
  };
}

function generateDiagnosisReport(userId) {
  const kps = db.prepare("SELECT * FROM knowledge_points ORDER BY difficulty").all();
  const results = [];

  for (const kp of kps) {
    const mastery = calculateMastery(userId, kp.id);
    results.push({
      kp_id: kp.id,
      kp_name: kp.name,
      subject: kp.subject,
      difficulty: kp.difficulty,
      description: kp.description,
      ...mastery
    });
  }

  const totalAnswers = db.prepare("SELECT COUNT(*) as c FROM answers WHERE user_id = ?").get(userId).c;
  const totalCorrect = db.prepare("SELECT COUNT(*) as c FROM answers WHERE user_id = ? AND is_correct = 1").get(userId).c;
  const overallAccuracy = totalAnswers > 0 ? Math.round(totalCorrect / totalAnswers * 100) : 0;

  const weakPoints = results.filter(r => r.level <= 2).sort((a, b) => a.score - b.score);
  const strongPoints = results.filter(r => r.level >= 4).sort((a, b) => b.score - a.score);

  const errorTypeStats = {};
  const wrongAnswers = db.prepare("SELECT * FROM answers WHERE user_id = ? AND is_correct = 0").all(userId);
  for (const wa of wrongAnswers) {
    if (wa.error_type) {
      errorTypeStats[wa.error_type] = (errorTypeStats[wa.error_type] || 0) + 1;
    }
  }

  const errorAnalysis = Object.entries(errorTypeStats)
    .map(([key, count]) => ({
      key,
      name: ERROR_TYPES.find(t => t.key === key)?.name || key,
      count,
      ratio: wrongAnswers.length > 0 ? Math.round(count / wrongAnswers.length * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const learningPath = generateLearningPath(results);

  const report = {
    user_id: userId,
    generated_at: new Date().toISOString(),
    summary: {
      totalAnswers,
      totalCorrect,
      overallAccuracy,
      weakCount: weakPoints.length,
      strongCount: strongPoints.length,
      totalKps: results.length
    },
    knowledge_points: results,
    weak_points: weakPoints,
    strong_points: strongPoints,
    error_analysis: errorAnalysis,
    learning_path: learningPath,
    suggestions: generateOverallSuggestions(weakPoints, errorAnalysis, overallAccuracy)
  };

  const existing = db.prepare("SELECT * FROM diagnosis_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(userId);
  const reportJson = JSON.stringify(report);
  if (existing) {
    db.prepare("UPDATE diagnosis_reports SET report_data = ?, created_at = ? WHERE id = ?").run(
      reportJson, new Date().toISOString(), existing.id
    );
  } else {
    db.prepare("INSERT INTO diagnosis_reports (user_id, report_data) VALUES (?, ?)").run(userId, reportJson);
  }

  addNotification(userId, 'report', '学情诊断报告已更新', '您的最新学情诊断报告已生成，点击查看详情。');

  return report;
}

function generateLearningPath(kpResults) {
  const kps = db.prepare("SELECT * FROM knowledge_points").all();
  const kpMap = {};
  for (const kp of kps) kpMap[kp.id] = kp;

  const resultMap = {};
  for (const r of kpResults) resultMap[r.kp_id] = r;

  const path = [];
  const visited = new Set();

  function dfs(kpId) {
    if (visited.has(kpId)) return;
    const kp = kpMap[kpId];
    if (!kp) return;

    if (kp.prerequisites) {
      const preIds = kp.prerequisites.split(',').map(s => s.trim()).filter(Boolean);
      for (const preName of preIds) {
        const preKp = kps.find(k => k.name === preName);
        if (preKp) dfs(preKp.id);
      }
    }

    visited.add(kpId);
    const result = resultMap[kpId] || { level: 0, label: '未测评', score: 0 };
    path.push({
      kp_id: kpId,
      kp_name: kp.name,
      difficulty: kp.difficulty,
      mastery: result.level,
      score: result.score,
      label: result.label,
      status: result.level >= 4 ? 'completed' : result.level >= 2 ? 'learning' : 'todo',
      priority: result.level <= 2 ? 'high' : result.level <= 3 ? 'medium' : 'low'
    });
  }

  for (const kp of kps) {
    dfs(kp.id);
  }

  return path;
}

function generateOverallSuggestions(weakPoints, errorAnalysis, accuracy) {
  const suggestions = [];

  if (weakPoints.length > 0) {
    const topWeak = weakPoints.slice(0, 3).map(w => w.kp_name).join('、');
    suggestions.push({
      type: 'focus',
      title: '重点突破',
      content: `建议优先加强「${topWeak}」等薄弱知识点的学习，可以从基础概念开始，配合例题加深理解。`
    });
  }

  if (errorAnalysis.length > 0) {
    const topError = errorAnalysis[0];
    suggestions.push({
      type: 'error',
      title: '错因分析',
      content: `您的主要错误类型是「${topError.name}」，建议针对性地进行训练，改善这方面的问题。`
    });
  }

  if (accuracy < 60) {
    suggestions.push({
      type: 'foundation',
      title: '夯实基础',
      content: '当前整体正确率偏低，建议回归基础，系统梳理知识点，循序渐进地提升。'
    });
  } else if (accuracy < 80) {
    suggestions.push({
      type: 'improve',
      title: '稳步提升',
      content: '整体表现良好，建议针对薄弱环节强化训练，同时保持优势知识点的熟练度。'
    });
  } else {
    suggestions.push({
      type: 'excellent',
      title: '继续保持',
      content: '表现优秀！建议挑战更高难度的题目，拓展知识面，保持学习的热情。'
    });
  }

  suggestions.push({
    type: 'method',
    title: '学习方法',
    content: '建议采用「学-练-测-评」四步法：先学习知识点，再做练习题，然后自测检验，最后通过诊断报告查漏补缺。'
  });

  return suggestions;
}

function generateAdaptiveQuestions(userId, count = 5, focusKpId = null) {
  const report = generateDiagnosisReport(userId);
  let targetKps = [];

  if (focusKpId) {
    const kp = db.prepare("SELECT * FROM knowledge_points WHERE id = ?").get(focusKpId);
    if (kp) targetKps = [kp];
  } else {
    const weakIds = report.weak_points.slice(0, 3).map(w => w.kp_id);
    if (weakIds.length > 0) {
      targetKps = db.prepare(`SELECT * FROM knowledge_points WHERE id IN (${weakIds.map(() => '?').join(',')})`).all(...weakIds);
    } else {
      targetKps = db.prepare("SELECT * FROM knowledge_points ORDER BY difficulty DESC LIMIT 3").all();
    }
  }

  const masteryMap = {};
  for (const kp of report.knowledge_points) {
    masteryMap[kp.kp_id] = kp.score;
  }

  const result = [];
  for (const kp of targetKps) {
    const mastery = masteryMap[kp.id] || 50;
    const targetDifficulty = Math.max(1, Math.min(5, Math.round((kp.difficulty || 2) + (mastery < 60 ? -1 : mastery > 80 ? 1 : 0))));

    const questions = db.prepare(
      "SELECT * FROM questions WHERE kp_id = ? AND difficulty = ? ORDER BY RANDOM() LIMIT ?"
    ).all(kp.id, targetDifficulty, Math.ceil(count / targetKps.length));

    if (questions.length === 0) {
      const more = db.prepare(
        "SELECT * FROM questions WHERE kp_id = ? ORDER BY RANDOM() LIMIT ?"
      ).all(kp.id, Math.ceil(count / targetKps.length));
      result.push(...more);
    } else {
      result.push(...questions);
    }
  }

  return result.slice(0, count).sort(() => Math.random() - 0.5);
}

function explainWrongQuestion(question, userAnswer) {
  const errorAnalysis = analyzeError(question, userAnswer, question.answer);

  const relatedKps = [];
  const kp = db.prepare("SELECT * FROM knowledge_points WHERE id = ?").get(question.kp_id);
  if (kp) {
    relatedKps.push({ name: kp.name, desc: kp.description });
    if (kp.prerequisites) {
      const preNames = kp.prerequisites.split(',').map(s => s.trim());
      for (const name of preNames) {
        const preKp = db.prepare("SELECT * FROM knowledge_points WHERE name = ?").get(name);
        if (preKp) relatedKps.push({ name: preKp.name, desc: preKp.description, isPrerequisite: true });
      }
    }
  }

  let exampleQuestion = null;
  const similar = db.prepare(
    "SELECT * FROM questions WHERE kp_id = ? AND id != ? AND difficulty <= ? ORDER BY RANDOM() LIMIT 1"
  ).all(question.kp_id, question.id, question.difficulty);
  if (similar.length > 0) exampleQuestion = similar[0];

  return {
    question: question.question,
    correctAnswer: question.answer,
    userAnswer: userAnswer,
    analysis: question.analysis,
    errorType: errorAnalysis.primary.name,
    errorRatio: errorAnalysis.primary.ratio,
    suggestion: errorAnalysis.suggestion,
    relatedKps,
    exampleQuestion,
    studyTips: generateStudyTips(errorAnalysis.primary.key, kp)
  };
}

function generateStudyTips(errorType, kp) {
  const tips = [];
  tips.push('仔细阅读题目，明确已知条件和所求问题。');
  tips.push('回忆相关知识点，确定解题思路和方法。');
  tips.push('规范书写解题过程，注意步骤的完整性。');
  tips.push('完成后认真检查，验证答案的合理性。');

  if (kp && kp.prerequisites) {
    tips.unshift(`先复习前置知识：${kp.prerequisites}，确保基础扎实。`);
  }

  return tips;
}

function addNotification(userId, type, title, content, link = '') {
  db.prepare(
    "INSERT INTO notifications (user_id, type, title, content, link, is_read) VALUES (?, ?, ?, ?, ?, 0)"
  ).run(userId, type, title, content, link);
}

function calculateClassDiagnosis(classCode) {
  const students = db.prepare("SELECT id, username FROM users WHERE class_code = ? AND role = 'student' AND is_banned = 0").all(classCode);
  if (students.length === 0) return null;

  const kps = db.prepare("SELECT * FROM knowledge_points ORDER BY id").all();
  const kpStats = [];

  for (const kp of kps) {
    let totalScore = 0;
    let studentCount = 0;
    let totalQuestions = 0;
    let totalCorrect = 0;

    for (const student of students) {
      const mastery = calculateMastery(student.id, kp.id);
      if (mastery.total > 0) {
        totalScore += mastery.score;
        studentCount++;
        totalQuestions += mastery.total;
        totalCorrect += mastery.correct;
      }
    }

    const avgScore = studentCount > 0 ? Math.round(totalScore / studentCount) : 0;
    const avgRatio = totalQuestions > 0 ? Math.round(totalCorrect / totalQuestions * 100) : 0;

    let label, color;
    if (avgScore >= 90) { label = '优秀'; color = '#10b981'; }
    else if (avgScore >= 75) { label = '良好'; color = '#6366f1'; }
    else if (avgScore >= 60) { label = '及格'; color = '#f59e0b'; }
    else if (avgScore >= 40) { label = '薄弱'; color = '#f97316'; }
    else { label = '需加强'; color = '#ef4444'; }

    kpStats.push({
      kp_id: kp.id,
      kp_name: kp.name,
      difficulty: kp.difficulty,
      avgScore,
      avgRatio,
      label,
      color,
      studentCount,
      totalQuestions
    });
  }

  const allWrongQuestions = {};
  for (const student of students) {
    const wrongAnswers = db._raw.answers.filter(a => a.user_id === student.id && a.is_correct === 0);
    const groupMap = {};
    for (const a of wrongAnswers) {
      if (!groupMap[a.question_id]) groupMap[a.question_id] = 0;
      groupMap[a.question_id]++;
    }
    for (const [qId, c] of Object.entries(groupMap)) {
      if (!allWrongQuestions[qId]) allWrongQuestions[qId] = 0;
      allWrongQuestions[qId] += c;
    }
  }

  const topWrong = Object.entries(allWrongQuestions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([qId, count]) => {
      const q = db.prepare("SELECT * FROM questions WHERE id = ?").get(parseInt(qId));
      return q ? { ...q, wrong_count: count, wrong_rate: Math.round(count / students.length * 100) } : null;
    })
    .filter(Boolean);

  const studentIds = students.map(s => s.id);
  const allClassAnswers = db._raw.answers.filter(a => studentIds.includes(a.user_id));
  const totalAnswers = allClassAnswers.length;
  const totalCorrect = allClassAnswers.filter(a => a.is_correct === 1).length;

  return {
    class_code: classCode,
    student_count: students.length,
    total_answers: totalAnswers,
    total_correct: totalCorrect,
    overall_accuracy: totalAnswers > 0 ? Math.round(totalCorrect / totalAnswers * 100) : 0,
    knowledge_points: kpStats.sort((a, b) => a.avgScore - b.avgScore),
    top_wrong: topWrong,
    weak_points: kpStats.filter(k => k.avgScore < 60).sort((a, b) => a.avgScore - b.avgScore)
  };
}

module.exports = {
  analyzeError,
  calculateMastery,
  generateDiagnosisReport,
  generateAdaptiveQuestions,
  explainWrongQuestion,
  generateLearningPath,
  addNotification,
  calculateClassDiagnosis,
  ERROR_TYPES
};
