let currentRole = 'all';
let currentKeyword = '';
let editingUserId = null;
let editingKbId = null;
let maintenanceState = false;

document.addEventListener('DOMContentLoaded', async () => {
  const userStr = localStorage.getItem('user');
  if (!userStr) { window.location.href = '/'; return; }
  const user = JSON.parse(userStr);

  document.getElementById('userAvatar').textContent = getInitials(user.username);
  document.getElementById('userName').textContent = user.username;

  checkMaintenance();
  loadAnnouncements();

  loadStats();
  loadUsers();
  loadAnnouncementsList();
  loadKnowledgeBaseAdmin();
  loadMaintenanceState();
  initAdminChat();
});

async function loadStats() {
  try {
    const data = await API.get('/api/admin/stats');
    document.getElementById('adminStatsGrid').innerHTML = `
      <div class="stat-card blue">
        <div class="stat-icon" style="background:rgba(59,130,249,0.1)">👥</div>
        <div class="stat-value">${data.students}</div>
        <div class="stat-label">学生数</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-icon" style="background:rgba(139,92,246,0.1)">👨‍🏫</div>
        <div class="stat-value">${data.teachers}</div>
        <div class="stat-label">教师数</div>
      </div>
      <div class="stat-card indigo">
        <div class="stat-icon" style="background:rgba(99,102,241,0.1)">🛡️</div>
        <div class="stat-value">${data.admins}</div>
        <div class="stat-label">管理员数</div>
      </div>
      <div class="stat-card red">
        <div class="stat-icon" style="background:rgba(239,68,68,0.1)">🚫</div>
        <div class="stat-value">${data.banned}</div>
        <div class="stat-label">封禁账号</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-icon" style="background:rgba(245,158,11,0.1)">🏫</div>
        <div class="stat-value">${data.classes}</div>
        <div class="stat-label">班级数</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon" style="background:rgba(16,185,129,0.1)">💬</div>
        <div class="stat-value">${data.messages}</div>
        <div class="stat-label">AI对话总数</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon" style="background:rgba(6,182,212,0.1)">📚</div>
        <div class="stat-value">${data.knowledgeBase}</div>
        <div class="stat-label">知识库条目</div>
      </div>
      <div class="stat-card ${data.maintenance ? 'red' : 'green'}">
        <div class="stat-icon" style="background:${data.maintenance ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}">${data.maintenance ? '🔧' : '✅'}</div>
        <div class="stat-value" style="font-size:20px;">${data.maintenance ? '维护中' : '正常'}</div>
        <div class="stat-label">系统状态</div>
      </div>
    `;

    const recentUsers = await API.get('/api/admin/users');
    const recent = recentUsers.users.slice(0, 8);
    const tbody = document.getElementById('recentUsersBody');
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-light);">暂无用户</td></tr>';
    } else {
      tbody.innerHTML = recent.map(u => `
        <tr>
          <td><div class="user-avatar-cell"><div class="avatar-sm">${getInitials(u.username)}</div><strong>${escapeHtml(u.username)}</strong></div></td>
          <td><span class="badge ${getRoleBadgeClass(u.role)}">${getRoleLabel(u.role)}</span></td>
          <td>${escapeHtml(u.phone || '-')}</td>
          <td>${escapeHtml(u.qq || '-')}</td>
          <td style="font-size:12px;">${escapeHtml(u.class_code || '-')}</td>
          <td>${u.is_banned ? '<span class="badge badge-danger">封禁</span>' : '<span class="badge badge-success">正常</span>'}</td>
          <td style="white-space:nowrap;">${formatDate(u.created_at)}</td>
        </tr>`).join('');
    }
  } catch (err) {
    showToast('加载统计数据失败', 'error');
  }
}

function filterUsers(role, el) {
  currentRole = role;
  document.querySelectorAll('#users .tab-item').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  loadUsers();
}

function searchUsers(keyword) {
  currentKeyword = keyword;
  loadUsers();
}

