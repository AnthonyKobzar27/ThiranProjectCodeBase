const fs = require('fs');
const path = require('path');
const { Pinecone } = require('@pinecone-database/pinecone');
const { OpenAI } = require('openai');
require('dotenv').config({ override: true });

// Initialize variables
let pinecone;
let openai;
let index;

// Validate environment variables
function validateEnv() {
  const requiredVars = [
    'PINECONE_API_KEY',
    'PINECONE_ENVIRONMENT',
    'PINECONE_INDEX_NAME',
    'OPENAI_API_KEY'
  ];
  
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Please add these to your .env file.`);
  }
  
  // Initialize clients after validation
  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
  
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  index = pinecone.index(process.env.PINECONE_INDEX_NAME);
  
  return true;
}

/**
 * Extract content from a file based on its type
 * @param {string} filePath - Path to the file
 * @returns {string} - The extracted content
 */
function extractFileContent(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return '';
    }
    
    // Get file extension
    const extension = path.extname(filePath).toLowerCase();
    
    // List of extensions to skip
    const skipExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',  // Images
      '.mp3', '.wav', '.ogg', '.flac', '.aac',                  // Audio
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',          // Video
      '.zip', '.rar', '.tar', '.gz', '.7z',                     // Archives
      '.exe', '.dll', '.so', '.dylib',                          // Binaries
      '.pdf', '.doc', '.docx', '.xls', '.xlsx',                 // Documents (could be handled with specialized extractors)
      '.ttf', '.otf', '.woff', '.woff2',                        // Fonts
    ];
    
    if (skipExtensions.includes(extension)) {
      return '';
    }
    
    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`Error extracting content from ${filePath}:`, error.message);
    return '';
  }
}

/**
 * Generate embeddings for text using OpenAI
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - The embedding vector
 */
async function generateEmbedding(text) {
  try {
    // Truncate text to avoid token limits (OpenAI has a limit)
    const truncatedText = text.slice(0, 8000);
    
    // Generate embedding
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: truncatedText,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    throw error;
  }
}

/**
 * Process a batch of files to embed in Pinecone
 * @param {Array} batch - Batch of files to process
 * @returns {Promise<void>}
 */
async function processBatch(batch) {
  const vectors = [];
  
  for (const file of batch) {
    try {
      if (file.isDirectory) {
        continue; // Skip directories
      }
      
      console.log(`Processing file: ${file.path}`);
      
      // Extract content
      const content = extractFileContent(file.path);
      if (!content) {
        console.log(`Skipping empty or binary file: ${file.path}`);
        continue;
      }
      
      // For large files, split into chunks with larger chunk size
      const chunkSize = 4000; // Increased from 1000 to 4000 characters per chunk
      
      if (content.length > chunkSize) {
        // Split into chunks with some overlap
        const chunks = [];
        let startPos = 0;
        
        while (startPos < content.length) {
          const endPos = Math.min(startPos + chunkSize, content.length);
          chunks.push(content.slice(startPos, endPos));
          startPos += chunkSize - 500; // 500 character overlap (increased from 200)
          
          if (startPos >= content.length) break;
        }
        
        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
          const embedding = await generateEmbedding(chunks[i]);
          
          vectors.push({
            id: `${file.path}_chunk_${i}`,
            values: embedding,
            metadata: {
              fileName: file.name,
              filePath: file.path,
              fileSize: file.size,
              lastModified: file.lastModified,
              chunkIndex: i,
              totalChunks: chunks.length,
              chunkText: chunks[i], // Store the full chunk text instead of just a preview
              isPartial: true
            }
          });
        }
      } else {
        // Process the whole file as one chunk
        const embedding = await generateEmbedding(content);
        
        vectors.push({
          id: file.path,
          values: embedding,
          metadata: {
            fileName: file.name,
            filePath: file.path,
            fileSize: file.size,
            lastModified: file.lastModified,
            fullText: content, // Store the full text instead of just a preview
            isPartial: false
          }
        });
      }
    } catch (error) {
      console.error(`Error processing file ${file.path}:`, error.message);
    }
  }
  
  if (vectors.length > 0) {
    try {
      // Store vectors in Pinecone
      await index.upsert(vectors);
      console.log(`Successfully embedded ${vectors.length} vectors`);
    } catch (error) {
      console.error('Error storing vectors in Pinecone:', error.message);
    }
  }
}

/**
 * Process an array of files for embedding in Pinecone
 * @param {Array} files - Array of file objects to process
 * @returns {Promise<void>}
 */
async function processFiles(files) {
  try {
    validateEnv();
  } catch (error) {
    console.error(error);
    return;
  }
  
  console.log(`Processing ${files.length} files...`);
  
  // Process files in batches to avoid overwhelming the APIs
  const batchSize = 5
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await processBatch(batch);
    console.log(`Completed batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(files.length / batchSize)}`);
  }
  
  console.log('All files processed and embedded!');
}

module.exports = { processFiles };
