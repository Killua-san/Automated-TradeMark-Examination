require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
// Note: contextMenu will be imported dynamically later
const path = require('path');
const { spawn } = require('child_process');
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Added for Gemini
const fs = require('fs');
const axios = require('axios'); // Added for API calls
const crypto = require('crypto'); // For generating unique IDs
const { initializeUpdater } = require('./src/updater'); // Changed to import initializeUpdater
// Removed AWS SDK imports

// --- API Configuration ---
// Attempt to load config. Adjust path if necessary based on build process.
let apiConfig;
try {
    // Assuming build process makes config available relative to main.js
    // If using webpack for main process, ensure aws-config.js is handled correctly.
    // CommonJS require might work if the config file isn't using ES modules strictly.
    // If this fails, might need IPC to get config from renderer or use environment variables.
    const configModule = require('./src/config/aws-config');
    apiConfig = configModule.apiConfig;
    if (!apiConfig || !apiConfig.baseUrl || apiConfig.baseUrl.includes('YOUR_API_GATEWAY')) {
        console.warn("Main Process: API Gateway URL not configured properly in aws-config.js or environment variables.");
        apiConfig = null; // Mark as not configured
    } else {
        console.log("Main Process: API Config loaded. Base URL:", apiConfig.baseUrl);
    }
} catch (err) {
    console.error("Main Process: Failed to load API configuration from ./src/config/aws-config.js.", err);
    apiConfig = null;
}

// --- Gemini AI Setup ---
let genAI;
let geminiInitializationPromise;

function initializeGemini() {
    if (!geminiInitializationPromise) {
        geminiInitializationPromise = (async () => {
            try {
                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey) {
                    throw new Error("GEMINI_API_KEY environment variable not set.");
                }
                console.log("Main Process: Initializing Gemini AI client...");
                genAI = new GoogleGenerativeAI(apiKey);
                console.log("Main Process: Gemini AI client initialized.");
                return true;
            } catch (error) {
                console.error('Main Process: Gemini AI initialization failed:', error);
                genAI = null;
                throw error;
            }
        })();
    }
    return geminiInitializationPromise;
}

// Function to format input using Gemini
async function formatInputWithGemini(text) {
    try {
        await initializeGemini(); // Ensure Gemini is initialized
        if (!genAI) throw new Error("Gemini AI client not initialized.");

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Using 2.0-flash model
        const prompt = `Your task is to reformat the following text so that distinct trademark descriptions are separated ONLY by a single semicolon.
- Identify distinct descriptions. They might be separated by newlines or existing semicolons.
- Replace newline characters or existing semicolons that separate distinct descriptions with a single semicolon.
- Pay close attention to grammatical structure. Commas used within a list (e.g., '...in the field of A, B, and C') are usually part of a *single* description and should NOT be replaced by semicolons.
- IMPORTANT: Do NOT change, rephrase, expand, explain, or modify the content of the descriptions themselves in any way. Preserve the original wording exactly.
- Do NOT add a semicolon at the very end of the entire output string.
- Critically evaluate if the input text represents one single, coherent description, even if it is long or contains internal lists using commas. If it appears to be a single description, return the original text verbatim without any changes.

Example of Correct Input (Do Not Change):
Input: \`Providing information in the fields of finance, investing, and real estate.\`
Reformatted Text: \`Providing information in the fields of finance, investing, and real estate.\`

Input Text:
${text}

Reformatted Text:`;

        console.log("Main Process: Sending prompt to Gemini with model gemini-2.0:", prompt); // Updated model name in log
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const formattedText = response.text();
        console.log("Main Process: Received formatted text from Gemini:", formattedText);
        return formattedText;

    } catch (error) {
        console.error('Main Process: Error calling Gemini API:', error);
        throw new Error(`Gemini API Error: ${error.message}`);
    }
}


// --- Electron App Setup ---
let mainWindow;
let pythonProcess = null;
let currentSearchType = null; // Track current search type (uspto or mgs)
const cancellationFile = path.join(__dirname, '..', 'python', 'cancel_search.tmp');

