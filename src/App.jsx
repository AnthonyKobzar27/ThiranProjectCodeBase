import React, { useState, useRef, useEffect } from 'react';
import './styles/App.css';
import StatusBar from './components/StatusBar';
import readFiles from './vectorDatabase/readFiles';

function App() {
  const [folderPath, setFolderPath] = useState('');
  const [statusMessage, setStatusMessage] = useState('Select a folder to begin');
  const [isLoading, setIsLoading] = useState(false);
  const [codeQuery, setCodeQuery] = useState('');
  
  // Chat state
  const [conversation, setConversation] = useState([]);
  const [isProcessingQuery, setIsProcessingQuery] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [currentContext, setCurrentContext] = useState('');
  
  // Refs
  const chatContainerRef = useRef(null);
  
  // Scroll to bottom of chat when conversation updates
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [conversation]);

  const handleSelectFolder = async () => {
    console.log('Select folder button clicked');
    setIsLoading(true);
    try {
      const selectedFolder = await window.electronAPI.selectFolder();
      console.log("Selected folder:", selectedFolder);

      if (selectedFolder) {
        setFolderPath(selectedFolder);
        setStatusMessage(`Selected folder: ${selectedFolder}`);
        
        // Read files from the selected folder
        setStatusMessage('Reading files...');
        const files = await readFiles(selectedFolder);
        setStatusMessage(`Read ${files.length} files from: ${selectedFolder}`);
        
        // Embed files in Pinecone
        setStatusMessage('Embedding files in Pinecone...');
        const result = await window.electronAPI.embedFiles(files);
        
        if (result.success) {
          setStatusMessage(`${result.message}`);
        } else {
          setStatusMessage(`Error embedding files: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Error processing folder:', error);
      setStatusMessage('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuerySubmit = async (e) => {
    e.preventDefault();
    const query = codeQuery.trim();
    if (!query || isProcessingQuery) return;
    
    setIsProcessingQuery(true);
    
    // Add user query to conversation
    setConversation(prev => [...prev, { role: 'user', content: query }]);
    
    try {
      // Show loading message
      setConversation(prev => [...prev, { role: 'assistant', content: '...', isLoading: true }]);
      
      // Process the query
      const result = await window.electronAPI.processQuery(query);
      
      // Remove loading message and add real response
      setConversation(prev => {
        const newConversation = [...prev];
        // Replace the last message (the loading message)
        newConversation.pop();
        return [...newConversation, { 
          role: 'assistant', 
          content: result.response,
          context: result.context
        }];
      });
      
      // Store context for viewing
      if (result.context) {
        setCurrentContext(result.context);
      }
      
      // Update status
      setStatusMessage('Ready for more questions');
    } catch (error) {
      console.error('Error processing query:', error);
      
      // Remove loading message and add error message
      setConversation(prev => {
        const newConversation = [...prev];
        // Replace the last message (the loading message)
        newConversation.pop();
        return [...newConversation, { 
          role: 'assistant', 
          content: `Error: ${error.message}`,
          isError: true
        }];
      });
      
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      setIsProcessingQuery(false);
      setCodeQuery(''); // Clear input field
    }
  };
  
  const handleClearConversation = async () => {
    // Clear conversation in UI
    setConversation([]);
    
    // Clear conversation in backend
    await window.electronAPI.clearConversation();
    
    setStatusMessage('Conversation cleared');
  };
  
  const toggleContextView = () => {
    setShowContext(!showContext);
  };

  // Render a chat message
  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    
    return (
      <div 
        key={index} 
        className={`message ${isUser ? 'user-message' : 'assistant-message'} ${message.isLoading ? 'loading' : ''} ${message.isError ? 'error' : ''}`}
      >
        <div className="message-header">
          <strong>{isUser ? 'You' : 'Assistant'}</strong>
        </div>
        <div className="message-content">
          {message.isLoading ? (
            <div className="loading-dots">
              <span>.</span><span>.</span><span>.</span>
            </div>
          ) : (
            <>
              <p>{message.content}</p>
              {!isUser && message.context && (
                <button 
                  className="context-toggle" 
                  onClick={toggleContextView}
                >
                  {showContext ? 'Hide Context' : 'Show Context'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <div className="glow-effect"></div>

      <header className="app-header">
        <div className="logo">
          <div className="logo-glow"></div>
          <h2>Code<span className="accent">Buddy</span></h2>
        </div>
      </header>

      <div className="app-content">
        <div className="floating-element floating-element-1"></div>
        <div className="floating-element floating-element-2"></div>
        <div className="floating-element floating-element-3"></div>
        
        <div className="sidebar">
          <h3>Project Explorer</h3>
          <button className="primary-button" onClick={handleSelectFolder}>
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Processing...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 18H4V8H20V18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 8V6C4 5.46957 4.21071 4.96086 4.58579 4.58579C4.96086 4.21071 5.46957 4 6 4H10L12 6H18C18.5304 6 19.0391 6.21071 19.4142 6.58579C19.7893 6.96086 20 7.46957 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Select Folder
              </>
            )}
          </button>
          
          {folderPath && (
            <div className="folder-info">
              <p className="folder-path">{folderPath}</p>
            </div>
          )}
          
          <div className="sidebar-actions">
            <button 
              className="secondary-button" 
              onClick={handleClearConversation}
              disabled={conversation.length === 0}
            >
              Clear Conversation
            </button>
          </div>
        </div>
        
        <div className="main-content">
          <div className="chat-container" ref={chatContainerRef}>
            {conversation.length === 0 ? (
              <div className="empty-chat">
                <div className="empty-chat-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 9H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 13H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p>Your conversation will appear here. Start by asking a question about your code.</p>
              </div>
            ) : (
              <div className="messages">
                {conversation.map(renderMessage)}
              </div>
            )}
          </div>
          
          {showContext && currentContext && (
            <div className="context-panel">
              <div className="context-header">
                <h3>Code Context</h3>
                <button onClick={toggleContextView}>Close</button>
              </div>
              <pre className="context-content">{currentContext}</pre>
            </div>
          )}
          
          <div className="query-section">
            <form onSubmit={handleQuerySubmit}>
              <input
                type="text"
                className="query-input"
                placeholder="Ask a question about your code..."
                value={codeQuery}
                onChange={(e) => setCodeQuery(e.target.value)}
                disabled={isProcessingQuery || !folderPath}
              />
              <button 
                type="submit" 
                className="query-button"
                disabled={!folderPath || isProcessingQuery}
              >
                {isProcessingQuery ? (
                  <span className="spinner"></span>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Ask
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      <StatusBar message={statusMessage} />
    </div>
  );
}

export default App;
