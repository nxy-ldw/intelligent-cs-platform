let teacherClasses = [];
let kbDataT = { items: [], categories: [] };

document.addEventListener('DOMContentLoaded', async () => {
  const userStr = localStorage.getItem('user');
  if (!userStr) { window.location.href = '/'; return; }
  const user = JSON.parse(userStr);

  document.getElementById('userAvatar').textContent = getInitials(user.username);
  document.getElementById('userName').textContent = user.username;

  checkMaintenance();
  loadAnnouncements();

  loadDashboard();
  loadClasses();
  loadStudents();
  loadProjectInfo();
  loadKnowledgeBase();
  initChat();
});

async function loadDashboard() {
  try {
    const data = await API.get('/api/teacher/classes');
    teacherClasses = data.classes;
    const totalStudents = data.classes.reduce((sum, c) => sum + (c.studentCount || 0), 0);

    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(99,102,241,0.1)">🏫</div>
        <div class="stat-value">${data.classes.length}</div>
        <div class="stat-label">班级数量</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(16,185,129,0.1)">👥</div>
        <div class="stat-value">${totalStudents}</div>
        <div class="stat-label">学生总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(245,158,11,0.1)">✨</div>
        <div class="stat-value">6</div>
        <div class="stat-label">核心功能模块</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:rgba(139,92,246,0.1)">📚</div>
        <div class="stat-value">${kbDataT.items.length || '...'}</div>
        <div class="stat-label">知识库条目</div>
      </div>
    `;

    const studentsData = await API.get('/api/teacher/students');
    const recent = studentsData.students.slice(0, 5);
    const tbody = document.getElementById('recentStudents');
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-light);">暂无学生</td></tr>';
    } else {
      tbody.innerHTML = recent.map(s => `
        <tr>
          <td><strong>${escapeHtml(s.username)}</strong></td>
          <td>${escapeHtml(s.class_code || '-')}</td>
          <td>${s.identity ? `<span class="badge badge-secondary">${escapeHtml(s.identity)}</span>` : '<span style="color:var(--text-light);">未设置</span>'}</td>
          <td>${s.is_banned ? '<span class="badge badge-danger">已封禁</span>' : '<span class="badge badge-success">正常</span>'}</td>
          <td style="white-space:nowrap;">${formatDate(s.created_at)}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast('加载仪表盘失败', 'error');
  }
}

async function loadClasses() {
  try {
    const data = await API.get('/api/teacher/classes');
    teacherClasses = data.classes;

    const filterEl = document.getElementById('classFilter');
    if (filterEl) {
      filterEl.innerHTML = '<option value="">全部班级</option>' +
        data.classes.map(c => `<option value="${c.class_code}">${escapeHtml(c.class_name)}</option>`).join('');
    }

    const el = document.getElementById('classList');
    if (data.classes.length === 0) {
      el.innerHTML = `
        <div class="card">
          <div class="card-body empty-state">
            <div class="empty-icon">🏫</div>
            <div class="empty-text">暂无班级，点击右上角创建班级</div>
          </div>
        </div>`;
      return;
    }

    let html = '';
    for (const cls of data.classes) {
      html += `
        <div class="card" style="margin-bottom:16px;">
          <div class="card-body">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
              <div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                  <h3 style="font-size:18px;font-weight:700;">${escapeHtml(cls.class_name)}</h3>
                  <span class="badge badge-primary">${cls.studentCount || 0} 名学生</span>
                </div>
                <div style="color:var(--text-light);font-size:13px;">创建时间：${formatDate(cls.created_at)}</div>
              </div>
              <div class="class-code-box">
                <div style="font-size:12px;color:var(--text-light);margin-bottom:4px;">班级代码（学生用此码加入）</div>
                <div class="class-code-value">${escapeHtml(cls.class_code)}</div>
                <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="copyCode('${cls.class_code}')">复制代码</button>
              </div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary btn-sm" onclick="viewClassStudents('${cls.class_code}')">查看学生</button>
                <button class="btn btn-danger btn-sm" onclick="deleteClass(${cls.id})">删除</button>
              </div>
            </div>
          </div>
        </div>`;
    }
    el.innerHTML = html;
  } catch (err) {
    showToast('加载班级失败', 'error');
  }
}

function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast('班级代码已复制', 'success');
  }).catch(() => {
    showToast('复制失败', 'error');
  });
}