async function createWindow() { // Make the function async
    const contextMenu = (await import('electron-context-menu')).default;

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    mainWindow.loadURL('http://localhost:8080');
    // mainWindow.webContents.openDevTools();

    contextMenu({
        window: mainWindow,
        showSaveImageAs: true,
        showInspectElement: true
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (pythonProcess) {
            pythonProcess.kill();
            pythonProcess = null;
        }
    });
}

app.whenReady().then(async () => {
    try {
        // Initialize Gemini AI (DynamoDB init removed)
        await initializeGemini(); // Assuming Gemini setup is still needed
        await createWindow(); // Ensure window creation is awaited if it returns a promise implicitly

        // Initialize Updater (which includes IPC setup and scheduling) after window is created
        if (mainWindow) {
            await initializeUpdater(mainWindow); // Call the async initializer
        } else {
             console.error("Main Process: mainWindow not available after creation, cannot initialize updater.");
        }

    } catch (error) {
        console.error("Failed to create window, initialize Gemini, or setup updater:", error);
        app.quit();
    }
});


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

ipcMain.on('start-search', (event, searchTerms) => {
    startSearchProcess('uspto', searchTerms);
});

ipcMain.on('start-mgs-search', (event, searchTerms) => {
    startSearchProcess('mgs', searchTerms);
});

function startSearchProcess(searchType, searchTerms) {
    // General check: If any process is *actually* running (handle exists), block the new request.
    // This covers starting USPTO while MGS runs, MGS while MGS runs, USPTO while USPTO runs,
    // or starting MGS when USPTO is *truly* still running (not just the handle cleanup delay).
    if (pythonProcess) {
        console.warn(`Main Process: Attempted to start ${searchType} search while ${currentSearchType} is running (pythonProcess handle exists).`);
        dialog.showErrorBox('Search in Progress', `A ${currentSearchType || 'search'} is already running. Please wait or cancel.`);
        return;
    }

    // --- Proceed with starting the search if no process is running ---

    if (fs.existsSync(cancellationFile)) {
        try {
            fs.unlinkSync(cancellationFile);
        } catch (unlinkError) {
            console.error("Failed to delete cancellation file:", unlinkError);
        }
    }

    currentSearchType = searchType;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('search-started', searchType);
    }

    let scriptPath;
    if (searchType === 'uspto') {
        scriptPath = path.join(__dirname, '..', 'python', 'search_script.py');
    } else if (searchType === 'mgs') {
        scriptPath = path.join(__dirname, '..', 'python', 'mgs_search_script.py');
    } else {
        console.error('Unknown search type:', searchType);
        return;
    }

    try {
        let commandArgs = []; // Initialize as empty, only used for USPTO
        let dataForEnv = null; // Data for environment variable (MGS)

        // Determine script path and set up args/env data accordingly
        if (searchType === 'uspto') {
            scriptPath = path.join(__dirname, '..', 'python', 'search_script.py');
            // USPTO script expects args: --search_type, type, terms
            commandArgs = ['--search_type', searchType, searchTerms];
            console.log(`Main Process: Preparing USPTO script: python ${scriptPath} ${commandArgs.join(' ')}`);
        } else if (searchType === 'mgs') {
            scriptPath = path.join(__dirname, '..', 'python', 'mgs_search_script.py');
            // MGS script expects NO args, data via env var MGS_TASKS_JSON
            dataForEnv = searchTerms; // The JSON string
            // commandArgs remains empty []
            console.log(`Main Process: Preparing MGS script: python ${scriptPath} (JSON via env var MGS_TASKS_JSON)`);
        } else {
            // Should not happen if called from valid IPC handlers, but good practice
            throw new Error(`Unknown search type received: ${searchType}`);
        }

        // Spawn the process
        let spawnOptions = {
            env: { ...process.env } // Start with current environment, important for Python path etc.
        };

        if (searchType === 'mgs') {
            // Add the MGS_TASKS_JSON environment variable
            if (dataForEnv) {
                spawnOptions.env.MGS_TASKS_JSON = dataForEnv;
            } else {
                 console.warn("Main Process: MGS search initiated but no task data provided. Script might fail.");
                 // Consider sending an error back to renderer or throwing here?
                 // mainWindow.webContents.send('search-error', { message: 'MGS search started without tasks.' }, searchType);
                 // return; // Or stop execution
            }
            // Spawn MGS script with NO command line arguments (only script path)
            console.log(`Main Process: Spawning MGS: python ${scriptPath}`);
            // Explicitly ensure only scriptPath is passed as argument
            const mgsArgs = [scriptPath];
            pythonProcess = spawn('python', mgsArgs, spawnOptions);
        } else if (searchType === 'uspto') {
            // Spawn USPTO script with the prepared command line arguments
            console.log(`Main Process: Spawning USPTO: python ${scriptPath} ${commandArgs.join(' ')}`);
            pythonProcess = spawn('python', [scriptPath, ...commandArgs], spawnOptions);
        } else {
             // This case should have been caught earlier, but acts as a safeguard
             throw new Error(`Attempting to spawn unknown script type: ${searchType}`);
        }

        // Setup handlers for the spawned process (stdout, stderr, close)
        setupProcessHandlers(pythonProcess, searchType);

    } catch (spawnError) {
        console.error(`Error during ${searchType} process setup or spawn:`, spawnError);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('search-error', { message: `Failed to start ${searchType} process: ${spawnError.message}` }, searchType);
            mainWindow.webContents.send('search-finished', searchType); // Ensure finished is sent on error
        }
        pythonProcess = null;
        currentSearchType = null;
    }
}

