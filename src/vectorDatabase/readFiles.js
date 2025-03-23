/**
 * Reads files from a directory using Electron's IPC
 * @param {string} folderPath - Path to the folder to read
 * @returns {Promise<Array>} - Array of file objects
 */
const readFiles = async (folderPath) => {
    console.log('Reading files from:', folderPath);
    try {
        // Use the electronAPI to read files instead of direct fs access
        return await window.electronAPI.readFiles(folderPath);
    } catch (error) {
        console.error('Error reading files:', error);
        return [];
    }
}  

export default readFiles;