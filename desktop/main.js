const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');

const APP_URL = 'https://intelligent-cs-platform-production-c547.up.railway.app/';
const APP_NAME = 'AI学习诊断';
const APP_VERSION = '1.0.2';

let mainWindow = null;
let isQuitting = false;

// 关键修复：禁用 GPU 硬件加速，避免便携版从 temp 目录运行时 GPU 缓存权限错误
app.disableHardwareAcceleration();
// 关键修复：禁用沙箱，避免 portable 运行环境下 preload 脚本加载失败
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
// 设置用户数据目录到 EXE 同级，避免 temp 目录权限问题
app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe')), 'appdata'));

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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#f1f5f9',
    show: true,  // 关键修复：直接显示，不等待 ready-to-show
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // 关键修复：不用 preload，通过 dom-ready 注入 JS 实现 desktop 标记
    }
  });

  // 在加载页面之前设置 User-Agent
  mainWindow.webContents.setUserAgent(
    mainWindow.webContents.getUserAgent() + ' AILearningDesktop/1.0.2 Electron'
  );

  // 加载主页面
  mainWindow.loadURL(APP_URL);

  // 页面加载完成后注入 CSS/JS
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        document.documentElement.setAttribute('data-app', 'desktop');
        window.electronAPI = { isDesktop: true, platform: 'win32' };
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
    `).catch(() => {});
  });

  // 加载失败时显示错误页
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) { // 忽略 cancelled 错误
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f1f5f9;color:#64748b;font-family:sans-serif;text-align:center;padding:40px;">
          <div style="font-size:64px;margin-bottom:16px;">\u26a0\ufe0f</div>
          <h2 style="color:#0f172a;margin-bottom:8px;">\u8fde\u63a5\u5931\u8d25</h2>
          <p style="margin-bottom:8px;">\u65e0\u6cd5\u8fde\u63a5\u5230\u670d\u52a1\u5668\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5\u540e\u91cd\u8bd5\u3002</p>
          <p style="font-size:12px;color:#94a3b8;margin-bottom:24px;">${errorDescription || 'Error ' + errorCode}</p>
          <button onclick="location.href='${APP_URL}'" style="padding:12px 28px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;">\u91cd\u8bd5</button>
        </body></html>
      `));
    }
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
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
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