function setupProcessHandlers(process, searchType) {
    let bufferedOutput = '';

    process.stdout.on('data', (data) => {
        bufferedOutput += data.toString();
        const lines = bufferedOutput.split('\n');
        bufferedOutput = lines.pop();

        lines.filter(line => line.trim() !== '').forEach(line => {
            try {
                const result = JSON.parse(line);
                if (!mainWindow || mainWindow.isDestroyed()) {
                    console.warn("Main window closed or destroyed, cannot send IPC message:", result);
                    return;
                }

                switch (result.type) {
                    case 'progress':
                        mainWindow.webContents.send('search-progress', result.value, searchType);
                        break;
                    case 'result':
                        if (result.source === 'uspto') {
                            mainWindow.webContents.send('search-result', result);
                        } else if (result.source?.startsWith('mgs-')) {
                            mainWindow.webContents.send('mgs-search-result', result);
                        } else {
                             console.warn(`Received result with unknown source: ${result.source}`, result);
                        }
                        break;
                    case 'error':
                         const errorSource = result.source || searchType;
                         mainWindow.webContents.send('search-error', result, errorSource);
                         break;
                    case 'search_time':
                        if (result.source === 'uspto') {
                             mainWindow.webContents.send('search-time', result);
                        } else if (result.source === 'mgs') {
                             mainWindow.webContents.send('mgs-search-time', result);
                        } else {
                             console.warn(`Received time report with unknown source: ${result.source}`, result);
                        }
                        break;
                    default:
                         console.warn(`Received message with unknown type: ${result.type}`, result);
                }
            } catch (e) {
                console.warn("DEBUG: Error parsing JSON:", e);
                console.warn("DEBUG: Problematic line:", line);
            }
        });
    });

    process.on('close', (code) => {
        console.log(`Python process for ${searchType} exited with code ${code}`);
        if (bufferedOutput.trim()) {
            // Try processing remaining buffer (less critical now)
        }
        // Clear the process handle *before* sending the finished signal
        pythonProcess = null;
        // Only reset currentSearchType if it matches the process that closed
        if (currentSearchType === searchType) {
            currentSearchType = null;
        }
        // Send finished signal with search type and exit code
        if (mainWindow && !mainWindow.isDestroyed()) {
             mainWindow.webContents.send('search-finished', { searchType, code });

             // If USPTO finished successfully, request the renderer to start MGS
             if (searchType === 'uspto' && code === 0) {
                 console.log("Main Process: USPTO finished successfully. Requesting renderer to start MGS search.");
                 mainWindow.webContents.send('request-mgs-start');
             }
        }
    });

    process.stderr.on('data', (data) => {
        const errorMessage = data.toString();
        console.error(`Python stderr (${searchType}): ${errorMessage}`);
        if (!errorMessage.includes('DEBUG:') && mainWindow && !mainWindow.isDestroyed()) {
            // Send structured error if possible, otherwise raw string
            try {
                const errorObj = JSON.parse(errorMessage);
                mainWindow.webContents.send('search-error', errorObj, searchType);
            } catch (e) {
                mainWindow.webContents.send('search-error', { message: errorMessage }, searchType);
            }
        }
    });
}

