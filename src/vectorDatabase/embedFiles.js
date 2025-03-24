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
 * Determine if a file should be skipped based on path or other criteria
 * @param {string} filePath - Path to the file
 * @returns {boolean} - True if the file should be skipped
 */
function shouldSkipFile(filePath) {
  // Skip files based on extension
  const extension = path.extname(filePath).toLowerCase();
  
  // Expanded list of extensions to skip
  const skipExtensions = [
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg', '.webp', '.tiff',
    // Audio
    '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a',
    // Video
    '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
    // Archives
    '.zip', '.rar', '.tar', '.gz', '.7z', '.jar', '.war',
    // Binaries
    '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
    // Documents
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    // Fonts
    '.ttf', '.otf', '.woff', '.woff2',
    // Other
    '.lock', '.log', '.tmp', '.cache', '.bak',
    // Design files
    '.psd', '.ai', '.sketch', '.fig',
    // Database files
    '.db', '.sqlite', '.sqlite3',
  ];
  
  if (skipExtensions.includes(extension)) {
    return true;
  }

  // Skip based on path patterns
  const skipPatterns = [
    'node_modules',
    'dist',
    'build',
    '.git',
    '.github',
    '.vscode',
    '.idea',
    '__pycache__',
    '.DS_Store',
    'coverage',
    'temp',
    'tmp',
    'vendor',
    'bower_components',
    'target',
    '.next',
    'out',
  ];

  return skipPatterns.some(pattern => filePath.includes(pattern));
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
    
    // Check if file should be skipped
    if (shouldSkipFile(filePath)) {
      return '';
    }

    // File size limit to avoid processing extremely large files (5MB)
    const stats = fs.statSync(filePath);
    if (stats.size > 5 * 1024 * 1024) {
      console.log(`Skipping large file (over 5MB): ${filePath}`);
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
 * Generate a hash for file content to use for caching
 * @param {string} content - File content
 * @returns {string} - Hash of the content
 */
function generateContentHash(content) {
  // Simple hash function for caching purposes
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

/**
 * Get existing vectors for a file path from Pinecone
 * @param {string} filePath - Path to check
 * @returns {Promise<Array>} - Array of existing vectors
 */
async function getExistingVectors(filePath) {
  try {
    // Query for vectors with this file path
    const result = await index.query({
      vector: Array(1536).fill(0), // Dummy vector
      filter: { filePath },
      includeMetadata: true,
      topK: 100,
    });
    
    return result.matches || [];
  } catch (error) {
    console.error(`Error checking for existing vectors: ${error.message}`);
    return [];
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
      
      // Generate a content hash for caching purposes
      const contentHash = generateContentHash(content);
      
      // Check if this file is already embedded with the same content
      const existingVectors = await getExistingVectors(file.path);
      const hasChanged = !existingVectors.some(v => 
        v.metadata && v.metadata.contentHash === contentHash
      );
      
      if (!hasChanged && existingVectors.length > 0) {
        console.log(`Skipping unchanged file: ${file.path}`);
        continue;
      }
      
      // For large files, split into chunks with a balanced chunk size
      const chunkSize = 2500; // Reduced from 4000 to 2500 characters to save credits
      
      if (content.length > chunkSize) {
        // Only process up to 20 chunks per file to limit API usage
        const maxChunks = 20;
        
        // Split into chunks with some overlap
        const chunks = [];
        let startPos = 0;
        
        while (startPos < content.length && chunks.length < maxChunks) {
          const endPos = Math.min(startPos + chunkSize, content.length);
          chunks.push(content.slice(startPos, endPos));
          startPos += chunkSize - 400; // 400 character overlap
          
          if (startPos >= content.length) break;
        }
        
        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
          // Skip chunks that are mostly whitespace or very short
          const trimmedChunk = chunks[i].trim();
          if (trimmedChunk.length < 100) {
            continue;
          }
          
          const embedding = await generateEmbedding(chunks[i]);
          
          vectors.push({
            id: `${file.path}_chunk_${i}_${contentHash}`,
            values: embedding,
            metadata: {
              fileName: file.name,
              filePath: file.path,
              fileSize: file.size,
              lastModified: file.lastModified,
              chunkIndex: i,
              totalChunks: chunks.length,
              chunkText: chunks[i], // Store the full chunk text
              isPartial: true,
              contentHash
            }
          });
        }
      } else {
        // Process the whole file as one chunk
        const embedding = await generateEmbedding(content);
        
        vectors.push({
          id: `${file.path}_${contentHash}`,
          values: embedding,
          metadata: {
            fileName: file.name,
            filePath: file.path,
            fileSize: file.size,
            lastModified: file.lastModified,
            fullText: content, // Store the full text
            isPartial: false,
            contentHash
          }
        });
      }
      
      // Delete old vectors for this file if content has changed
      if (hasChanged && existingVectors.length > 0) {
        const idsToDelete = existingVectors.map(v => v.id);
        if (idsToDelete.length > 0) {
          await index.deleteMany(idsToDelete);
          console.log(`Deleted ${idsToDelete.length} outdated vectors for ${file.path}`);
        }
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
    return { success: false, error: error.message };
  }
  
  console.log(`Processing ${files.length} files...`);
  
  // Filter out files that should be skipped before batching
  const validFiles = files.filter(file => !file.isDirectory && !shouldSkipFile(file.path));
  console.log(`Filtered down to ${validFiles.length} valid files for processing`);
  
  // Limit the total number of files processed to save credits (if there are too many)
  const maxFilesToProcess = 200;
  const filesToProcess = validFiles.length > maxFilesToProcess ? 
    validFiles.slice(0, maxFilesToProcess) : 
    validFiles;
  
  if (validFiles.length > maxFilesToProcess) {
    console.log(`Limiting processing to ${maxFilesToProcess} files to save API credits`);
  }
  
  // Process files in batches to avoid overwhelming the APIs
  const batchSize = 5;
  let totalVectorsCreated = 0;
  
  for (let i = 0; i < filesToProcess.length; i += batchSize) {
    const batch = filesToProcess.slice(i, i + batchSize);
    const startingVectorCount = totalVectorsCreated;
    
    await processBatch(batch);
    
    // Count vectors created in this batch
    for (const file of batch) {
      const existingVectors = await getExistingVectors(file.path);
      totalVectorsCreated += existingVectors.length - startingVectorCount;
    }
    
    console.log(`Completed batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(filesToProcess.length / batchSize)}`);
  }
  
  console.log('All files processed and embedded!');
  return { 
    success: true, 
    message: `Successfully processed ${filesToProcess.length} files and created ${totalVectorsCreated} vectors` 
  };
}

module.exports = { processFiles };
