const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    readFiles: (folderPath) => ipcRenderer.invoke('read-files', folderPath),
    embedFiles: (files) => ipcRenderer.invoke('embed-files', files),
    processQuery: (query) => ipcRenderer.invoke('process-query', query),
    clearConversation: () => ipcRenderer.invoke('clear-conversation'),
    minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
    closeWindow: () => ipcRenderer.invoke('window-close'),
    resizeWindow: () => ipcRenderer.invoke('window-resize'),
    compressWindow: () => ipcRenderer.invoke('window-compress'),
    expandWindow: () => ipcRenderer.invoke('window-expand'),
    onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', (_, value) => callback(value))
  }
);