ipcMain.on('cancel-search', () => {
    if (pythonProcess) {
        console.log(`Main Process: Attempting to cancel ${currentSearchType} search...`);
        try {
            fs.writeFileSync(cancellationFile, 'cancel');
            // Sending SIGTERM might be more graceful if Python script handles it
            pythonProcess.kill('SIGTERM');
            // Fallback kill after a short delay if SIGTERM doesn't work
            setTimeout(() => {
                if (pythonProcess) {
                    console.log("Main Process: Force killing Python process after timeout.");
                    pythonProcess.kill('SIGKILL');
                }
            }, 500); // 500ms grace period
        } catch (error) {
            console.error("Error during cancel process:", error);
            if (pythonProcess) pythonProcess.kill('SIGKILL'); // Force kill on error
        } finally {
            pythonProcess = null;
            currentSearchType = null;
            // Note: search-finished is sent by the 'close' handler now
        }
    } else {
        console.log("Main Process: No active search process to cancel.");
    }
});

// --- IPC Handlers ---

// Handler for exporting data to a Word document
ipcMain.on('export-to-word', async (event, data) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
        console.error("Main Process: Cannot show save dialog, main window is closed.");
        return;
    }

    try {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Vague Results',
            defaultPath: 'vague-results.docx',
            filters: [
                { name: 'Word Documents', extensions: ['docx'] }
            ]
        });

        if (!canceled && filePath) {
            // Assuming 'data' received from renderer is an ArrayBuffer or Buffer
            // If it's something else (like base64 string), adjust conversion here
            const buffer = Buffer.from(data); // Ensure data is a Buffer
            fs.writeFile(filePath, buffer, (err) => {
                if (err) {
                    console.error('Main Process: Failed to save Word file:', err);
                    dialog.showErrorBox('Save Error', `Failed to save the file: ${err.message}`);
                } else {
                    console.log('Main Process: Word file saved successfully to:', filePath);
                    // Optionally, show a success message (though often not needed for save dialogs)
                    // dialog.showMessageBox(mainWindow, { type: 'info', title: 'Export Successful', message: 'Vague results exported successfully.' });
                }
            });
        } else {
            console.log('Main Process: Word file save cancelled by user.');
        }
    } catch (error) {
        console.error('Main Process: Error showing save dialog or writing file:', error);
        dialog.showErrorBox('Export Error', `An error occurred during export: ${error.message}`);
    }
});


ipcMain.handle('ai:format-input', async (event, text) => {
    console.log("Main Process: Received 'ai:format-input' request.");
    if (!text || typeof text !== 'string' || !text.trim()) {
        console.warn("Main Process: 'ai:format-input' received empty or invalid text.");
        return '';
    }
    try {
        const formattedText = await formatInputWithGemini(text);
        return formattedText;
    } catch (error) {
        console.error(`Main Process: Error handling 'ai:format-input':`, error);
        throw error;
    }
});

