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
      topK: 5,
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
  
  return matches.map(match => {
    const metadata = match.metadata;
    
    // For chunks with text preview
    if (metadata.chunkText) {
      return `File: ${metadata.fileName}\nPath: ${metadata.filePath}\nChunk ${metadata.chunkIndex + 1} of ${metadata.totalChunks}:\n${metadata.chunkText}`;
    }
    
    // For whole files with text preview
    if (metadata.fullText) {
      return `File: ${metadata.fileName}\nPath: ${metadata.filePath}\nContent:\n${metadata.fullText}`;
    }
    
    // Fallback
    return `File: ${metadata.fileName}\nPath: ${metadata.filePath}`;
  }).join('\n\n');
}

/**
 * Generate a response using OpenAI and the context from Pinecone
 * @param {string} query - User's query
 * @param {string} context - Context from code files
 * @returns {Promise<string>} - Generated response
 */
async function generateResponse(query, context) {
  try {
    // Prepare conversation history for context
    const messages = [
      { role: "system", content: `You are a helpful code assistant that answers questions about the user's codebase. Use the provided code context to inform your answers. Be concise and technical but also friendly. If you don't know something for certain, say so rather than guessing.` },
      ...conversationHistory,
      { role: "user", content: `Here is some context from my codebase:\n\n${context}\n\nMy question is: ${query}` }
    ];
    
    // Generate a response
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
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
      response: `Error generating response: ${error.message}`,
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