async function loadUsers() {
  try {
    let url = '/api/admin/users?';
    if (currentRole && currentRole !== 'all') url += `role=${currentRole}&`;
    if (currentKeyword) url += `keyword=${encodeURIComponent(currentKeyword)}&`;
    const data = await API.get(url);
    const tbody = document.getElementById('usersBody');

    if (data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-light);">暂无用户</td></tr>';
      return;
    }

    tbody.innerHTML = data.users.map(u => `
      <tr>
        <td><div class="user-avatar-cell"><div class="avatar-sm">${getInitials(u.username)}</div><strong>${escapeHtml(u.username)}</strong></div></td>
        <td><span class="badge ${getRoleBadgeClass(u.role)}">${getRoleLabel(u.role)}</span></td>
        <td>${escapeHtml(u.phone || '-')}</td>
        <td>${escapeHtml(u.qq || '-')}</td>
        <td style="font-size:12px;">${escapeHtml(u.class_code || '-')}</td>
        <td>${u.identity ? `<span class="badge badge-secondary">${escapeHtml(u.identity)}</span>` : '-'}</td>
        <td>${u.is_banned ? '<span class="badge badge-danger">封禁</span>' : '<span class="badge badge-success">正常</span>'}</td>
        <td style="font-size:12px;color:var(--text-light);">${escapeHtml(u.created_by)}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-secondary btn-sm" onclick="showEditUserModal(${u.id})">编辑</button>
            ${u.role !== 'admin' ? (u.is_banned
              ? `<button class="btn btn-success btn-sm" onclick="toggleBan(${u.id}, false)">解封</button>`
              : `<button class="btn btn-warning btn-sm" onclick="toggleBan(${u.id}, true)" style="background:var(--warning);color:white;">封禁</button>`)
              : ''}
            ${u.role !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">删除</button>` : ''}
          </div>
        </td>
      </tr>`).join('');
  } catch (err) {
    showToast('加载用户失败', 'error');
  }
}

function showCreateUserModal() {
  ['newUsername', 'newPassword', 'newPhone', 'newQq', 'newIdentity', 'newClassCode'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('createUserModal').classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

async function createUser() {
  const data = {
    username: document.getElementById('newUsername').value.trim(),
    password: document.getElementById('newPassword').value.trim(),
    role: document.getElementById('newRole').value,
    phone: document.getElementById('newPhone').value.trim(),
    qq: document.getElementById('newQq').value.trim(),
    identity: document.getElementById('newIdentity').value.trim(),
    classCode: document.getElementById('newClassCode').value.trim()
  };
  if (!data.username || !data.password) { showToast('请填写用户名和密码', 'warning'); return; }

  try {
    await API.post('/api/admin/users', data);
    showToast('用户创建成功', 'success');
    closeModal('createUserModal');
    loadUsers();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function showEditUserModal(id) {
  editingUserId = id;
  try {
    const data = await API.get('/api/admin/users');
    const user = data.users.find(u => u.id === id);
    if (!user) { showToast('用户不存在', 'error'); return; }

    document.getElementById('editUserBody').innerHTML = `
      <div class="form-group"><label class="form-label">用户名</label><input type="text" class="form-control" id="editUsername" value="${escapeHtml(user.username)}"></div>
      <div class="form-group"><label class="form-label">手机号</label><input type="text" class="form-control" id="editPhone" value="${escapeHtml(user.phone || '')}"></div>
      <div class="form-group"><label class="form-label">QQ号</label><input type="text" class="form-control" id="editQq" value="${escapeHtml(user.qq || '')}"></div>
      <div class="form-group"><label class="form-label">新密码（留空不修改）</label><input type="text" class="form-control" id="editPassword" placeholder="不修改请留空"></div>
      <div class="form-group"><label class="form-label">班级代码</label><input type="text" class="form-control" id="editClassCode" value="${escapeHtml(user.class_code || '')}"></div>
      <div class="form-group"><label class="form-label">身份</label><input type="text" class="form-control" id="editIdentity" value="${escapeHtml(user.identity || '')}"></div>
    `;
    document.getElementById('editUserModal').classList.add('active');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateUser() {
  const data = {
    username: document.getElementById('editUsername').value.trim(),
    phone: document.getElementById('editPhone').value.trim(),
    qq: document.getElementById('editQq').value.trim(),
    classCode: document.getElementById('editClassCode').value.trim(),
    identity: document.getElementById('editIdentity').value.trim()
  };
  const pwd = document.getElementById('editPassword').value.trim();
  if (pwd) data.password = pwd;

  try {
    await API.put(`/api/admin/users/${editingUserId}`, data);
    showToast('用户信息已更新', 'success');
    closeModal('editUserModal');
    loadUsers();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleBan(id, banned) {
  try {
    await API.put(`/api/admin/users/${id}/ban`, { banned });
    showToast(banned ? '账号已封禁' : '账号已解封', 'success');
    loadUsers();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('确定删除该用户？此操作不可恢复。')) return;
  try {
    await API.del(`/api/admin/users/${id}`);
    showToast('用户已删除', 'success');
    loadUsers();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function generateAccounts() {
  const data = {
    role: document.getElementById('genRole').value,
    prefix: document.getElementById('genPrefix').value.trim(),
    count: document.getElementById('genCount').value,
    classCode: document.getElementById('genClassCode').value.trim()
  };
  if (!data.prefix) { showToast('请输入用户名前缀', 'warning'); return; }

  try {
    const result = await API.post('/api/admin/users/batch-generate', data);
    showToast(`成功生成${result.accounts.length}个账号`, 'success');

    let html = `
      <div class="card" style="background:var(--gradient-card);">
        <div class="card-header"><h2 class="card-title">生成的账号列表</h2>
          <button class="btn btn-secondary btn-sm" onclick="copyAccounts('${encodeURIComponent(JSON.stringify(result.accounts))}')">复制全部</button>
        </div>
        <div class="card-body">
          <div class="table-wrapper">
            <table>
              <thead><tr><th>用户名</th><th>密码</th></tr></thead>
              <tbody>
                ${result.accounts.map(a => `<tr><td><strong>${escapeHtml(a.username)}</strong></td><td style="font-family:monospace;">${escapeHtml(a.password)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    document.getElementById('genResult').innerHTML = html;
    loadUsers();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function copyAccounts(encoded) {
  const accounts = JSON.parse(decodeURIComponent(encoded));
  const text = accounts.map(a => `${a.username} ${a.password}`).join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板', 'success'));
}

async function loadAnnouncementsList() {
  try {
    const data = await API.get('/api/admin/announcements');
    const el = document.getElementById('annList');
    if (data.announcements.length === 0) {
      el.innerHTML = '<div class="card"><div class="card-body empty-state"><div class="empty-icon">📢</div><div class="empty-text">暂无公告，点击右上角发布公告</div></div></div>';
      return;
    }
    el.innerHTML = data.announcements.map(a => `
      <div class="card" style="margin-bottom:16px;">
        <div class="card-body">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div style="flex:1;min-width:200px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <h3 style="font-size:17px;font-weight:700;">${escapeHtml(a.title)}</h3>
                ${a.is_active ? '<span class="badge badge-success">活跃</span>' : '<span class="badge badge-secondary">停用</span>'}
              </div>
              <p style="font-size:14px;color:var(--text-medium);line-height:1.6;">${escapeHtml(a.content)}</p>
              <div style="font-size:12px;color:var(--text-light);margin-top:8px;">发布者：${escapeHtml(a.created_by)} | ${formatDate(a.created_at)}</div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-secondary btn-sm" onclick="toggleAnnouncement(${a.id}, ${!a.is_active})">${a.is_active ? '停用' : '启用'}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteAnnouncement(${a.id})">删除</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast('加载公告失败', 'error');
  }
}

function showAnnouncementModal() {
  document.getElementById('annTitle').value = '';
  document.getElementById('annContent').value = '';
  document.getElementById('announcementModal').classList.add('active');
}

async function createAnnouncement() {
  const title = document.getElementById('annTitle').value.trim();
  const content = document.getElementById('annContent').value.trim();
  if (!title || !content) { showToast('请填写标题和内容', 'warning'); return; }

  try {
    await API.post('/api/admin/announcements', { title, content });
    showToast('公告发布成功', 'success');
    closeModal('announcementModal');
    loadAnnouncementsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleAnnouncement(id, isActive) {
  try {
    await API.put(`/api/admin/announcements/${id}`, { isActive });
    showToast(isActive ? '公告已启用' : '公告已停用', 'success');
    loadAnnouncementsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteAnnouncement(id) {
  if (!confirm('确定删除该公告？')) return;
  try {
    await API.del(`/api/admin/announcements/${id}`);
    showToast('公告已删除', 'success');
    loadAnnouncementsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadKnowledgeBaseAdmin() {
  try {
    const data = await API.get('/api/admin/knowledge-base');
    const tbody = document.getElementById('kbBody');
    if (data.items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-light);">暂无知识条目</td></tr>';
      return;
    }
    tbody.innerHTML = data.items.map(item => `
      <tr>
        <td><span class="badge badge-primary">${escapeHtml(item.category)}</span></td>
        <td style="max-width:200px;">${escapeHtml(item.question)}</td>
        <td style="max-width:300px;font-size:13px;">${escapeHtml(item.answer).substring(0, 100)}${item.answer.length > 100 ? '...' : ''}</td>
        <td style="font-size:12px;">${escapeHtml(item.keywords || '-')}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="showEditKbModal(${item.id})">编辑</button>
          <button class="btn btn-danger btn-sm" onclick="deleteKbItem(${item.id})">删除</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('加载知识库失败', 'error');
  }
}

function showKbModal() {
  ['kbCategory', 'kbQuestion', 'kbAnswer', 'kbKeywords'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('kbModal').classList.add('active');
}

async function addKbItem() {
  const data = {
    category: document.getElementById('kbCategory').value.trim(),
    question: document.getElementById('kbQuestion').value.trim(),
    answer: document.getElementById('kbAnswer').value.trim(),
    keywords: document.getElementById('kbKeywords').value.trim()
  };
  if (!data.category || !data.question || !data.answer) { showToast('请填写完整信息', 'warning'); return; }

  try {
    await API.post('/api/admin/knowledge-base', data);
    showToast('知识条目添加成功', 'success');
    closeModal('kbModal');
    loadKnowledgeBaseAdmin();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function showEditKbModal(id) {
  editingKbId = id;
  try {
    const data = await API.get('/api/admin/knowledge-base');
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    document.getElementById('editKbBody').innerHTML = `
      <div class="form-group"><label class="form-label">分类</label><input type="text" class="form-control" id="editKbCategory" value="${escapeHtml(item.category)}"></div>
      <div class="form-group"><label class="form-label">问题</label><input type="text" class="form-control" id="editKbQuestion" value="${escapeHtml(item.question)}"></div>
      <div class="form-group"><label class="form-label">答案</label><textarea class="form-control" id="editKbAnswer" rows="4">${escapeHtml(item.answer)}</textarea></div>
      <div class="form-group"><label class="form-label">关键词</label><input type="text" class="form-control" id="editKbKeywords" value="${escapeHtml(item.keywords || '')}"></div>
    `;
    document.getElementById('editKbModal').classList.add('active');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateKbItem() {
  const data = {
    category: document.getElementById('editKbCategory').value.trim(),
    question: document.getElementById('editKbQuestion').value.trim(),
    answer: document.getElementById('editKbAnswer').value.trim(),
    keywords: document.getElementById('editKbKeywords').value.trim()
  };
  try {
    await API.put(`/api/admin/knowledge-base/${editingKbId}`, data);
    showToast('知识条目已更新', 'success');
    closeModal('editKbModal');
    loadKnowledgeBaseAdmin();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteKbItem(id) {
  if (!confirm('确定删除该知识条目？')) return;
  try {
    await API.del(`/api/admin/knowledge-base/${id}`);
    showToast('知识条目已删除', 'success');
    loadKnowledgeBaseAdmin();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadMaintenanceState() {
  try {
    const data = await API.get('/api/auth/maintenance');
    maintenanceState = data.maintenance;
    updateMaintenanceUI();
  } catch (err) {}
}

function updateMaintenanceUI() {
  const toggle = document.getElementById('maintenanceToggle');
  const label = document.getElementById('maintenanceLabel');
  if (maintenanceState) {
    toggle.classList.add('active');
    label.textContent = '维护模式：开启中';
    label.style.color = 'var(--danger)';
  } else {
    toggle.classList.remove('active');
    label.textContent = '维护模式：关闭';
    label.style.color = 'var(--text-dark)';
  }
}

async function toggleMaintenance() {
  const newState = !maintenanceState;
  if (newState && !confirm('确定开启维护模式？所有学生和教师将无法登录系统。')) return;

  try {
    await API.put('/api/admin/maintenance', { enabled: newState });
    maintenanceState = newState;
    updateMaintenanceUI();
    showToast(newState ? '维护模式已开启' : '维护模式已关闭', newState ? 'warning' : 'success');
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function initAdminChat() {
  const container = document.getElementById('adminChatContainer');
  container.innerHTML = `
    <div id="aChatMessages" style="height:400px;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px;background:#f8fafc;border-radius:12px;margin-bottom:16px;">
      <div style="display:flex;gap:12px;max-width:80%;">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:16px;color:white;flex-shrink:0;">🤖</div>
        <div style="padding:12px 16px;background:white;border:1px solid var(--border-color);border-radius:16px;border-top-left-radius:4px;font-size:14px;line-height:1.6;">
          您好！我是智能客服助手，有什么可以帮您的？
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;">
      <textarea id="aChatInput" placeholder="输入问题..." style="flex:1;padding:12px 16px;border:2px solid var(--border-color);border-radius:12px;font-size:14px;resize:none;min-height:44px;max-height:120px;font-family:inherit;" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendAdminMessage();}"></textarea>
      <button class="btn btn-primary" onclick="sendAdminMessage()">发送</button>
    </div>
    <style>
      @keyframes typingBounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-8px); }
      }
    </style>
  `;
}

async function sendAdminMessage() {
  const input = document.getElementById('aChatInput');
  const message = input.value.trim();
  if (!message) return;

  const messagesEl = document.getElementById('aChatMessages');

  messagesEl.innerHTML += `
    <div style="display:flex;gap:12px;max-width:80%;align-self:flex-end;flex-direction:row-reverse;">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#06b6d4,#0891b2);display:flex;align-items:center;justify-content:center;font-size:16px;color:white;flex-shrink:0;">👤</div>
      <div style="padding:12px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border-radius:16px;border-top-right-radius:4px;font-size:14px;line-height:1.6;">${escapeHtml(message)}</div>
    </div>`;

  input.value = '';
  input.style.height = 'auto';

  const typingId = 'aTyping-' + Date.now();
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