// IPC Handler for getting AI suggestions
ipcMain.handle('ai:get-suggestions', async (event, term, reason, example) => {
    console.log(`Main Process: Received 'ai:get-suggestions' for term: "${term}"`);
    if (!term || !reason) {
        throw new Error("Term and reason are required for AI suggestions.");
    }

    const scriptPath = path.join(__dirname, '..', 'python', 'search_script.py');
    const args = [
        scriptPath,
        '--suggest', // Mode argument
        '--term', term,
        '--reason', reason
    ];
    if (example) {
        args.push('--example', example);
    }

    console.log(`Main Process: Spawning Python for suggestions: python ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
        const suggestionProcess = spawn('python', args);
        let stdoutData = '';
        let stderrData = '';

        suggestionProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        suggestionProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.error(`Python Suggestion stderr: ${data}`); // Log stderr immediately
        });

        suggestionProcess.on('close', (code) => {
            console.log(`Python suggestion process exited with code ${code}`);
            if (stderrData.trim() && !stderrData.includes("DEBUG:")) {
                 // Reject if there was significant stderr output (excluding DEBUG lines)
                 reject(new Error(`Python script error: ${stderrData.trim()}`));
                 return;
            }
            if (code === 0) {
                try {
                    // Find the last JSON object/array in the output
                    const jsonMatch = stdoutData.match(/(\[.*\]|\{.*\})\s*$/);
                    if (!jsonMatch) {
                        throw new Error("No valid JSON found in the script output.");
                    }
                    const jsonString = jsonMatch[0];
                    const result = JSON.parse(jsonString);

                    if (result.type === 'suggestions') {
                        console.log(`Main Process: Received suggestions for "${term}":`, result.suggestions);
                        resolve(result.suggestions); // Resolve with the array of suggestions
                    } else if (result.type === 'error') {
                         console.error(`Main Process: Python script returned error: ${result.message}`);
                         reject(new Error(result.message));
                    } else if (result.suggestions?.error) { // Handle error structure from suggest_alternatives_gemini
                         console.error(`Main Process: AI suggestion function returned error: ${result.suggestions.error}`);
                         reject(new Error(result.suggestions.error));
                    }
                    else {
                         console.error(`Main Process: Unexpected JSON structure from Python script:`, result);
                         reject(new Error('Unexpected response structure from suggestion script.'));
                    }
                } catch (e) {
                    console.error(`Main Process: Error parsing JSON from Python suggestion script: ${e}`);
                    console.error(`Main Process: Raw stdout: ${stdoutData}`);
                    reject(new Error(`Failed to parse suggestions: ${e.message}`));
                }
            } else {
                reject(new Error(`Python suggestion script exited with code ${code}. Stderr: ${stderrData}`));
            }
        });

        suggestionProcess.on('error', (err) => {
            console.error('Main Process: Failed to start Python suggestion process:', err);
            reject(new Error(`Failed to start suggestion script: ${err.message}`));
        });
    });
});

// IPC Handler for requesting vagueness check only
ipcMain.handle('request-vagueness-check', async (event, term) => {
    console.log(`Main Process: Received 'request-vagueness-check' for term: "${term}"`);
    if (!term) {
        throw new Error("Term is required for vagueness check.");
    }

    const scriptPath = path.join(__dirname, '..', 'python', 'search_script.py');
    const args = [
        scriptPath,
        '--vagueness-only', // Mode argument
        '--term', term
    ];

    console.log(`Main Process: Spawning Python for vagueness check: python ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
        const vaguenessProcess = spawn('python', args);
        let stdoutData = '';
        let stderrData = '';

        vaguenessProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        vaguenessProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.error(`Python Vagueness stderr: ${data}`); // Log stderr immediately
        });

        vaguenessProcess.on('close', (code) => {
            console.log(`Python vagueness process exited with code ${code}`);
            if (stderrData.trim() && !stderrData.includes("DEBUG:")) {
                 reject(new Error(`Python script error: ${stderrData.trim()}`));
                 return;
            }
            if (code === 0) {
                try {
                    // Find the last JSON object in the output
                    const jsonMatch = stdoutData.match(/(\{.*\})\s*$/);
                    if (!jsonMatch) {
                        throw new Error("No valid JSON found in the vagueness script output.");
                    }
                    const jsonString = jsonMatch[0];
                    const result = JSON.parse(jsonString);

                    if (result.type === 'vagueness_result') {
                        console.log(`Main Process: Received vagueness result for "${term}":`, result);
                        // Resolve with the relevant parts: isVague and vaguenessReasoning
                        resolve({
                            isVague: result.isVague,
                            vaguenessReasoning: result.vaguenessReasoning,
                            error: result.error // Pass along any error reported by the script
                        });
                    } else if (result.type === 'error') {
                         console.error(`Main Process: Python script returned error during vagueness check: ${result.message}`);
                         reject(new Error(result.message));
                    } else {
                         console.error(`Main Process: Unexpected JSON structure from Python vagueness script:`, result);
                         reject(new Error('Unexpected response structure from vagueness script.'));
                    }
                } catch (e) {
                    console.error(`Main Process: Error parsing JSON from Python vagueness script: ${e}`);
                    console.error(`Main Process: Raw stdout: ${stdoutData}`);
                    reject(new Error(`Failed to parse vagueness result: ${e.message}`));
                }
            } else {
                reject(new Error(`Python vagueness script exited with code ${code}. Stderr: ${stderrData}`));
            }
        });

        vaguenessProcess.on('error', (err) => {
            console.error('Main Process: Failed to start Python vagueness process:', err);
            reject(new Error(`Failed to start vagueness script: ${err.message}`));
        });
    });
});


