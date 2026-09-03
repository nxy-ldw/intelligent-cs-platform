const { app, BrowserWindow, Menu, shell, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');

// 配置
const APP_URL = 'https://intelligent-cs-platform-production-c547.up.railway.app/';
const APP_NAME = 'AI学习诊断';
const APP_VERSION = '1.0.1';

let mainWindow = null;
let isQuitting = false;

// 单例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const fs = require('fs');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    backgroundColor: '#f1f5f9',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  // 设置自定义 User-Agent（必须在 loadURL 之前）
  mainWindow.webContents.setUserAgent(
    mainWindow.webContents.getUserAgent() + ' AILearningDesktop/1.0.1 Electron'
  );

  // 加载主页面
  mainWindow.loadURL(APP_URL);

  // 超时保底：10 秒后强制显示窗口（防止服务器慢导致白屏无反应）
  const showTimeout = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 10000);

  // 页面准备好后显示
  mainWindow.once('ready-to-show', () => {
    clearTimeout(showTimeout);
    mainWindow.show();
  });

  // 加载失败时也显示窗口并展示错误
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    clearTimeout(showTimeout);
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f1f5f9;color:#64748b;font-family:sans-serif;text-align:center;padding:40px;">
        <div style="font-size:64px;margin-bottom:16px;">⚠️</div>
        <h2 style="color:#0f172a;margin-bottom:8px;">连接失败</h2>
        <p style="margin-bottom:8px;">无法连接到服务器，请检查网络连接后重试。</p>
        <p style="font-size:12px;color:#94a3b8;margin-bottom:24px;">${errorDescription || 'Error ' + errorCode}</p>
        <button onclick="location.href='${APP_URL}'" style="padding:12px 28px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">重试</button>
      </body></html>
    `));
  });

  // 每次页面加载完成后注入 CSS/JS
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        document.documentElement.setAttribute('data-app', 'desktop');
        if (location.pathname.includes('downloads')) {
          location.href = '/';
          return;
        }
        document.querySelectorAll('a[href*="downloads"]').forEach(function(el) {
          el.style.display = 'none';
        });
        document.querySelectorAll('.nav-buttons .btn-outline').forEach(function(btn) {
          if (btn.textContent.includes('下载') || (btn.getAttribute('onclick') || '').includes('downloads')) {
            btn.style.display = 'none';
          }
        });
        document.querySelectorAll('.hero-cta a[href*="downloads"]').forEach(function(el) {
          el.style.display = 'none';
        });
        document.querySelectorAll('.footer-col a[href*="downloads"]').forEach(function(el) {
          el.style.display = 'none';
        });
      })();
    `).catch(() => {});
    mainWindow.webContents.insertCSS(`
      a[href*="downloads"] { display: none !important; }
      .nav-buttons .btn-outline[onclick*="downloads"] { display: none !important; }
      .hero-cta a[href*="downloads"] { display: none !important; }
      .navbar { -webkit-app-region: no-drag; }
    `).catch(() => {});
  });

  // 导航限制
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.includes('/downloads')) {
      event.preventDefault();
      mainWindow.loadURL(APP_URL);
      return;
    }
    const allowedHosts = [
      'intelligent-cs-platform-production-c547.up.railway.app',
      'localhost'
    ];
    try {
      const parsedUrl = new URL(url);
      const isAllowed = allowedHosts.some(host => parsedUrl.hostname === host || parsedUrl.hostname.endsWith('.' + host));
      if (!isAllowed && !url.startsWith('file://') && !url.startsWith('data:')) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch(e) {}
  });

  // 外链在系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 关闭到托盘
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 创建系统菜单
function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '刷新', accelerator: 'F5', click: () => mainWindow && mainWindow.reload() },
        { label: '强制刷新', accelerator: 'Shift+F5', click: () => mainWindow && mainWindow.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { label: '首页', accelerator: 'Alt+Home', click: () => mainWindow && mainWindow.loadURL(APP_URL) },
        { type: 'separator' },
        { label: '退出', accelerator: 'Alt+F4', click: () => { isQuitting = true; app.quit(); } }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'Ctrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Ctrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'Ctrl+X', role: 'cut' },
        { label: '复制', accelerator: 'Ctrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'Ctrl+V', role: 'paste' },
        { label: '全选', accelerator: 'Ctrl+A', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '放大', accelerator: 'Ctrl+=', click: () => { if (mainWindow) { const z = mainWindow.webContents.getZoomLevel() + 0.5; mainWindow.webContents.setZoomLevel(Math.min(z, 3)); } } },
        { label: '缩小', accelerator: 'Ctrl+-', click: () => { if (mainWindow) { const z = mainWindow.webContents.getZoomLevel() - 0.5; mainWindow.webContents.setZoomLevel(Math.max(z, -2)); } } },
        { label: '重置缩放', accelerator: 'Ctrl+0', click: () => mainWindow && mainWindow.webContents.setZoomLevel(0) },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'F12', click: () => mainWindow && mainWindow.webContents.toggleDevTools() },
        { label: '全屏', accelerator: 'F11', click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()) }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于', click: showAboutDialog },
        { label: '隐私政策', click: () => shell.openExternal(APP_URL + 'privacy.html') },
        { label: '用户协议', click: () => shell.openExternal(APP_URL + 'terms.html') },
        { label: '免责声明', click: () => shell.openExternal(APP_URL + 'disclaimer.html') }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function showAboutDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '关于 ' + APP_NAME,
    message: APP_NAME,
    detail: `版本: ${APP_VERSION}\n\nAI个性化学习诊断辅导系统\n基于人工智能技术的智能学习辅助工具\n\n© 2024 AI Learning Platform.`
  });
}

// IPC 通信
ipcMain.handle('get-app-info', () => {
  return {
    name: APP_NAME,
    version: APP_VERSION,
    url: APP_URL,
    platform: process.platform,
    arch: process.arch
  };
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) {
    isQuitting = true;
    mainWindow.close();
  }
});

// App 生命周期
app.whenReady().then(() => {
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});
