import React, { useState } from 'react';
import './styles/App.css';
import StatusBar from './components/StatusBar';
import readFiles from './vectorDatabase/readFiles';

function App() {
  const [folderPath, setFolderPath] = useState('');
  const [statusMessage, setStatusMessage] = useState('Select a folder to begin');
  const [isLoading, setIsLoading] = useState(false);
  const [codeQuery, setCodeQuery] = useState('');
  const [queryResponse, setQueryResponse] = useState('');

  const handleSelectFolder = async () => {
    console.log('Select folder button clicked');
    setIsLoading(true);
    try {
      const selectedFolder = await window.electronAPI.selectFolder();
      console.log("Selected folder:", selectedFolder);

      if (selectedFolder) {
        setFolderPath(selectedFolder);
        setStatusMessage(`Selected folder: ${selectedFolder}`);
        
        // Read files but don't display them
        await readFiles(selectedFolder);
        setStatusMessage(`Files loaded from: ${selectedFolder}`);
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      setStatusMessage('Error selecting folder: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuerySubmit = (e) => {
    e.preventDefault();
    if (!codeQuery.trim()) return;
    
    // This would normally call a backend API to get BERT model response
    setQueryResponse(`This would be a response from a BERT model about: "${codeQuery}"`);
    
    // In a real app, you'd call your API here
    // const response = await fetch('/api/query', {
    //   method: 'POST',
    //   body: JSON.stringify({ query: codeQuery, folderPath }),
    //   headers: { 'Content-Type': 'application/json' }
    // });
    // const data = await response.json();
    // setQueryResponse(data.response);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <h2>Code Assistant</h2>
        </div>
      </header>

      <div className="app-content">
        <div className="sidebar">
          <h3>Project Explorer</h3>
          <button className="primary-button" onClick={handleSelectFolder}>
            {isLoading ? 'Loading...' : 'Select Folder'}
          </button>
          
          {folderPath && (
            <div className="folder-info">
              <p className="folder-path">{folderPath}</p>
            </div>
          )}
        </div>
        
        <div className="main-content">
          <div className="query-section">
            <h2>Ask about your code</h2>
            <form onSubmit={handleQuerySubmit}>
              <input
                type="text"
                className="query-input"
                placeholder="Ask a question about your code..."
                value={codeQuery}
                onChange={(e) => setCodeQuery(e.target.value)}
              />
              <button 
                type="submit" 
                className="query-button"
                disabled={!folderPath || isLoading}
              >
                Ask
              </button>
            </form>
            
            {queryResponse && (
              <div className="response-container">
                <h3>Response:</h3>
                <p className="response-text">{queryResponse}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <StatusBar message={statusMessage} />
    </div>
  );
}

export default App;