// --- IPC Handlers for Database Operations (Now using API Gateway) ---

// Helper function for making authenticated API calls
// Uses send/handleOnce pattern to get a fresh token from the renderer
async function callApi(method, path, data = null) {
    if (!apiConfig) {
        throw new Error("API Gateway URL is not configured.");
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error("Main window is not available to fetch token.");
    }

    // 1. Generate unique response channel
    const requestId = crypto.randomUUID();
    const responseChannel = `get-token-response-${requestId}`;

    let idToken;
    try {
        console.log(`Main Process: Requesting fresh token via channel ${responseChannel}...`);

        // 2. Set up a one-time handler for the response
        const tokenPromise = new Promise((resolve, reject) => {
            ipcMain.handleOnce(responseChannel, (event, token) => {
                if (token) {
                    console.log(`Main Process: Received token on ${responseChannel}.`);
                    resolve(token);
                } else {
                    console.error(`Main Process: Received null/undefined token on ${responseChannel}.`);
                    reject(new Error("Renderer did not provide a valid token."));
                }
            });

            // Set a timeout for the response
            setTimeout(() => {
                 // Check if the handler still exists; if so, it means no response was received
                 if (ipcMain.listeners(responseChannel).length > 0) {
                    ipcMain.removeHandler(responseChannel); // Clean up listener
                    console.error(`Main Process: Timeout waiting for token on ${responseChannel}.`);
                    reject(new Error("Timeout waiting for token response from renderer."));
                 }
            }, 10000); // 10 second timeout
        });

        // 3. Send the request to the renderer
        mainWindow.webContents.send('get-fresh-token-request', responseChannel);

        // 4. Await the token
        idToken = await tokenPromise;

    } catch (tokenError) {
        console.error("Main Process: Error during token request/response flow:", tokenError);
        // Ensure handler is removed on error
        if (ipcMain.listeners(responseChannel).length > 0) {
             ipcMain.removeHandler(responseChannel);
        }
        throw new Error(`Authentication Error: ${tokenError.message}`);
    }

    // Proceed with API call using the obtained token
    const url = `${apiConfig.baseUrl}${path}`;
    const headers = {
        'Authorization': `Bearer ${idToken}` // Use the freshly fetched token
    };

    try {
        console.log(`Main Process: Calling API - ${method} ${url}`);
        let response;
        if (method.toUpperCase() === 'GET') {
            response = await axios.get(url, { headers });
        } else if (method.toUpperCase() === 'POST') {
            headers['Content-Type'] = 'application/json';
            response = await axios.post(url, data, { headers });
        } else {
            throw new Error(`Unsupported HTTP method: ${method}`);
        }
        console.log(`Main Process: API call successful for ${method} ${url}`);
        return response.data; // Return the data from the API response
    } catch (error) {
        console.error(`Main Process: API call failed for ${method} ${url}:`, error.response?.data || error.message || error);
        // Rethrow a structured error or the original error
        const apiErrorMessage = error.response?.data?.message || error.message || 'Unknown API error';
        // Check if the error is specifically an 'Unauthorized' error from the API Gateway/Lambda
        if (error.response?.status === 401 || apiErrorMessage.toLowerCase().includes('unauthorized')) {
             throw new Error(`API Error: Unauthorized. Token might be invalid or expired.`);
        }
        throw new Error(`API Error: ${apiErrorMessage}`);
    }
}

