const { Pinecone } = require('@pinecone-database/pinecone');
const { OpenAI } = require('openai');
require('dotenv').config({ override: true });

// Initialize OpenAI and Pinecone clients
let pinecone;
let openai;
let index;

// Store conversation context
let conversationHistory = [];

// Initialize the clients
function initClients() {
  if (openai && pinecone && index) return;

  console.log('Initializing OpenAI and Pinecone clients...');
  
  // Check for required environment variables
  const requiredVars = [
    'PINECONE_API_KEY',
    'PINECONE_INDEX_NAME',
    'OPENAI_API_KEY'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Initialize Pinecone
  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
  
  // Initialize OpenAI
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  // Get Pinecone index
  index = pinecone.index(process.env.PINECONE_INDEX_NAME);
}

/**
 * Generate an embedding for the query
 * @param {string} query - User query text
 * @returns {Promise<number[]>} - Embedding vector
 */
async function generateQueryEmbedding(query) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error);
    throw error;
  }
}

/**
 * Search Pinecone for relevant code context
 * @param {number[]} queryVector - Query embedding vector
 * @returns {Promise<Array>} - Relevant matches with their metadata
 */
async function searchPinecone(queryVector) {
  try {
    const results = await index.query({
      vector: queryVector,
      topK: 10, 
      includeMetadata: true
    });
    
    return results.matches || [];
  } catch (error) {
    console.error('Error searching Pinecone:', error);
    throw error;
  }
}

/**
 * Extract relevant code context from Pinecone results
 * @param {Array} matches - Matches from Pinecone query
 * @returns {string} - Formatted context for the AI
 */
function extractContextFromMatches(matches) {
  if (!matches || matches.length === 0) {
    return "No relevant code found.";
  }
  
  // Group matches by file to consolidate context
  const fileGroups = {};
  
  matches.forEach(match => {
    const metadata = match.metadata;
    const filePath = metadata.filePath;
    
    if (!fileGroups[filePath]) {
      fileGroups[filePath] = {
        fileName: metadata.fileName,
        filePath: metadata.filePath,
        chunks: [],
        score: match.score
      };
    }
    
    // Add chunk or full file content
    if (metadata.isPartial) {
      fileGroups[filePath].chunks.push({
        index: metadata.chunkIndex,
        totalChunks: metadata.totalChunks,
        text: metadata.chunkText,
        score: match.score
      });
    } else {
      fileGroups[filePath].fullText = metadata.fullText;
    }
  });
  
  // Format the context, prioritizing complete files and consolidating chunks
  let contextParts = [];
  
  Object.values(fileGroups).forEach(file => {
    let fileContext = `File: ${file.fileName}\nPath: ${file.filePath}\n\nContent:\n`;
    
    if (file.fullText) {
      // We have the full file content
      fileContext += file.fullText;
    } else if (file.chunks.length > 0) {
      // Sort chunks by index
      const sortedChunks = file.chunks.sort((a, b) => a.index - b.index);
      
      // Combine chunks, noting any gaps
      let lastIndex = -1;
      sortedChunks.forEach(chunk => {
        if (lastIndex !== -1 && chunk.index > lastIndex + 1) {
          fileContext += `\n[...missing content...]\n\n`;
        }
        fileContext += chunk.text;
        lastIndex = chunk.index;
      });
      
      // Note if we're missing the end of the file
      if (sortedChunks.length > 0 && 
          sortedChunks[sortedChunks.length - 1].index < sortedChunks[0].totalChunks - 1) {
        fileContext += `\n[...missing content...]\n`;
      }
    }
    
    contextParts.push(fileContext);
  });
  
  return contextParts.join('\n\n' + '-'.repeat(80) + '\n\n');
}

/**
 * Generate a response using OpenAI and the context from Pinecone
 * @param {string} query - User's query
 * @param {string} context - Context from code files
 * @returns {Promise<object>} - Generated response
 */
async function generateResponse(query, context) {
  try {
    // Prepare conversation history for context
    const messages = [
      { role: "system", content: `You are a high-level code summarizer. Focus on what the application DOES, not how it works. Describe functionality in 2-3 sentences maximum. Example: "This code creates a website with contact pages for founders and sponsors, plus a demo page. The company is based in SF." Avoid technical details unless specifically asked. Never list imports, hooks, or code structure. if you are saying a list of items - make sure to use bullet points and make your responses as formatted and organized and good looking as possible.` },
      ...conversationHistory,
      { role: "user", content: `Here is code context:\n\n${context}\n\nMy question: ${query}` }
    ];
    
    // Generate a response
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo", 
      messages: messages,
      max_tokens: 200, 
      temperature: 0.2,
    });
    
    // Get the response text
    const responseText = completion.choices[0].message.content;
    
    // Update conversation history
    conversationHistory.push({ role: "user", content: query });
    conversationHistory.push({ role: "assistant", content: responseText });
    
    // Keep conversation history manageable (last 10 messages)
    if (conversationHistory.length > 10) {
      conversationHistory = conversationHistory.slice(conversationHistory.length - 10);
    }
    
    return {
      response: responseText,
      context: context,
      success: true
    };
  } catch (error) {
    console.error('Error generating response:', error);
    return {
      response: `Error: ${error.message}`,
      context: context,
      success: false
    };
  }
}

/**
 * Process a query and get a response
 * @param {string} query - User's query
 * @returns {Promise<object>} - Response object
 */
async function processQuery(query) {
  try {
    initClients();
    
    // Generate embedding for the query
    const queryVector = await generateQueryEmbedding(query);
    
    // Search Pinecone for relevant code
    const matches = await searchPinecone(queryVector);
    
    // Extract context from the matches
    const context = extractContextFromMatches(matches);
    
    // Generate a response
    const response = await generateResponse(query, context);
    
    return response;
  } catch (error) {
    console.error('Error processing query:', error);
    return {
      response: `I encountered an error while processing your query: ${error.message}`,
      context: null,
      success: false
    };
  }
}

/**
 * Clear the conversation history
 */
function clearConversation() {
  conversationHistory = [];
  return { success: true, message: 'Conversation history cleared' };
}

module.exports = { 
  processQuery,
  clearConversation
};
