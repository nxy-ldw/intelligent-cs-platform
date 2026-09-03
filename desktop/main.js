const { app, BrowserWindow, Menu, shell, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 配置 - 可以修改为你的服务器地址
const APP_URL = 'https://intelligent-cs-platform-production-c547.up.railway.app/';
const APP_NAME = 'AI学习诊断';
const APP_VERSION = '1.0.0';

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
    backgroundColor: '#f0f9ff',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  // 加载主页面
  mainWindow.loadURL(APP_URL);

  // 设置自定义 User-Agent
  mainWindow.webContents.setUserAgent(
    mainWindow.webContents.getUserAgent() + ' AILearningDesktop/1.0 Electron'
  );

  // 页面加载完成后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 每次页面加载完成后注入 CSS/JS，隐藏下载入口，适配桌面端
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        document.documentElement.setAttribute('data-app', 'desktop');
        // 如果在下载页面，重定向到首页
        if (location.pathname.includes('downloads')) {
          location.href = '/';
          return;
        }
        // 隐藏导航栏中的下载入口
        document.querySelectorAll('a[href*="downloads"]').forEach(function(el) {
          el.style.display = 'none';
        });
        // 隐藏导航栏下载按钮
        document.querySelectorAll('.nav-buttons .btn-outline').forEach(function(btn) {
          if (btn.textContent.includes('下载') || (btn.getAttribute('onclick') || '').includes('downloads')) {
            btn.style.display = 'none';
          }
        });
        // 隐藏首页下载相关区块
        document.querySelectorAll('.hero-cta a[href*="downloads"]').forEach(function(el) {
          el.style.display = 'none';
        });
        // 隐藏 footer 中的下载链接
        document.querySelectorAll('.footer-col a[href*="downloads"]').forEach(function(el) {
          el.style.display = 'none';
        });
      })();
    `).catch(() => {});
    // 注入桌面端专属 CSS
    mainWindow.webContents.insertCSS(`
      /* 桌面端：隐藏所有下载相关元素 */
      a[href*="downloads"] { display: none !important; }
      .nav-buttons .btn-outline[onclick*="downloads"] { display: none !important; }
      .hero-cta a[href*="downloads"] { display: none !important; }
      /* 桌面端：导航栏增加顶部内边距，避免被窗口标题栏遮挡 */
      .navbar { -webkit-app-region: no-drag; }
    `).catch(() => {});
  });

  // 拦截下载页面导航，重定向到首页
  // 导航限制 - 只允许在本站点内导航
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 桌面端禁止访问下载页面
    if (url.includes('/downloads')) {
      event.preventDefault();
      mainWindow.loadURL(APP_URL);
      return;
    }
    // 允许站内导航
    const allowedHosts = [
      'intelligent-cs-platform-production-c547.up.railway.app',
      'localhost'
    ];
    try {
      const parsedUrl = new URL(url);
      const isAllowed = allowedHosts.some(host => parsedUrl.hostname === host || parsedUrl.hostname.endsWith('.' + host));
      if (!isAllowed && !url.startsWith('file://')) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch(e) {}
  });

  // 新窗口请求 - 在浏览器中打开外部链接
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
    detail: `版本: ${APP_VERSION}\n\nAI个性化学习诊断辅导系统\n基于人工智能技术的智能学习辅助工具\n\n© 2024 AI Learning Platform.`,
    icon: path.join(__dirname, 'assets', 'icon.png')
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
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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

// 安全设置
app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegration = false;
  });
});