// Modified IPC Handlers: Removed idToken from args, callApi fetches it internally

ipcMain.handle('db:store-match', async (event, resultData) => {
    // idToken is no longer passed directly from renderer for this operation
    console.log(`Main Process: Received db:store-match for term "${resultData.term}"`);
    try {
        // callApi now fetches the token internally
        const storedItem = await callApi('POST', '/match', resultData);
        console.log(`Main Process: API successfully stored item for ${resultData.term} - ${resultData.source}`);
        return storedItem;
    } catch (error) {
        console.error(`Main Process: Error in db:store-match via API for term "${resultData.term}":`, error);
        throw error; // Rethrowing allows renderer's catch block to handle it
    }
});

ipcMain.handle('db:get-match', async (event, { term }) => {
    // idToken is no longer passed directly
    console.log(`Main Process: Received db:get-match for term "${term}"`);
    if (!term) throw new Error("Term is required for db:get-match");
    try {
        // callApi fetches the token
        const sourceMap = await callApi('GET', `/match/${encodeURIComponent(term)}`);
        console.log(`Main Process: API returned ${Object.keys(sourceMap).length} sources for term ${term}`);
        return sourceMap;
    } catch (error) {
        console.error(`Main Process: Error in db:get-match via API for term "${term}":`, error);
        throw error;
    }
});

ipcMain.handle('db:get-match-by-source', async (event, { term, source }) => {
    // idToken is no longer passed directly
    console.log(`Main Process: Received db:get-match-by-source for term "${term}", source "${source}"`);
    if (!term || !source) throw new Error("Term and source are required for db:get-match-by-source");
    try {
        // callApi fetches the token
        const item = await callApi('GET', `/match/${encodeURIComponent(term)}/${encodeURIComponent(source)}`);
        console.log(`Main Process: API returned specific item for ${term} - ${source}: ${!!item}`);
        return item;
    } catch (error) {
        console.error(`Main Process: Error in db:get-match-by-source via API for term "${term}", source "${source}":`, error);
        throw error;
    }
});

// Revised DB Status Check Handler
ipcMain.handle('db:get-status', async (event) => {
    // idToken is no longer passed directly
    console.log("Main Process: Received db:get-status request.");
    if (!apiConfig) {
         return { connected: false, message: 'API Gateway URL not configured.' };
    }
    // The preliminary idToken check is removed as callApi will handle token fetching and errors

    try {
        console.log("Main Process: Checking API status via /status endpoint...");
        // callApi fetches the token
        const statusResult = await callApi('GET', '/status');
        console.log("Main Process: API status check successful:", statusResult);
        return statusResult;
    } catch (error) {
        // Catch errors from the callApi helper (including token fetch errors)
        console.error("Main Process: Error during db:get-status check via API:", error);
        // Provide a more generic error message if token fetching failed, or the API error if that failed
        const message = error.message.startsWith('Authentication Error:')
            ? `Authentication error: ${error.message.split(': ')[1]}`
            : `Backend API connection error: ${error.message || 'Unknown error'}`;
        return { connected: false, message: message };
    }
});
