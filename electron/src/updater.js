const { app, net, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const axios = require('axios');
const cheerio = require('cheerio');
// Use dynamic import for electron-store (ESM module)
let Store;
let store;
const initializeStore = async () => {
    if (!store) {
        const module = await import('electron-store');
        Store = module.default; // Access the default export
        store = new Store();
        console.log("Electron-store initialized.");
    }
};


// --- Configuration ---
const USPTO_PAGE_URL = 'https://idm-tmng.uspto.gov/id-master-list-public.html';
const EXCEL_DOWNLOAD_URL = 'https://idm-tmng.uspto.gov/idm2-services/download/public/saveexcel?class-valid=true&=*&search-by=all&search-mode-value=&status=A&status=M&status=X&status=D&class-num=&version=undefined&selected-fields=term-id,class-num,description,status,start-eff-date,start-eff-date,type,notes,TM5,version';
const RECORD_COUNT_SELECTOR = '.modal-title'; // Updated Selector: Try finding the modal title directly
const RECORD_COUNT_REGEX = /\((\d+)\s+records\)/; // Regex to extract the number
const CONVERSION_SCRIPT_PATH = path.resolve(__dirname, '../../scripts/convert-excel-to-json.cjs');
const OUTPUT_JSON_PATH = path.resolve(__dirname, './assets/id_manual_data.json');
const DOWNLOAD_DIR = path.join(app.getPath('temp'), 'uspto-manual-update'); // Temporary download location
const STORE_KEY_RECORD_COUNT = 'lastKnownRecordCount';
// --- End Configuration ---

let isChecking = false; // Prevent concurrent checks

// Helper to send status updates to the renderer process
function sendStatus(mainWindow, status, message = '') {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', { status, message });
    }
    console.log(`Update Status: ${status} ${message}`);
}

// 1. Get the last known record count (now async)
async function getLastKnownRecordCount() {
    await initializeStore(); // Ensure store is initialized
    return store.get(STORE_KEY_RECORD_COUNT, 0); // Default to 0 if not found
}

// 2. Store the new record count (now async)
async function storeRecordCount(count) {
    await initializeStore(); // Ensure store is initialized
    store.set(STORE_KEY_RECORD_COUNT, count);
}

// 3. Fetch the current record count from the USPTO website
async function fetchCurrentRecordCount(mainWindow) {
    sendStatus(mainWindow, 'checking', 'Fetching latest record count from USPTO...');
    try {
        const response = await axios.get(USPTO_PAGE_URL, { timeout: 30000 }); // 30s timeout
        const html = response.data;
        const $ = cheerio.load(html);

        let foundCount = null;
        // Look for the specific text containing the record count
        $(RECORD_COUNT_SELECTOR).each((i, elem) => {
            const text = $(elem).text();
            const match = text.match(RECORD_COUNT_REGEX);
            if (match && match[1]) {
                foundCount = parseInt(match[1], 10);
                return false; // Stop searching once found
            }
        });

        if (foundCount === null) {
            throw new Error(`Could not find record count text matching regex on ${USPTO_PAGE_URL} using selector ${RECORD_COUNT_SELECTOR}`);
        }

        sendStatus(mainWindow, 'checking', `Found record count: ${foundCount}`);
        return foundCount;
    } catch (error) {
        console.error('Error fetching or parsing USPTO page:', error);
        sendStatus(mainWindow, 'error', `Failed to fetch or parse USPTO page: ${error.message}`);
        throw error; // Re-throw to stop the process
    }
}

// 4. Download the Excel file
async function downloadExcelFile(mainWindow) {
    const downloadPath = path.join(DOWNLOAD_DIR, `idmanual_${Date.now()}.xlsx`);
    sendStatus(mainWindow, 'downloading', `Downloading Excel file to ${downloadPath}...`);

    try {
        // Ensure download directory exists
        if (!fs.existsSync(DOWNLOAD_DIR)) {
            fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
        }

        const response = await axios({
            method: 'get',
            url: EXCEL_DOWNLOAD_URL,
            responseType: 'stream',
            timeout: 300000 // 5 minutes timeout for potentially large file
        });

        const writer = fs.createWriteStream(downloadPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                sendStatus(mainWindow, 'downloading', 'Download complete.');
                resolve(downloadPath);
            });
            writer.on('error', (err) => {
                console.error('Error writing downloaded file:', err);
                sendStatus(mainWindow, 'error', `Failed to write downloaded file: ${err.message}`);
                if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath); // Clean up partial file
                reject(err);
            });
            response.data.on('error', (err) => {
                 console.error('Error during download stream:', err);
                 sendStatus(mainWindow, 'error', `Download stream error: ${err.message}`);
                 if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath); // Clean up partial file
                 reject(err);
            });
        });
    } catch (error) {
        console.error('Error initiating download:', error);
        sendStatus(mainWindow, 'error', `Failed to initiate download: ${error.message}`);
        if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath); // Clean up
        throw error;
    }
}

