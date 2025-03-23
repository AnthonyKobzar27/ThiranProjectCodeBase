/**
 * Reads files from a directory using Electron's IPC
 * and embeds them in Pinecone
 * @param {string} folderPath - Path to the folder to read
 * @returns {Promise<Array>} - Array of file objects
 */
const readFiles = async (folderPath) => {
    console.log('Reading files from:', folderPath);
    try {
        // Use the electronAPI to read files instead of direct fs access
        const files = await window.electronAPI.readFiles(folderPath);
        
        // We'll embed files from the main process to avoid CORS issues
        // This approach keeps the renderer process clean and secure
        if (files && files.length > 0) {
            console.log(`Read ${files.length} files. Processing for embedding...`);
            await window.electronAPI.embedFiles(files);
        }
        
        return files;
    } catch (error) {
        console.error('Error reading files:', error);
        return [];
    }
}  

export default readFiles;