function showCreateClassModal() {
  document.getElementById('classNameInput').value = '';
  document.getElementById('createClassModal').classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

async function createClass() {
  const name = document.getElementById('classNameInput').value.trim();
  if (!name) { showToast('请输入班级名称', 'warning'); return; }

  try {
    await API.post('/api/teacher/create-class', { className: name });
    showToast('班级创建成功', 'success');
    closeModal('createClassModal');
    loadClasses();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteClass(id) {
  if (!confirm('确定删除该班级？班级中的学生将被移出。')) return;
  try {
    await API.del(`/api/teacher/classes/${id}`);
    showToast('班级已删除', 'success');
    loadClasses();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadStudents() {
  try {
    const filter = document.getElementById('classFilter')?.value || '';
    const url = filter ? `/api/teacher/students?classCode=${filter}` : '/api/teacher/students';
    const data = await API.get(url);
    const tbody = document.getElementById('studentsBody');

    if (data.students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-light);">暂无学生</td></tr>';
      return;
    }

    const identities = ['', '班长', '学习委员', '生活委员', '团支书', '体育委员', '文艺委员', '心理委员'];
    tbody.innerHTML = data.students.map(s => `
      <tr>
        <td><strong>${escapeHtml(s.username)}</strong></td>
        <td>${escapeHtml(s.phone || '-')}</td>
        <td>${escapeHtml(s.qq || '-')}</td>
        <td style="font-size:12px;">${escapeHtml(s.class_code || '-')}</td>
        <td>
          <select class="identity-select" onchange="updateIdentity(${s.id}, this.value)">
            ${identities.map(i => `<option value="${i}" ${s.identity === i ? 'selected' : ''}>${i || '无'}</option>`).join('')}
          </select>
        </td>
        <td>${s.is_banned ? '<span class="badge badge-danger">已封禁</span>' : '<span class="badge badge-success">正常</span>'}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="viewStudentDetail(${s.id})">详情</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('加载学生失败', 'error');
  }
}

async function updateIdentity(studentId, identity) {
  try {
    await API.put(`/api/teacher/students/${studentId}/identity`, { identity });
    showToast('身份已更新', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    loadStudents();
  }
}

async function viewStudentDetail(studentId) {
  try {
    const data = await API.get(`/api/teacher/student/${studentId}/logs`);
    const s = data.student;

    let logsHtml = '';
    if (data.logs.length === 0) {
      logsHtml = '<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-text">暂无活动记录</div></div>';
    } else {
      logsHtml = '<div class="table-wrapper"><table><thead><tr><th>操作</th><th>详情</th><th>时间</th></tr></thead><tbody>';
      const actionMap = { login: '登录', join_class: '加入班级', chat: 'AI对话', identity_change: '身份变更' };
      for (const log of data.logs) {
        logsHtml += `<tr><td><span class="badge badge-primary">${escapeHtml(actionMap[log.action] || log.action)}</span></td><td>${escapeHtml(log.detail)}</td><td style="white-space:nowrap;">${formatDate(log.created_at)}</td></tr>`;
      }
      logsHtml += '</tbody></table></div>';
    }

    document.getElementById('studentDetailBody').innerHTML = `
      <div class="detail-row"><span class="detail-label">用户名</span><span class="detail-value">${escapeHtml(s.username)}</span></div>
      <div class="detail-row"><span class="detail-label">手机号</span><span class="detail-value">${escapeHtml(s.phone || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">QQ号</span><span class="detail-value">${escapeHtml(s.qq || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">班级代码</span><span class="detail-value">${escapeHtml(s.class_code || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">身份</span><span class="detail-value">${escapeHtml(s.identity || '未设置')}</span></div>
      <div class="detail-row"><span class="detail-label">状态</span><span class="detail-value">${s.is_banned ? '已封禁' : '正常'}</span></div>
      <div class="detail-row"><span class="detail-label">AI对话次数</span><span class="detail-value">${data.chatCount}</span></div>
      <div class="detail-row"><span class="detail-label">加入时间</span><span class="detail-value">${formatDate(s.created_at)}</span></div>
      <h3 style="font-size:15px;font-weight:700;margin:20px 0 12px;">活动记录</h3>
      ${logsHtml}
    `;
    document.getElementById('studentDetailModal').classList.add('active');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function viewClassStudents(code) {
  switchSection('students', document.querySelectorAll('.nav-item')[2]);
  document.getElementById('classFilter').value = code;
  loadStudents();
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
      <h3 style="font-size:16px;font-weight:700;margin-bottom:16px;">核心功能</h3>
      <div class="feature-grid">
        ${data.features.map(f => `
          <div class="feature-card">
            <div class="feature-icon">${f.icon === 'chat' ? '💬' : f.icon === 'book' ? '📚' : f.icon === 'route' ? '🔀' : f.icon === 'device' ? '📱' : f.icon === 'chart' ? '📊' : '🛡️'}</div>
            <div class="feature-title">${escapeHtml(f.name)}</div>
            <div class="feature-desc">${escapeHtml(f.desc)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    showToast('加载项目信息失败', 'error');
  }
}

async function loadKnowledgeBase() {
  try {
    const data = await API.get('/api/student/knowledge-base');
    kbDataT = data;

    const catEl = document.getElementById('kbCategories2');
    catEl.innerHTML = `<span class="kb-category-chip active" onclick="filterKbT('all', this)">全部</span>` +
      data.categories.map(c => `<span class="kb-category-chip" onclick="filterKbT('${escapeHtml(c)}', this)">${escapeHtml(c)}</span>`).join('');

    renderKbT(data.items);
    const statsEl = document.querySelector('#statsGrid .stat-card:nth-child(4) .stat-value');
    if (statsEl) statsEl.textContent = data.items.length;
  } catch (err) {
    showToast('加载知识库失败', 'error');
  }
}

let currentKbCatT = 'all';
function filterKbT(cat, el) {
  currentKbCatT = cat;
  document.querySelectorAll('#kbCategories2 .kb-category-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  let items = kbDataT.items;
  if (cat !== 'all') items = items.filter(i => i.category === cat);
  renderKbT(items);
}

function renderKbT(items) {
  const el = document.getElementById('kbList2');
  if (items.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">暂无知识条目</div></div>';
    return;
  }
  el.innerHTML = items.map(item => `
    <div class="kb-item" style="background:white;border:1px solid var(--border-color);border-radius:12px;padding:18px;margin-bottom:12px;">
      <div style="font-size:12px;color:var(--primary);font-weight:600;margin-bottom:4px;">${escapeHtml(item.category)}</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:6px;">${escapeHtml(item.question)}</div>
      <div style="font-size:14px;color:var(--text-medium);line-height:1.6;">${escapeHtml(item.answer)}</div>
    </div>
  `).join('');
}

function initChat() {
  const container = document.getElementById('teacherChatContainer');
  container.innerHTML = `
    <div id="tChatMessages" style="height:400px;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px;background:#f8fafc;border-radius:12px;margin-bottom:16px;">
      <div style="display:flex;gap:12px;max-width:80%;">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:16px;color:white;flex-shrink:0;">🤖</div>
        <div style="padding:12px 16px;background:white;border:1px solid var(--border-color);border-radius:16px;border-top-left-radius:4px;font-size:14px;line-height:1.6;">
          您好！我是智能客服助手，有什么可以帮您的？
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;">
      <textarea id="tChatInput" placeholder="输入问题..." style="flex:1;padding:12px 16px;border:2px solid var(--border-color);border-radius:12px;font-size:14px;resize:none;min-height:44px;max-height:120px;font-family:inherit;" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendTeacherMessage();}"></textarea>
      <button class="btn btn-primary" onclick="sendTeacherMessage()">发送</button>
    </div>
  `;
}

async function sendTeacherMessage() {
  const input = document.getElementById('tChatInput');
  const message = input.value.trim();
  if (!message) return;

  const messagesEl = document.getElementById('tChatMessages');

  messagesEl.innerHTML += `
    <div style="display:flex;gap:12px;max-width:80%;align-self:flex-end;flex-direction:row-reverse;">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#06b6d4,#0891b2);display:flex;align-items:center;justify-content:center;font-size:16px;color:white;flex-shrink:0;">👤</div>
      <div style="padding:12px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border-radius:16px;border-top-right-radius:4px;font-size:14px;line-height:1.6;">${escapeHtml(message)}</div>
    </div>`;

  input.value = '';
  input.style.height = 'auto';

  const typingId = 'typing-' + Date.now();
  messagesEl.innerHTML += `
    <div id="${typingId}" style="display:flex;gap:12px;">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:16px;color:white;flex-shrink:0;">🤖</div>
      <div style="padding:12px 16px;background:white;border:1px solid var(--border-color);border-radius:16px;border-top-left-radius:4px;display:flex;gap:4px;">
        <div style="width:8px;height:8px;background:#94a3b8;border-radius:50%;animation:typingBounce 1.4s infinite;"></div>
        <div style="width:8px;height:8px;background:#94a3b8;border-radius:50%;animation:typingBounce 1.4s infinite;animation-delay:0.2s;"></div>
        <div style="width:8px;height:8px;background:#94a3b8;border-radius:50%;animation:typingBounce 1.4s infinite;animation-delay:0.4s;"></div>
      </div>
    </div>`;

  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const result = await API.post('/api/student/chat', { message });
    document.getElementById(typingId)?.remove();

    let metaHtml = '';
    if (result.intent && result.intent !== '未识别') {
      metaHtml = `<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        <span style="font-size:12px;padding:2px 8px;border-radius:20px;background:rgba(99,102,241,0.1);color:var(--primary);font-weight:600;">置信度 ${Math.round(result.confidence * 100)}%</span>
        <span style="font-size:12px;padding:2px 8px;border-radius:20px;background:rgba(139,92,246,0.1);color:var(--secondary);font-weight:600;">${escapeHtml(result.intent)}</span>
      </div>`;
    }

    messagesEl.innerHTML += `
      <div style="display:flex;gap:12px;max-width:80%;">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:16px;color:white;flex-shrink:0;">🤖</div>
        <div>
          <div style="padding:12px 16px;background:white;border:1px solid var(--border-color);border-radius:16px;border-top-left-radius:4px;font-size:14px;line-height:1.6;">${escapeHtml(result.content)}</div>
          ${metaHtml}
        </div>
      </div>`;

    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {
    document.getElementById(typingId)?.remove();
    showToast(err.message, 'error');
  }
}
