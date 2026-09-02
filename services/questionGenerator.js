function getDb() {
  return require('../config/database');
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function shuffleOptions(correct, distractors) {
  var all = [correct].concat(distractors);
  for (var i = all.length - 1; i > 0; i--) {
    var j = randInt(0, i);
    var tmp = all[i]; all[i] = all[j]; all[j] = tmp;
  }
  var letters = ['A', 'B', 'C', 'D'];
  var answerLetter = '';
  var options = all.map(function(val, idx) {
    if (val === correct) answerLetter = letters[idx];
    return letters[idx] + '. ' + val;
  });
  return { options: JSON.stringify(options), answer: answerLetter };
}

var generators = [];

function genMathSingle1() {
  var a = randInt(2, 9), b = randInt(1, 20), c = a * randInt(2, 9) + b;
  var x = (c - b) / a;
  if (x !== Math.floor(x) || x < -50 || x > 50) return null;
  var result = shuffleOptions(String(x), [String(x + 1), String(x - 1), String(x + 2)]);
  return {
    kp_id: 1, kp_name: '一元一次方程', subject: '数学', difficulty: randInt(1, 2), type: 'single',
    question: '解方程 ' + a + 'x + ' + b + ' = ' + c + '，x = ?',
    options: result.options, answer: result.answer,
    analysis: a + 'x = ' + (c - b) + ' = ' + (c - b) + '，x = ' + x + '。'
  };
}

function genMathSingle2() {
  var b = randInt(1, 9), c = randInt(1, 9);
  var disc = b * b - 4 * c;
  if (disc < 0) return null;
  var sqrtDisc = Math.sqrt(disc);
  if (sqrtDisc !== Math.floor(sqrtDisc)) return null;
  var x1 = (-b + sqrtDisc) / 2, x2 = (-b - sqrtDisc) / 2;
  if (x1 !== Math.floor(x1) || x2 !== Math.floor(x2)) return null;
  var result = shuffleOptions('x=' + x1 + '或x=' + x2, ['x=' + x1 + '或x=' + (x2+1), 'x=' + (x1+1) + '或x=' + x2, '无实数解']);
  return {
    kp_id: 3, kp_name: '一元二次方程', subject: '数学', difficulty: randInt(2, 4), type: 'single',
    question: '方程 x² + ' + b + 'x + ' + c + ' = 0 的解是？',
    options: result.options, answer: result.answer,
    analysis: 'Δ = ' + (b*b) + ' - ' + (4*c) + ' = ' + disc + '，√' + disc + ' = ' + sqrtDisc + '，x = (-' + b + '±' + sqrtDisc + ')/2。'
  };
}

function genMathSingle3() {
  var a = randInt(1, 3), b = randInt(-6, 6), c = randInt(-9, 9);
  var vx = -b / (2 * a);
  if (vx !== Math.floor(vx)) return null;
  var vy = a * vx * vx + b * vx + c;
  if (vy < -100 || vy > 100) return null;
  var result = shuffleChoices('(' + vx + ', ' + vy + ')', ['(' + (vx+1) + ', ' + vy + ')', '(' + vx + ', ' + (vy+1) + ')', '(' + (vx-1) + ', ' + (vy-1) + ')']);
  return {
    kp_id: 4, kp_name: '二次函数', subject: '数学', difficulty: randInt(3, 4), type: 'single',
    question: '函数 y = ' + a + 'x²' + (b >= 0 ? ' + ' : ' - ') + Math.abs(b) + 'x' + (c >= 0 ? ' + ' : ' - ') + Math.abs(c) + ' 的顶点坐标是？',
    options: result.options, answer: result.answer,
    analysis: 'x = -b/(2a) = ' + vx + '，y = ' + vy + '。'
  };
}

function shuffleChoices(correct, distractors) {
  return shuffleOptions(correct, distractors);
}

function genMathSingle4() {
  var base = randChoice([2, 3, 5, 6, 10]), exp1 = randInt(2, 6), exp2 = randInt(2, 6);
  var result = base + (exp1 + exp2);
  var options = shuffleOptions(String(result), [String(result * 2), String(result + base), String(base * exp1 * exp2)]);
  return {
    kp_id: 5, kp_name: '指数函数', subject: '数学', difficulty: randInt(1, 3), type: 'single',
    question: base + '的' + exp1 + '次方 × ' + base + '的' + exp2 + '次方 = ?',
    options: options.options, answer: options.answer,
    analysis: '同底数幂相乘，指数相加：' + base + '^(' + exp1 + '+' + exp2 + ') = ' + base + '^' + (exp1+exp2) + ' = ' + result + '。'
  };
}

function genMathSingle5() {
  var angles = [
    {deg: 0, sin: 0, cos: 1, tan: 0},
    {deg: 30, sin: '1/2', cos: '√3/2', tan: '√3/3'},
    {deg: 45, sin: '√2/2', cos: '√2/2', tan: 1},
    {deg: 60, sin: '√3/2', cos: '1/2', tan: '√3'},
    {deg: 90, sin: 1, cos: 0, tan: '不存在'},
    {deg: 120, sin: '√3/2', cos: '-1/2', tan: '-√3'},
    {deg: 135, sin: '√2/2', cos: '-√2/2', tan: -1},
    {deg: 150, sin: '1/2', cos: '-√3/2', tan: '-√3/3'},
    {deg: 180, sin: 0, cos: -1, tan: 0}
  ];
  var a = randChoice(angles);
  var fns = ['sin', 'cos', 'tan'];
  var fn = randChoice(fns);
  var val = a[fn];
  var distractors = ['0', '1', '-1', '1/2', '√2/2', '√3/2', '√3', '√3/3', '不存在', '-1/2', '-√2/2', '-√3/2', '-√3', '-√3/3'];
  var d = [];
  while (d.length < 3) { var v = randChoice(distractors); if (v !== String(val) && d.indexOf(v) === -1) d.push(v); }
  var result = shuffleOptions(String(val), d);
  return {
    kp_id: 6, kp_name: '三角函数', subject: '数学', difficulty: randInt(2, 3), type: 'single',
    question: fn + a.deg + '° = ?',
    options: result.options, answer: result.answer,
    analysis: fn + a.deg + '° = ' + val + '，这是特殊角三角函数值。'
  };
}

function genMathSingle6() {
  var a1 = randInt(1, 10), d = randInt(1, 5), n = randInt(5, 20);
  var an = a1 + (n - 1) * d;
  var sn = n * (a1 + an) / 2;
  var result = shuffleOptions(String(sn), [String(sn + d), String(sn - d), String(sn + n)]);
  return {
    kp_id: 7, kp_name: '数列', subject: '数学', difficulty: randInt(2, 3), type: 'single',
    question: '等差数列首项a₁=' + a1 + '，公差d=' + d + '，求第' + n + '项a' + n + '的值。',
    options: result.options, answer: result.answer,
    analysis: 'a' + n + ' = a₁ + (n-1)d = ' + a1 + ' + ' + (n-1) + '×' + d + ' = ' + an + '。'
  };
}

function genMathSingle7() {
  var r = randInt(2, 6), h = randInt(3, 10);
  var v = Math.PI * r * r * h;
  var vStr = r * r * h + 'π';
  var result = shuffleOptions(vStr, [(r*r*h+1) + 'π', (r*r*(h+1)) + 'π', (r*r*h-1) + 'π']);
  return {
    kp_id: 9, kp_name: '立体几何', subject: '数学', difficulty: randInt(2, 3), type: 'single',
    question: '圆柱底面半径为' + r + '，高为' + h + '，体积为？',
    options: result.options, answer: result.answer,
    analysis: 'V = πr²h = π × ' + (r*r) + ' × ' + h + ' = ' + vStr + '。'
  };
}

function genMathSingle8() {
  var x1 = randInt(-5, 5), y1 = randInt(-5, 5), x2 = randInt(-5, 5), y2 = randInt(-5, 5);
  if (x2 - x1 === 0) return null;
  var k = (y2 - y1) / (x2 - x1);
  if (k !== Math.floor(k) || k < -10 || k > 10) return null;
  var result = shuffleOptions(String(k), [String(k + 1), String(k - 1), String(k + 2)]);
  return {
    kp_id: 10, kp_name: '解析几何', subject: '数学', difficulty: randInt(2, 3), type: 'single',
    question: '过点(' + x1 + ', ' + y1 + ')和(' + x2 + ', ' + y2 + ')的直线斜率是？',
    options: result.options, answer: result.answer,
    analysis: 'k = (y₂-y₁)/(x₂-x₁) = (' + y2 + '-' + y1 + ')/(' + x2 + '-' + x1 + ') = ' + k + '。'
  };
}

function genMathSingle9() {
  var total = randInt(5, 10), pick = randInt(2, 4);
  if (pick > total) return null;
  var num = 1, den = 1;
  for (var i = 0; i < pick; i++) { num *= (total - i); den *= (i + 1); }
  var result = num / den;
  if (result !== Math.floor(result) || result > 500) return null;
  var result2 = shuffleOptions(String(result), [String(result + 1), String(result - 1), String(result + total)]);
  return {
    kp_id: 13, kp_name: '概率统计', subject: '数学', difficulty: randInt(2, 3), type: 'single',
    question: '从' + total + '个球中任取' + pick + '个，共有多少种取法？',
    options: result2.options, answer: result2.answer,
    analysis: 'C(' + total + ',' + pick + ') = ' + total + '!/(' + pick + '!×' + (total-pick) + '!) = ' + result + '。'
  };
}

function genMathFill1() {
  var a = randInt(2, 9), b = randInt(1, 9);
  var c = a + b;
  return {
    kp_id: 15, kp_name: '集合与逻辑', subject: '数学', difficulty: 1, type: 'fill',
    question: '设集合A={' + a + ', ' + b + ', ' + c + '}，则A中的元素个数为____',
    options: '[]', answer: '3',
    analysis: '集合A中有' + a + '、' + b + '、' + c + '三个元素。'
  };
}

function genMathFill2() {
  var a = randInt(2, 9), x = randInt(2, 9);
  var result = Math.pow(a, x);
  if (result > 10000) return null;
  return {
    kp_id: 5, kp_name: '指数函数', subject: '数学', difficulty: 2, type: 'fill',
    question: '计算：' + a + '的' + x + '次方 = ____',
    options: '[]', answer: String(result),
    analysis: a + '的' + x + '次方 = ' + result + '。'
  };
}

function genMathFill3() {
  var n = randInt(3, 6), d = randInt(1, 5);
  var terms = [];
  for (var i = 0; i < n; i++) terms.push(1 + i * d);
  return {
    kp_id: 7, kp_name: '数列', subject: '数学', difficulty: 2, type: 'fill',
    question: '等差数列：' + terms.join(', ') + ', ... 的公差是____',
    options: '[]', answer: String(d),
    analysis: '后项减前项：' + terms[1] + ' - ' + terms[0] + ' = ' + d + '。'
  };
}

function genMathFill4() {
  var a = randInt(1, 5), b = randInt(1, 5);
  var result = a * a + b * b;
  return {
    kp_id: 14, kp_name: '向量', subject: '数学', difficulty: 2, type: 'fill',
    question: '向量a=(' + a + ', ' + b + ')，|a| = ____',
    options: '[]', answer: '√' + result,
    analysis: '|a| = √(x² + y²) = √(' + (a*a) + ' + ' + (b*b) + ') = √' + result + '。'
  };
}

function genMathJudge1() {
  var a = randInt(2, 9), b = randInt(2, 9);
  var isRight = randInt(0, 1);
  var actual = a * b;
  var shown = isRight ? actual : (actual + randChoice([-1, 1, 2]));
  return {
    kp_id: 1, kp_name: '一元一次方程', subject: '数学', difficulty: 1, type: 'judge',
    question: shown + ' = ' + a + ' × ' + b + '。',
    options: '[]', answer: isRight ? '正确' : '错误',
    analysis: a + ' × ' + b + ' = ' + actual + (isRight ? '，判断正确。' : '，实际值为' + actual + '，判断错误。')
  };
}

function genMathJudge2() {
  var a = randInt(1, 4), b = randInt(-5, 5), c = randInt(-9, 9);
  var vx = -b / (2 * a);
  if (vx !== Math.floor(vx)) return null;
  var vy = a * vx * vx + b * vx + c;
  var isRight = randInt(0, 1);
  var shownVy = isRight ? vy : vy + randChoice([-1, 1, 2]);
  return {
    kp_id: 4, kp_name: '二次函数', subject: '数学', difficulty: 3, type: 'judge',
    question: '函数 y = ' + a + 'x²' + (b >= 0 ? ' + ' : ' - ') + Math.abs(b) + 'x' + (c >= 0 ? ' + ' : ' - ') + Math.abs(c) + ' 的顶点纵坐标是' + shownVy + '。',
    options: '[]', answer: isRight ? '正确' : '错误',
    analysis: '顶点x = ' + vx + '，y = ' + vy + '。'
  };
}

function genMathJudge3() {
  var angles = [30, 45, 60, 90, 180, 0];
  var angle = randChoice(angles);
  var isRight = randInt(0, 1);
  var tanVal = angle === 90 ? '不存在' : (angle === 30 ? '√3/3' : angle === 45 ? '1' : angle === 60 ? '√3' : angle === 180 ? '0' : '0');
  var shownVal = isRight ? tanVal : randChoice(['0', '1', '√3', '1/2', '不存在']);
  return {
    kp_id: 6, kp_name: '三角函数', subject: '数学', difficulty: 2, type: 'judge',
    question: 'tan' + angle + '° = ' + shownVal + '。',
    options: '[]', answer: isRight ? '正确' : '错误',
    analysis: 'tan' + angle + '° = ' + tanVal + '。'
  };
}

function genPhysicsSingle1() {
  var m = randInt(1, 10), a = randInt(2, 20);
  var F = m * a;
  var result = shuffleOptions(F + ' N', [(F + 1) + ' N', (F - 1) + ' N', (m * a + m) + ' N']);
  return {
    kp_id: 1, kp_name: '物理-力学', subject: '物理', difficulty: randInt(1, 3), type: 'single',
    question: '质量为' + m + 'kg的物体，加速度为' + a + 'm/s²，所受合力为？',
    options: result.options, answer: result.answer,
    analysis: 'F = ma = ' + m + ' × ' + a + ' = ' + F + ' N。'
  };
}

function genPhysicsSingle2() {
  var U = randChoice([6, 12, 24, 36, 110, 220]), R = randInt(2, 20);
  var I = U / R;
  if (I !== Math.floor(I) && I !== Math.round(I * 10) / 10) return null;
  var Istr = Number.isInteger(I) ? String(I) : I.toFixed(1);
  var result = shuffleOptions(Istr + ' A', [(parseFloat(Istr) + 1) + ' A', (parseFloat(Istr) - 0.5) + ' A', (U - R) + ' A']);
  return {
    kp_id: 2, kp_name: '物理-电学', subject: '物理', difficulty: randInt(2, 3), type: 'single',
    question: '电阻R=' + R + 'Ω两端电压U=' + U + 'V，通过电阻的电流I为？',
    options: result.options, answer: result.answer,
    analysis: 'I = U/R = ' + U + '/' + R + ' = ' + Istr + ' A。'
  };
}

function genPhysicsSingle3() {
  var v0 = randInt(0, 10), a = randInt(2, 10), t = randInt(2, 10);
  var v = v0 + a * t;
  var result = shuffleOptions(v + ' m/s', [(v + 1) + ' m/s', (v - 1) + ' m/s', (v + a) + ' m/s']);
  return {
    kp_id: 3, kp_name: '物理-运动学', subject: '物理', difficulty: randInt(1, 2), type: 'single',
    question: '物体初速度v₀=' + v0 + 'm/s，加速度a=' + a + 'm/s²，经过' + t + 's后速度为？',
    options: result.options, answer: result.answer,
    analysis: 'v = v₀ + at = ' + v0 + ' + ' + a + '×' + t + ' = ' + v + ' m/s。'
  };
}

function genPhysicsSingle4() {
  var m = randInt(1, 10), v = randInt(2, 15);
  var Ek = 0.5 * m * v * v;
  var result = shuffleOptions(Ek + ' J', [(Ek + 1) + ' J', (Ek - 1) + ' J', (m * v * v) + ' J']);
  return {
    kp_id: 4, kp_name: '物理-能量', subject: '物理', difficulty: randInt(2, 3), type: 'single',
    question: '质量' + m + 'kg的物体以' + v + 'm/s运动，动能为？',
    options: result.options, answer: result.answer,
    analysis: 'Ek = ½mv² = 0.5 × ' + m + ' × ' + v + '² = ' + Ek + ' J。'
  };
}

function genPhysicsFill1() {
  var g = 10, h = randInt(5, 50);
  var v = Math.sqrt(2 * g * h);
  var vInt = Math.round(v);
  if (vInt < 1) return null;
  return {
    kp_id: 3, kp_name: '物理-运动学', subject: '物理', difficulty: 2, type: 'fill',
    question: '物体从高' + h + 'm处自由下落(g=10m/s²)，落地速度为____m/s',
    options: '[]', answer: String(vInt),
    analysis: 'v² = 2gh = 2×10×' + h + ' = ' + (2*g*h) + '，v = √' + (2*g*h) + ' ≈ ' + vInt + ' m/s。'
  };
}

function genPhysicsJudge1() {
  var m = randInt(1, 5), g = 10;
  var G = m * g;
  var isRight = randInt(0, 1);
  var shown = isRight ? G : (G + randChoice([-1, 1, 2, -2]));
  return {
    kp_id: 1, kp_name: '物理-力学', subject: '物理', difficulty: 1, type: 'judge',
    question: '质量' + m + 'kg的物体重力为' + shown + 'N。(g=10N/kg)',
    options: '[]', answer: isRight ? '正确' : '错误',
    analysis: 'G = mg = ' + m + ' × 10 = ' + G + ' N。'
  };
}

function genEnglishSingle1() {
  var verbs = [
    {base: 'go', third: 'goes', past: 'went', pp: 'gone', ing: 'going'},
    {base: 'eat', third: 'eats', past: 'ate', pp: 'eaten', ing: 'eating'},
    {base: 'see', third: 'sees', past: 'saw', pp: 'seen', ing: 'seeing'},
    {base: 'take', third: 'takes', past: 'took', pp: 'taken', ing: 'taking'},
    {base: 'make', third: 'makes', past: 'made', pp: 'made', ing: 'making'},
    {base: 'write', third: 'writes', past: 'wrote', pp: 'written', ing: 'writing'},
    {base: 'read', third: 'reads', past: 'read', pp: 'read', ing: 'reading'},
    {base: 'swim', third: 'swims', past: 'swam', pp: 'swum', ing: 'swimming'},
    {base: 'run', third: 'runs', past: 'ran', pp: 'run', ing: 'running'},
    {base: 'come', third: 'comes', past: 'came', pp: 'come', ing: 'coming'},
    {base: 'give', third: 'gives', past: 'gave', pp: 'given', ing: 'giving'},
    {base: 'know', third: 'knows', past: 'knew', pp: 'known', ing: 'knowing'},
    {base: 'grow', third: 'grows', past: 'grew', pp: 'grown', ing: 'growing'},
    {base: 'throw', third: 'throws', past: 'threw', pp: 'thrown', ing: 'throwing'},
    {base: 'fly', third: 'flies', past: 'flew', pp: 'flown', ing: 'flying'},
    {base: 'drink', third: 'drinks', past: 'drank', pp: 'drunk', ing: 'drinking'},
    {base: 'sing', third: 'sings', past: 'sang', pp: 'sung', ing: 'singing'},
    {base: 'ring', third: 'rings', past: 'rang', pp: 'rung', ing: 'ringing'},
    {base: 'wear', third: 'wears', past: 'wore', pp: 'worn', ing: 'wearing'},
    {base: 'teach', third: 'teaches', past: 'taught', pp: 'taught', ing: 'teaching'}
  ];
  var v = randChoice(verbs);
  var forms = ['第三人称单数', '过去式', '过去分词', '现在分词'];
  var formIdx = randInt(0, 3);
  var formVal = [v.third, v.past, v.pp, v.ing][formIdx];
  var allForms = [v.base, v.third, v.past, v.pp, v.ing].filter(function(f, i, arr) { return arr.indexOf(f) === i; });
  var distractors = allForms.filter(function(f) { return f !== formVal; }).slice(0, 3);
  while (distractors.length < 3) { distractors.push(randChoice(verbs)[['third','past','pp','ing'][randInt(0,3)]]); }
  var result = shuffleOptions(formVal, distractors);
  return {
    kp_id: 1, kp_name: '英语-语法', subject: '英语', difficulty: randInt(1, 3), type: 'single',
    question: '动词 "' + v.base + '" 的' + forms[formIdx] + '是？',
    options: result.options, answer: result.answer,
    analysis: v.base + ' 的' + forms[formIdx] + '是 ' + formVal + '。'
  };
}

function genEnglishFill1() {
  var pairs = [
    {word: 'happy', opp: 'sad'}, {word: 'big', opp: 'small'}, {word: 'hot', opp: 'cold'},
    {word: 'fast', opp: 'slow'}, {word: 'tall', opp: 'short'}, {word: 'old', opp: 'young'},
    {word: 'good', opp: 'bad'}, {word: 'up', opp: 'down'}, {word: 'open', opp: 'close'},
    {word: 'long', opp: 'short'}, {word: 'full', opp: 'empty'}, {word: 'light', opp: 'dark'},
    {word: 'hard', opp: 'easy'}, {word: 'right', opp: 'wrong'}, {word: 'rich', opp: 'poor'},
    {word: 'strong', opp: 'weak'}, {word: 'clean', opp: 'dirty'}, {word: 'safe', opp: 'dangerous'},
    {word: 'cheap', opp: 'expensive'}, {word: 'wide', opp: 'narrow'}
  ];
  var p = randChoice(pairs);
  return {
    kp_id: 2, kp_name: '英语-词汇', subject: '英语', difficulty: 1, type: 'fill',
    question: 'What is the opposite of "' + p.word + '"? ____',
    options: '[]', answer: p.opp,
    analysis: p.word + '（' + (p.word === 'happy' ? '快乐' : p.word === 'big' ? '大' : p.word === 'hot' ? '热' : '...') + '）的反义词是 ' + p.opp + '。'
  };
}

function genChemSingle1() {
  var elements = [
    {sym: 'H', name: '氢', no: 1}, {sym: 'C', name: '碳', no: 6}, {sym: 'N', name: '氮', no: 7},
    {sym: 'O', name: '氧', no: 8}, {sym: 'Na', name: '钠', no: 11}, {sym: 'Mg', name: '镁', no: 12},
    {sym: 'Al', name: '铝', no: 13}, {sym: 'S', name: '硫', no: 16}, {sym: 'Cl', name: '氯', no: 17},
    {sym: 'K', name: '钾', no: 19}, {sym: 'Ca', name: '钙', no: 20}, {sym: 'Fe', name: '铁', no: 26},
    {sym: 'Cu', name: '铜', no: 29}, {sym: 'Zn', name: '锌', no: 30}, {sym: 'Ag', name: '银', no: 47},
    {sym: 'Au', name: '金', no: 79}, {sym: 'He', name: '氦', no: 2}, {sym: 'Ne', name: '氖', no: 10},
    {sym: 'P', name: '磷', no: 15}, {sym: 'Si', name: '硅', no: 14}
  ];
  var e = randChoice(elements);
  var isSym = randInt(0, 1);
  var correct = isSym ? e.no : (isSym ? e.no : e.sym);
  var question = isSym ? '元素"' + e.sym + '"的原子序数是？' : '原子序数为' + e.no + '的元素符号是？';
  var correctVal = isSym ? String(e.no) : e.sym;
  var distractors = [];
  if (isSym) {
    while (distractors.length < 3) { var n = randInt(1, 80); if (n !== e.no && distractors.indexOf(String(n)) === -1) distractors.push(String(n)); }
  } else {
    var syms = elements.filter(function(el) { return el.sym !== e.sym; }).map(function(el) { return el.sym; });
    while (distractors.length < 3) { var s = randChoice(syms); if (distractors.indexOf(s) === -1) distractors.push(s); }
  }
  var result = shuffleOptions(correctVal, distractors);
  return {
    kp_id: 1, kp_name: '化学-元素', subject: '化学', difficulty: randInt(1, 2), type: 'single',
    question: question, options: result.options, answer: result.answer,
    analysis: e.name + '（' + e.sym + '）的原子序数是' + e.no + '。'
  };
}

function genChineseSingle1() {
  var idioms = [
    {idiom: '画蛇添足', meaning: '比喻做了多余的事'},
    {idiom: '守株待兔', meaning: '比喻不主动努力而存万一的侥幸心理'},
    {idiom: '亡羊补牢', meaning: '比喻出了问题以后想办法补救'},
    {idiom: '刻舟求剑', meaning: '比喻拘泥固执不知变通'},
    {idiom: '掩耳盗铃', meaning: '比喻自欺欺人'},
    {idiom: '拔苗助长', meaning: '比喻违反事物发展规律急于求成'},
    {idiom: '南辕北辙', meaning: '比喻行动和目的相反'},
    {idiom: '叶公好龙', meaning: '比喻表面上爱好某事物实际上并非真爱'},
    {idiom: '狐假虎威', meaning: '比喻仰仗别人的权势来欺压人'},
    {idiom: '对牛弹琴', meaning: '比喻对不懂事理的人讲道理'},
    {idiom: '画龙点睛', meaning: '比喻在关键处加一笔使整体更生动'},
    {idiom: '锦上添花', meaning: '比喻使美好的事物更加美好'},
    {idiom: '雪中送炭', meaning: '比喻在别人急需时给予帮助'},
    {idiom: '井底之蛙', meaning: '比喻见识短浅的人'},
    {idiom: '愚公移山', meaning: '比喻有毅力不怕困难'},
    {idiom: '熟能生巧', meaning: '熟练了就能产生巧办法'},
    {idiom: '水滴石穿', meaning: '坚持不懈就能成功'},
    {idiom: '百发百中', meaning: '形容射术高明或料事如神'},
    {idiom: '一箭双雕', meaning: '比喻一举两得'},
    {idiom: '举一反三', meaning: '从一件事类推到其他事'},
    {idiom: '循序渐进', meaning: '按顺序逐步前进'},
    {idiom: '学而不厌', meaning: '学习总感到不满足'},
    {idiom: '温故知新', meaning: '复习旧知识获得新理解'},
    {idiom: '不耻下问', meaning: '向不如自己的人请教不以为耻'},
    {idiom: '三人行必有我师', meaning: '每个人都有值得学习的地方'},
    {idiom: '吹毛求疵', meaning: '故意挑剔毛病'},
    {idiom: '杯弓蛇影', meaning: '比喻疑神疑鬼自相惊扰'},
    {idiom: '草木皆兵', meaning: '形容极度惊慌时疑神疑鬼'},
    {idiom: '风声鹤唳', meaning: '形容惊慌失措'},
    {idiom: '纸上谈兵', meaning: '比喻空谈理论不能解决实际问题'}
  ];
  var idiom = randChoice(idioms);
  var others = idioms.filter(function(i) { return i.idiom !== idiom.idiom; });
  var distractors = [];
  while (distractors.length < 3) { var o = randChoice(others); if (distractors.indexOf(o.meaning) === -1) distractors.push(o.meaning); }
  var result = shuffleOptions(idiom.meaning, distractors);
  return {
    kp_id: 1, kp_name: '语文-成语', subject: '语文', difficulty: randInt(1, 3), type: 'single',
    question: '成语"' + idiom.idiom + '"的意思是？',
    options: result.options, answer: result.answer,
    analysis: idiom.idiom + '：' + idiom.meaning + '。'
  };
}

generators = [
  genMathSingle1, genMathSingle2, genMathSingle3, genMathSingle4, genMathSingle5,
  genMathSingle6, genMathSingle7, genMathSingle8, genMathSingle9,
  genMathFill1, genMathFill2, genMathFill3, genMathFill4,
  genMathJudge1, genMathJudge2, genMathJudge3,
  genPhysicsSingle1, genPhysicsSingle2, genPhysicsSingle3, genPhysicsSingle4,
  genPhysicsFill1, genPhysicsJudge1,
  genEnglishSingle1, genEnglishFill1,
  genChemSingle1, genChineseSingle1
];

function generateBatch(count) {
  var questions = [];
  var seen = {};
  var attempts = 0;
  var maxAttempts = count * 10;

  while (questions.length < count && attempts < maxAttempts) {
    attempts++;
    var gen = randChoice(generators);
    try {
      var q = gen();
      if (!q) continue;
      var key = q.question;
      if (seen[key]) continue;
      seen[key] = true;
      questions.push(q);
    } catch(e) {
      continue;
    }
  }
  return questions;
}

function populateDatabase(targetCount, dbInstance) {
  var db = dbInstance || getDb();
  var raw = db._raw || (db._raw = db);
  var questions = raw.questions || [];
  var existing = questions.length;
  var needed = targetCount - existing;
  if (needed <= 0) return { total: existing, added: 0 };

  var batch = generateBatch(needed);
  var added = 0;
  var seq = raw._seq || (raw._seq = { questions: 0 });
  for (var i = 0; i < batch.length; i++) {
    var q = batch[i];
    seq.questions = (seq.questions || 0) + 1;
    questions.push({
      id: seq.questions,
      kp_id: q.kp_id,
      kp_name: q.kp_name,
      subject: q.subject,
      difficulty: q.difficulty,
      type: q.type,
      question: q.question,
      options: q.options,
      answer: q.answer,
      analysis: q.analysis,
      source: 'GENERATED',
      created_by: 'system',
      created_at: new Date().toISOString()
    });
    added++;
  }
  if (added > 0 && typeof db._saveNow === 'function') db._saveNow();
  return { total: existing + added, added: added };
}

module.exports = {
  generateBatch: generateBatch,
  populateDatabase: populateDatabase,
  generators: generators
};