// 5. Run the conversion script
function runConversionScript(mainWindow, downloadedExcelPath) {
    sendStatus(mainWindow, 'converting', `Running conversion script for ${downloadedExcelPath}...`);
    return new Promise((resolve, reject) => {
        const process = fork(CONVERSION_SCRIPT_PATH, [downloadedExcelPath], { stdio: 'pipe' });

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
            console.log(`Conversion script stdout: ${data}`);
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(`Conversion script stderr: ${data}`);
        });

        process.on('error', (err) => {
            console.error('Failed to start conversion script:', err);
            sendStatus(mainWindow, 'error', `Failed to start conversion script: ${err.message}`);
            reject(err);
        });

        process.on('close', (code) => {
            if (code === 0) {
                sendStatus(mainWindow, 'converting', 'Conversion script finished successfully.');
                resolve(OUTPUT_JSON_PATH); // Return path to the final JSON
            } else {
                const errorMsg = `Conversion script exited with code ${code}. Stderr: ${stderr || 'N/A'}`;
                console.error(errorMsg);
                sendStatus(mainWindow, 'error', errorMsg);
                reject(new Error(errorMsg));
            }
        });
    });
}

// 6. Orchestrate the update check
async function checkForUpdates(mainWindow, isManualTrigger = false) {
    if (isChecking) {
        console.log('Update check already in progress.');
        sendStatus(mainWindow, 'checking', 'Update check already in progress.');
        return;
    }
    isChecking = true;
    sendStatus(mainWindow, 'checking', 'Starting update check...');

    let downloadedExcelPath = null; // Keep track for cleanup

    try {
        // --- Removed Record Count Check ---
        // We are now skipping the check and proceeding directly to download/convert
        // This avoids issues with scraping dynamic content but might download unnecessarily.
        // TODO: Implement Playwright or find a static indicator for a more efficient check later.
        await initializeStore(); // Still need store for potential future use

        if (isManualTrigger) {
            sendStatus(mainWindow, 'checking', `Manual update triggered. Proceeding to download...`);
        } else {
            // Automatic trigger (weekly)
            sendStatus(mainWindow, 'checking', `Scheduled update triggered. Proceeding to download...`);
        }

        downloadedExcelPath = await downloadExcelFile(mainWindow);
        const finalJsonPath = await runConversionScript(mainWindow, downloadedExcelPath);

        // Update successful - Removed storing record count as we didn't fetch it
        // await storeRecordCount(currentRecordCount); // Removed
        sendStatus(mainWindow, 'update-complete', `Update successful. New data saved to ${finalJsonPath}.`); // Removed record count from message
        // Notify renderer to potentially reload data
         if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('data-updated');
            }
        // --- End of Removed Record Count Check Logic ---

    } catch (error) {
        // Error handling remains largely the same, but the error source is less likely
        // to be the fetchCurrentRecordCount function now.
        console.error('Update process failed:', error);
        // Status already sent by the function that failed
    } finally {
        // Clean up downloaded Excel file
        if (downloadedExcelPath && fs.existsSync(downloadedExcelPath)) {
            try {
                fs.unlinkSync(downloadedExcelPath);
                console.log(`Cleaned up temporary file: ${downloadedExcelPath}`);
            } catch (cleanupError) {
                console.error(`Error cleaning up temporary file ${downloadedExcelPath}:`, cleanupError);
            }
        }
        isChecking = false;
        sendStatus(mainWindow, 'idle'); // Signal completion of the check process
    }
}

// Define setup and scheduling functions before they are used by initializeUpdater
const setupUpdaterIPC = (mainWindow) => {
     ipcMain.handle('request-update-check', async () => { // Make handler async
         console.log("IPC Received: 'request-update-check'");
         // Don't pass mainWindow directly into the async handler if it might close
         // Instead, ensure mainWindow is valid inside checkForUpdates
         await checkForUpdates(mainWindow, true); // Manual trigger, now awaited
    });
};

const scheduleAutoUpdate = (mainWindow, intervalMinutes = 60 * 24 * 7) => { // Default: weekly
    console.log(`Scheduling automatic update check every ${intervalMinutes} minutes.`);
    // Initial check shortly after startup (e.g., 2 minutes)
    // Use async IIFE for the async check
    setTimeout(async () => {
        try {
            await checkForUpdates(mainWindow, false);
        } catch (err) {
            console.error("Error during initial scheduled update check:", err);
        }
    }, 2 * 60 * 1000);
    // Subsequent checks at the specified interval
    setInterval(async () => {
         try {
            await checkForUpdates(mainWindow, false);
        } catch (err) {
            console.error("Error during periodic scheduled update check:", err);
        }
    }, intervalMinutes * 60 * 1000);
};


// Ensure store is initialized before setting up IPC/scheduling
async function initializeUpdater(mainWindow) {
    await initializeStore();
    setupUpdaterIPC(mainWindow); // Now calls the function defined above
    scheduleAutoUpdate(mainWindow); // Now calls the function defined above
}

module.exports = {
    initializeUpdater, // Export the async initializer
    // Also export checkForUpdates if it needs to be called directly elsewhere (unlikely now)
    checkForUpdates
    // We don't strictly need to export setupUpdaterIPC and scheduleAutoUpdate anymore
    // as they are internal helpers called by initializeUpdater, but it doesn't hurt.
};
