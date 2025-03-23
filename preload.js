const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    readFiles: (folderPath) => ipcRenderer.invoke('read-files', folderPath),
    minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
    closeWindow: () => ipcRenderer.invoke('window-close'),
    onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', (_, value) => callback(value))
  }
);
