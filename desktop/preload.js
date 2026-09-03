const { contextBridge, ipcRenderer } = require('electron');

// 向渲染进程暴露安全的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 应用信息
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // 窗口控制
  minimize: () => ipcRenderer.invoke('minimize-window'),
  maximize: () => ipcRenderer.invoke('maximize-window'),
  close: () => ipcRenderer.invoke('close-window'),

  // 平台信息
  platform: process.platform,
  isDesktop: true
});
