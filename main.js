const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');

let mainWindow = null;

async function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true
    },
    backgroundColor: '#0f172a', // Match your app's background color
  });

  // Load the app
  const startUrl = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5173' 
    : url.format({
        pathname: path.join(__dirname, 'dist', 'index.html'),
        protocol: 'file:',
        slashes: true
      });

  console.log('Loading URL:', startUrl);
  
  // Add a small delay to let Vite start up properly
  setTimeout(() => {
    mainWindow.loadURL(startUrl).catch(err => {
      console.error('Failed to load URL:', err);
      // Fallback to loading from file
      if (process.env.NODE_ENV === 'development') {
        mainWindow.loadFile(path.join(__dirname, 'index.html'));
      }
    });
  }, 2000); // 2 second delay

  // Open DevTools
  mainWindow.webContents.openDevTools();

  // IPC handler for folder selection
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    
    if (!result.canceled) {
      return result.filePaths[0];
    }
    return null;
  });

  // IPC handler for reading files in a directory
  ipcMain.handle('read-files', async (event, folderPath) => {
    try {
      console.log('Reading files from:', folderPath);
      const files = fs.readdirSync(folderPath);
      
      // Map files to include full path and some basic info
      return files.map(file => {
        const fullPath = path.join(folderPath, file);
        try {
          const stats = fs.statSync(fullPath);
          return {
            name: file,
            path: fullPath,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            lastModified: stats.mtime.toISOString()
          };
        } catch (err) {
          return {
            name: file,
            path: fullPath,
            error: 'Could not read file info'
          };
        }
      });
    } catch (error) {
      console.error('Error reading files:', error);
      return [];
    }
  });

  // Keep the window open
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create window when app is ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Log any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
