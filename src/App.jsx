import { useState, useRef, useEffect } from 'react';
import spiderLogo from './images/custom_purple_bug.png';
import './styles/App.css';

function App() {
  const [isCompressed, setIsCompressed] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [codeQuery, setCodeQuery] = useState('');
  const [conversation, setConversation] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingQuery, setIsProcessingQuery] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showContext, setShowContext] = useState(false);
  
  const chatContainerRef = useRef(null);
  const outputRef = useRef(null);
  
  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      setIsLoading(true);
      setStatusMessage('Selecting folder...');
      
      const result = await window.electronAPI.selectFolder();
      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        setFolderPath(selectedPath);
        setStatusMessage('Reading files...');
        
        // Read files from the selected folder
        const files = await window.electronAPI.readFiles(selectedPath);
        if (files && files.length > 0) {
          setStatusMessage(`Processing ${files.length} files...`);
          
          // Process the codebase and store in vector database
          const embedResult = await window.electronAPI.embedFiles(files);
          
          if (embedResult && embedResult.success) {
            setStatusMessage(`${embedResult.message}`);
          } else {
            setStatusMessage(`Error embedding files: ${embedResult ? embedResult.error : 'Unknown error'}`);
          }
        } else {
          setStatusMessage('No files found in selected folder');
        }
        
        // Clear after a delay
        setTimeout(() => setStatusMessage(''), 3000);
      } else {
        setStatusMessage('Folder selection canceled');
        setTimeout(() => setStatusMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const closeButton = () => {
    window.electronAPI.closeWindow();
  };
  
  // Handle query submission
  const handleQuerySubmit = async (e) => {
    e.preventDefault();
    const query = codeQuery.trim();
    if (!query || isProcessingQuery) return;
    
    try {
      setIsProcessingQuery(true);
      
      // Add user message to conversation
      setConversation(prev => [...prev, { role: 'user', content: query }]);
      
      // Add loading message
      setConversation(prev => [...prev, { role: 'assistant', content: '', isLoading: true }]);
      
      // Clear input
      setCodeQuery('');
      
      // Process the query
      const result = await window.electronAPI.processQuery(query);
      
      // Update the loading message with the actual response
      setConversation(prev => {
        const newConversation = [...prev];
        const loadingIndex = newConversation.findIndex(msg => msg.isLoading);
        if (loadingIndex !== -1) {
          newConversation[loadingIndex] = { 
            role: 'assistant', 
            content: result && result.response ? result.response : 'No response received',
            context: result && result.context ? result.context : null
          };
        }
        return newConversation;
      });
      
      // Resize window to fit content
      window.electronAPI.resizeWindow();
      
    } catch (error) {
      console.error('Error processing query:', error);
      
      // Update the loading message with the error
      setConversation(prev => {
        const newConversation = [...prev];
        const loadingIndex = newConversation.findIndex(msg => msg.isLoading);
        if (loadingIndex !== -1) {
          newConversation[loadingIndex] = { 
            role: 'assistant', 
            content: `Error: ${error.message || 'Unknown error'}. Please try again.`,
            isError: true
          };
        }
        return newConversation;
      });
      
    } finally {
      setIsProcessingQuery(false);
    }
  };
  
  // Toggle compressed state
  const toggleCompressed = () => {
    setIsCompressed(!isCompressed);
    
    // Call the appropriate IPC handler based on the new state
    if (!isCompressed) {
      window.electronAPI.compressWindow();
    } else {
      window.electronAPI.expandWindow();
    }
  };
  
  // Handle window close
  const handleClose = () => {
    window.electronAPI.closeWindow();
  };
  
  // Handle clearing the conversation
  const handleClearConversation = () => {
    setConversation([]);
    window.electronAPI.clearConversation();
  };
  
  // Toggle showing context
  const toggleShowContext = () => {
    setShowContext(!showContext);
  };
  
  // Scroll to the bottom when conversation updates
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [conversation]);

  // Render a chat message
  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    
    return (
      <div key={index}>
        <div 
          className={isUser ? 'user-message' : 'assistant-message'}
          ref={index === conversation.length - 1 ? outputRef : null}
        >
          {message.isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="thinking-animation">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0 }}>{message.content}</p>
          )}
        </div>
        
        {!isUser && message.context && showContext && (
          <div className="context-box">
            <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>Context:</p>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.context}</p>
          </div>
        )}
      </div>
    );
  };

  const appStyle = {
    backgroundColor: 'var(--base)',
    width: '100%',
    height: '100%',
    margin: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: 'var(--text)',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
  };
  
  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 10px',
    height: '34px',
    backgroundColor: 'black',
    borderBottom: '1px solid var(--surface0)',
    borderRadius: '8px 8px 0 0',
    overflow: 'hidden'
  };

  const logoStyle = {
    height: '22px',
    marginRight: '6px'
  };

  const titleStyle = {
    fontSize: '13px',
    fontWeight: 600,
    margin: 0,
    color: 'var(--text)'
  };
  
  const compressedStyle = {
    ...appStyle,
    width: 50,
    height: 50,
    borderRadius: '25px',
    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  };
  
  const contentStyle = {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    padding: 0,
    flex: 1,
    position: 'relative',
    height: 'calc(100% - 34px)',
    borderRadius: '0 0 8px 8px'
  };
  
  const chatContainerStyle = {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'transparent',
    height: 'calc(100% - 120px)', 
    minHeight: 200,
    padding: 12,
    margin: 0,
    scrollBehavior: 'smooth'
  };
  
  const emptyChatStyle = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'var(--overlay0)',
    textAlign: 'center',
    fontSize: '14px',
    opacity: 0.7
  };
  
  const messagesStyle = {
    display: 'flex',
    flexDirection: 'column',
    width: '100%'
  };
  
  const querySectionStyle = {
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    position: 'relative',
    borderRadius: '0 0 8px 8px'
  };
  
  const formStyle = {
    display: 'flex',
    gap: '8px',
    padding: '12px'
  };
  
  const inputStyle = {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '8px 12px',
    color: '#fff',
    fontSize: '13px',
    transition: 'all 0.2s ease'
  };
  
  const buttonStyle = {
    minWidth: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };
  
  const actionContainerStyle = {
    display: 'flex',
    gap: '8px',
    margin: '8px 0',
    justifyContent: 'center'
  };
  
  const actionButtonStyle = {
    ...buttonStyle,
    padding: '6px 12px'
  };
  
  const clearButtonStyle = {
    background: 'rgba(255, 255, 255, 0.07)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.8)',
    padding: '5px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };
  
  const contextButtonStyle = {
    ...clearButtonStyle
  };
  
  const statusContainerStyle = {
    width: '80%',
    maxWidth: '250px',
    padding: '4px 0',
    textAlign: 'center',
    height: '20px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '8px auto 0',
    borderRadius: '12px',
    position: 'relative',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
  };

  return (
    <div className="app-background" style={isCompressed ? compressedStyle : appStyle}>
      <div className="app-header" style={headerStyle}>
        <img src={spiderLogo} style={logoStyle} alt="Thiran Logo" className="app-logo" />
        <h1 style={titleStyle} className="app-title">thiran.</h1>
        <button onClick={closeButton} className="close-button"> X </button>
      </div>
      {!isCompressed && (
        <div style={contentStyle} className="app-content">
          <div style={chatContainerStyle} ref={chatContainerRef}>
            {conversation.length === 0 ? (
              <div style={emptyChatStyle}>
                <img 
                  src={spiderLogo} 
                  alt="Thiran Logo" 
                  style={{ 
                    width: '48px', 
                    height: '48px', 
                    marginBottom: '16px',
                    opacity: 0.5
                  }} 
                />
                <p>{folderPath ? 'Ask about your code...' : 'Select a folder to start'}</p>
              </div>
            ) : (
              <div style={messagesStyle}>
                {conversation.map(renderMessage)}
              </div>
            )}
          </div>
          
          <div style={querySectionStyle} className="input-section">
            <form style={formStyle} onSubmit={handleQuerySubmit} className="query-form">
              <input
                type="text"
                style={inputStyle}
                className="query-input"
                placeholder="Ask about code..."
                value={codeQuery}
                onChange={(e) => setCodeQuery(e.target.value)}
                disabled={isProcessingQuery || !folderPath}
              />
              <button 
                type="submit" 
                className="gradient-button"
                style={{
                  ...buttonStyle,
                  opacity: !folderPath || isProcessingQuery ? 0.5 : 1,
                  cursor: !folderPath || isProcessingQuery ? 'not-allowed' : 'pointer'
                }}
                disabled={!folderPath || isProcessingQuery}
              >
                {isProcessingQuery ? (
                  <span style={{ 
                    display: 'inline-block', 
                    width: '16px', 
                    height: '16px', 
                    border: '2px solid rgba(255, 255, 255, 0.3)', 
                    borderRadius: '50%', 
                    borderTopColor: 'white', 
                    animation: 'spin 1s linear infinite' 
                  }}></span>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </form>
            
            <div style={actionContainerStyle} className="action-container">
              <button 
                className="gradient-button"
                style={{
                  ...actionButtonStyle,
                  opacity: isLoading ? 0.7 : 1
                }}
                onClick={handleSelectFolder}
                disabled={isLoading}
                onMouseOver={(e) => !isLoading && (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseOut={(e) => !isLoading && (e.currentTarget.style.transform = 'translateY(0)')}
              >
                {isLoading ? (
                  <span style={{ 
                    display: 'inline-block', 
                    width: '16px', 
                    height: '16px', 
                    border: '2px solid rgba(255, 255, 255, 0.3)', 
                    borderRadius: '50%', 
                    borderTopColor: 'white', 
                    animation: 'spin 1s linear infinite' 
                  }}></span>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Open
                  </>
                )}
              </button>
              
              {conversation.length > 0 && (
                <>
                  <button 
                    style={clearButtonStyle}
                    className="secondary-button"
                    onClick={handleClearConversation}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Clear
                  </button>
                  
                  <button 
                    className={showContext ? "gradient-button" : "secondary-button"}
                    style={contextButtonStyle}
                    onClick={toggleShowContext}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/>
                    </svg>
                    Context
                  </button>
                </>
              )}
            </div>
            
            <div className="status-container" style={statusContainerStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>
                  {folderPath ? folderPath : "Select a directory to begin"}
                </span>
              </div>
            </div>
            
            {statusMessage && (
              <div className="processing-status" style={{
                position: 'fixed',
                bottom: '45px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(30, 30, 46, 0.8)',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '11px',
                color: 'var(--text)',
                zIndex: 10,
                backdropFilter: 'blur(4px)',
                border: '1px solid var(--surface0)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                animation: 'fadeIn 0.3s ease'
              }}>
                {statusMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
