const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');

let mainWindow = null;

async function createWindow() {
  // Get screen dimensions
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 380,
    height: 530,
    x: width - 380 - 40, // Position at the right edge of the screen with 40px offset
    y: 40, // Position at the top of the screen with 40px offset
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    resizable: false,
    hasShadow: true,
    alwaysOnTop: true, // Keep window on top
    skipTaskbar: false, // Show in taskbar
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: false
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
    
    return result; // Return the complete result object
  });

  // IPC handlers for window control
  ipcMain.handle('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      mainWindow.webContents.send('window-maximized', false);
    } else {
      mainWindow.maximize();
      mainWindow.webContents.send('window-maximized', true);
    }
  });

  ipcMain.handle('window-close', () => {
    if (mainWindow) mainWindow.close();
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

  // IPC handler for embedding files in Pinecone
  ipcMain.handle('embed-files', async (event, files) => {
    try {
      console.log(`Embedding ${files.length} files in Pinecone...`);
      
      // Import the embedding module here to keep it in the main process
      // This avoids CORS issues and follows Electron's security model
      const { processFiles } = require('./src/vectorDatabase/embedFiles');
      
      // Process the files for embedding
      await processFiles(files);
      
      return { success: true, message: `Successfully embedded ${files.length} files` };
    } catch (error) {
      console.error('Error embedding files:', error);
      return { success: false, error: error.message };
    }
  });

  // IPC handler for processing queries
  ipcMain.handle('process-query', async (event, query) => {
    try {
      console.log(`Processing query: "${query}"`);
      
      // Import the query module here to keep it in the main process
      const { processQuery } = require('./src/vectorDatabase/queryPinecone');
      
      // Process the query
      const result = await processQuery(query);
      
      return result;
    } catch (error) {
      console.error('Error processing query:', error);
      return { 
        success: false, 
        response: `Error processing query: ${error.message}`,
        error: error.message 
      };
    }
  });

  // IPC handler for clearing conversation
  ipcMain.handle('clear-conversation', async (event) => {
    try {
      console.log('Clearing conversation history');
      
      // Import the query module
      const { clearConversation } = require('./src/vectorDatabase/queryPinecone');
      
      // Clear the conversation
      return clearConversation();
    } catch (error) {
      console.error('Error clearing conversation:', error);
      return { success: false, error: error.message };
    }
  });

  // IPC handler for window resize
  ipcMain.handle('window-resize', () => {
    // Allow dynamic resizing based on content
    const [width, height] = mainWindow.getSize();
    // Keep the width but adjust height if needed
    mainWindow.setSize(width, height);
  });

  // IPC handler for window compress
  ipcMain.handle('window-compress', () => {
    // Set the window to a small size when compressed
    mainWindow.setSize(50, 50);
  });

  // IPC handler for window expand
  ipcMain.handle('window-expand', () => {
    // Reset to default size when expanded
    mainWindow.setSize(380, 500);
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
