const API = {
  async request(url, options = {}) {
    const token = localStorage.getItem('token');
    const config = {
      headers: { 'Content-Type': 'application/json' },
      ...options
    };
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }
    const res = await fetch(url, config);
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
        return;
      }
      throw new Error(data.error || data.message || '请求失败');
    }
    return data;
  },

  get(url) { return this.request(url); },
  post(url, body) { return this.request(url, { method: 'POST', body }); },
  put(url, body) { return this.request(url, { method: 'PUT', body }); },
  del(url) { return this.request(url, { method: 'DELETE' }); }
};

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-message">${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function getInitials(name) {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

function getRoleLabel(role) {
  const map = { admin: '管理员', teacher: '教师', student: '学生' };
  return map[role] || role;
}

function getRoleBadgeClass(role) {
  const map = { admin: 'badge-danger', teacher: 'badge-secondary', student: 'badge-primary' };
  return map[role] || 'badge-primary';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function checkMaintenance() {
  API.get('/api/auth/maintenance').then(data => {
    if (data.maintenance) {
      showMaintenanceOverlay();
    }
  }).catch(() => {});
}

function showMaintenanceOverlay() {
  const existing = document.querySelector('.maintenance-overlay');
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.className = 'maintenance-overlay';
  overlay.innerHTML = `
    <div class="maintenance-box">
      <div class="maintenance-icon">🔧</div>
      <h2>系统维护中</h2>
      <p>系统正在进行维护升级，暂时无法访问。<br>维护完成后将自动恢复服务。<br>如有紧急问题，请联系管理员。</p>
    </div>
  `;
  document.body.appendChild(overlay);

  setInterval(() => {
    API.get('/api/auth/maintenance').then(data => {
      if (!data.maintenance) {
        location.reload();
      }
    }).catch(() => {});
  }, 10000);
}

function loadAnnouncements() {
  return API.get('/api/auth/announcements').then(data => {
    if (data.announcements && data.announcements.length > 0) {
      showAnnouncementBanner(data.announcements[0]);
    }
  }).catch(() => {});
}

function showAnnouncementBanner(ann) {
  const existing = document.querySelector('.announcement-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.className = 'announcement-banner';
  banner.style.cssText = `
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    padding: 12px 24px;
    border-radius: 12px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 4px 12px rgba(99,102,241,0.2);
    font-size: 14px;
  `;
  banner.innerHTML = `
    <span style="font-size:18px;">📢</span>
    <div style="flex:1;">
      <strong>${escapeHtml(ann.title)}</strong>
      <span style="opacity:0.9; margin-left:8px;">${escapeHtml(ann.content)}</span>
    </div>
  `;

  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.insertBefore(banner, mainContent.firstChild);
  }
}

function switchSection(sectionId, navItem) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const section = document.getElementById(sectionId);
  if (section) section.classList.add('active');
  if (navItem) navItem.classList.add('active');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}
