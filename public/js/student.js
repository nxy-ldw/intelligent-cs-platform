let kbData = { items: [], categories: [] };
let currentKbCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  const userStr = localStorage.getItem('user');
  if (!userStr) { window.location.href = '/'; return; }
  const user = JSON.parse(userStr);

  document.getElementById('userAvatar').textContent = getInitials(user.username);
  document.getElementById('userName').textContent = user.username;

  checkMaintenance();
  loadAnnouncements();

  loadDashboard();
  loadChatHistory();
  loadKnowledgeBase();
  loadProjectInfo();
  loadClassInfo();
  loadLogs();

  document.getElementById('chatInput').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
});

async function loadDashboard() {
  try {
    const data = await API.get('/api/student/chat/history');
    document.getElementById('chatCount').textContent = data.history.length;

    const kb = await API.get('/api/student/knowledge-base');
    document.getElementById('kbCount').textContent = kb.items.length;
  } catch (err) {}
}

async function loadChatHistory() {
  try {
    const data = await API.get('/api/student/chat/history');
    if (data.history.length === 0) return;

    const messagesEl = document.getElementById('chatMessages');
    messagesEl.innerHTML = '';
    for (const msg of data.history) {
      addMessageToUI(msg.role, msg.content, msg.intent, msg.confidence, false);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {}
}

function addMessageToUI(role, content, intent, confidence, animate = true) {
  const messagesEl = document.getElementById('chatMessages');
  const isUser = role === 'user';
  const div = document.createElement('div');
  div.className = `chat-message ${isUser ? 'user' : 'ai'}`;

  let metaHtml = '';
  if (!isUser && intent && intent !== '未识别') {
    const confClass = confidence > 0.7 ? 'badge-success' : confidence > 0.4 ? 'badge-warning' : 'badge-danger';
    metaHtml = `<div class="chat-meta">
      <span class="badge ${confClass}">置信度 ${Math.round(confidence * 100)}%</span>
      <span class="badge badge-secondary">${escapeHtml(intent)}</span>
    </div>`;
  }

  div.innerHTML = `
    <div class="chat-avatar ${isUser ? 'user' : 'ai'}">${isUser ? '👤' : '🤖'}</div>
    <div>
      <div class="chat-bubble">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
      ${metaHtml}
    </div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTypingIndicator() {
  const messagesEl = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-message ai';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="chat-avatar ai">🤖</div>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function sendQuickMessage(msg) {
  document.getElementById('chatInput').value = msg;
  sendMessage();
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  input.style.height = 'auto';

  addMessageToUI('user', message);
  document.getElementById('sendBtn').disabled = true;

  showTypingIndicator();

  try {
    const result = await API.post('/api/student/chat', { message });
    removeTypingIndicator();

    if (result.needEscalation) {
      const messagesEl = document.getElementById('chatMessages');
      const banner = document.createElement('div');
      banner.className = 'escalation-banner';
      banner.innerHTML = `<span style="font-size:20px;">⚠️</span><span>${escapeHtml(result.content)}</span>`;
      messagesEl.insertBefore(banner, messagesEl.lastChild);
    }

    addMessageToUI('assistant', result.content, result.intent, result.confidence);

    if (result.suggestions && result.suggestions.length > 0) {
      const messagesEl = document.getElementById('chatMessages');
      const lastMsg = messagesEl.lastElementChild;
      if (lastMsg) {
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'chat-suggestions';
        for (const s of result.suggestions) {
          const chip = document.createElement('span');
          chip.className = 'suggestion-chip';
          chip.textContent = s;
          chip.onclick = () => { sendQuickMessage(s); };
          suggestionsDiv.appendChild(chip);
        }
        lastMsg.querySelector('div:last-child').appendChild(suggestionsDiv);
      }
    }
  } catch (err) {
    removeTypingIndicator();
    addMessageToUI('assistant', '抱歉，处理您的请求时出现错误：' + err.message);
  } finally {
    document.getElementById('sendBtn').disabled = false;
    document.getElementById('chatInput').focus();
  }
}

async function clearChat() {
  try {
    await API.del('/api/student/chat/history');
    document.getElementById('chatMessages').innerHTML = `
      <div class="chat-message ai">
        <div class="chat-avatar ai">🤖</div>
        <div>
          <div class="chat-bubble">对话已清空。请问有什么可以帮您的？</div>
          <div class="chat-suggestions">
            <span class="suggestion-chip" onclick="sendQuickMessage('系统是做什么的？')">系统是做什么的？</span>
            <span class="suggestion-chip" onclick="sendQuickMessage('核心功能有哪些？')">核心功能有哪些？</span>
            <span class="suggestion-chip" onclick="sendQuickMessage('知识库包含哪些内容？')">知识库包含哪些内容？</span>
          </div>
        </div>
      </div>`;
    showToast('对话已清空', 'success');
  } catch (err) {
    showToast('清空失败', 'error');
  }
}

async function loadKnowledgeBase() {
  try {
    const data = await API.get('/api/student/knowledge-base');
    kbData = data;
    renderCategories();
    renderKnowledge(kbData.items);
  } catch (err) {
    showToast('加载知识库失败', 'error');
  }
}

function renderCategories() {
  const el = document.getElementById('kbCategories');
  let html = `<span class="kb-category-chip active" onclick="filterByCategory('all', this)">全部</span>`;
  for (const cat of kbData.categories) {
    html += `<span class="kb-category-chip" onclick="filterByCategory('${escapeHtml(cat)}', this)">${escapeHtml(cat)}</span>`;
  }
  el.innerHTML = html;
}

function filterByCategory(cat, el) {
  currentKbCategory = cat;
  document.querySelectorAll('.kb-category-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  let items = kbData.items;
  if (cat !== 'all') {
    items = items.filter(i => i.category === cat);
  }
  const searchVal = document.getElementById('kbSearch').value;
  if (searchVal) {
    items = items.filter(i => i.question.includes(searchVal) || i.answer.includes(searchVal));
  }
  renderKnowledge(items);
}

function filterKnowledge(val) {
  let items = kbData.items;
  if (currentKbCategory !== 'all') {
    items = items.filter(i => i.category === currentKbCategory);
  }
  if (val) {
    items = items.filter(i => i.question.includes(val) || i.answer.includes(val));
  }
  renderKnowledge(items);
}

function renderKnowledge(items) {
  const el = document.getElementById('kbList');
  if (items.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">暂无知识条目</div></div>';
    return;
  }
  let html = '';
  for (const item of items) {
    html += `
      <div class="kb-item">
        <div class="kb-cat">${escapeHtml(item.category)}</div>
        <div class="kb-q">${escapeHtml(item.question)}</div>
        <div class="kb-a">${escapeHtml(item.answer)}</div>
      </div>`;
  }
  el.innerHTML = html;
}

async function loadProjectInfo() {
  try {
    const data = await API.get('/api/student/project-info');

    document.getElementById('projectInfo').innerHTML = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-size:48px;margin-bottom:12px;">🤖</div>
        <h2 style="font-size:22px;font-weight:800;">${escapeHtml(data.title)}</h2>
        <p style="color:var(--text-light);font-size:14px;margin-top:4px;">${escapeHtml(data.subtitle)}</p>
      </div>
      <div style="background:var(--gradient-card);border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="font-size:14px;line-height:1.8;color:var(--text-medium);">${escapeHtml(data.description)}</p>
      </div>
    `;

    document.getElementById('featuresList').innerHTML = `
      <div class="feature-grid">
        ${data.features.map(f => `
          <div class="feature-card">
            <div class="feature-icon">${getFeatureIcon(f.icon)}</div>
            <div class="feature-title">${escapeHtml(f.name)}</div>
            <div class="feature-desc">${escapeHtml(f.desc)}</div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('archList').innerHTML = `
      <div class="architecture-layers">
        ${data.architecture.map((a, i) => `
          <div class="arch-layer">
            <div class="arch-index">${i + 1}</div>
            <div class="arch-info">
              <div class="arch-name">${escapeHtml(a.layer)}</div>
              <div class="arch-desc">${escapeHtml(a.desc)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('kpiList').innerHTML = `
      <div class="kpi-list">
        ${data.kpis.map(k => `
          <div class="kpi-item">
            <div class="kpi-name">${escapeHtml(k.name)}</div>
            <div class="kpi-target">${escapeHtml(k.target)}</div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('phaseList').innerHTML = `
      <div class="phase-timeline">
        ${data.phases.map(p => `
          <div class="phase-item">
            <span class="phase-badge">${escapeHtml(p.phase)}</span>
            <div class="phase-name">${escapeHtml(p.name)}</div>
            <div class="phase-desc">${escapeHtml(p.desc)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    showToast('加载项目信息失败', 'error');
  }
}

function getFeatureIcon(icon) {
  const map = { chat: '💬', book: '📚', route: '🔀', device: '📱', chart: '📊', shield: '🛡️' };
  return map[icon] || '✨';
}

async function loadClassInfo() {
  try {
    const data = await API.get('/api/student/my-class');
    const el = document.getElementById('classContent');

    if (data.class) {
      document.getElementById('classStatus').textContent = '已加入';
      el.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div class="class-joined-card">
              <div class="class-info-icon">🎓</div>
              <div style="flex:1;">
                <div style="font-size:18px;font-weight:700;">${escapeHtml(data.class.class_name)}</div>
                <div style="font-size:14px;color:var(--text-light);margin-top:4px;">
                  班级代码：${escapeHtml(data.class.class_code)} | 教师：${escapeHtml(data.class.teacher_name)}
                </div>
              </div>
            </div>
          </div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="card">
          <div class="card-body join-class-card">
            <div class="join-class-icon">🎓</div>
            <h2 style="font-size:20px;font-weight:700;margin-bottom:8px;">加入班级</h2>
            <p style="color:var(--text-light);margin-bottom:24px;">请输入教师提供的班级代码加入对应班级</p>
            <div class="form-group" style="text-align:left;">
              <input type="text" class="form-control" id="classCodeInput" placeholder="请输入班级代码" style="text-align:center;font-size:18px;letter-spacing:2px;">
            </div>
            <button class="btn btn-primary" style="width:100%;padding:12px;font-size:15px;" onclick="joinClass()">加入班级</button>
          </div>
        </div>`;
    }
  } catch (err) {
    showToast('加载班级信息失败', 'error');
  }
}

async function joinClass() {
  const code = document.getElementById('classCodeInput').value.trim();
  if (!code) { showToast('请输入班级代码', 'warning'); return; }

  try {
    await API.post('/api/student/join-class', { classCode: code });
    showToast('成功加入班级', 'success');
    loadClassInfo();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadLogs() {
  try {
    const data = await API.get('/api/student/logs');
    const el = document.getElementById('logsBody');
    if (data.logs.length === 0) {
      el.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-light);">暂无活动记录</td></tr>';
      return;
    }
    let html = '';
    for (const log of data.logs) {
      const actionMap = { login: '登录', join_class: '加入班级', chat: 'AI对话', identity_change: '身份变更' };
      html += `<tr>
        <td><span class="badge badge-primary">${escapeHtml(actionMap[log.action] || log.action)}</span></td>
        <td>${escapeHtml(log.detail)}</td>
        <td style="white-space:nowrap;">${formatDate(log.created_at)}</td>
      </tr>`;
    }
    el.innerHTML = html;
  } catch (err) {}
}
