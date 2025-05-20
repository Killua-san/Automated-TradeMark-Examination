// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startSearch: (searchTerms) => ipcRenderer.send('start-search', searchTerms),
    startMgsSearch: (searchTerms) => ipcRenderer.send('start-mgs-search', searchTerms), // New MGS API
    cancelSearch: () => ipcRenderer.send('cancel-search'),
    exportToWord: (data) => ipcRenderer.send('export-to-word', data), // Added for Word export
    onSearchStarted: (callback) => ipcRenderer.on('search-started', callback),
    onSearchProgress: (callback) => ipcRenderer.on('search-progress', callback),
    onSearchResult: (callback) => ipcRenderer.on('search-result', callback),
    onMgsSearchResult: (callback) => ipcRenderer.on('mgs-search-result', callback), // New MGS result channel
    onSearchError: (callback) => ipcRenderer.on('search-error', callback),
    onSearchTime: (callback) => ipcRenderer.on('search-time', callback),
    onMgsSearchTime: (callback) => ipcRenderer.on('mgs-search-time', callback), // New MGS search time channel
    onSearchFinished: (callback) => ipcRenderer.on('search-finished', callback),
    onRequestMgsStart: (callback) => ipcRenderer.on('request-mgs-start', callback), // Added for main process to trigger MGS start
    // Removed clearOutput listener exposure as it wasn't used consistently
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

    // AI operations
    formatInput: (text) => ipcRenderer.invoke('ai:format-input', text),
    // New function to get AI suggestions
    getAiSuggestions: (term, reason, example) => ipcRenderer.invoke('ai:get-suggestions', term, reason, example),
    // New function for vagueness check only
    checkVagueness: (term) => ipcRenderer.invoke('request-vagueness-check', term),

    // --- Updater Functionality ---
    requestUpdateCheck: () => ipcRenderer.invoke('request-update-check'),
    // Listen for status updates from the main process
    onUpdateStatus: (callback) => {
        const subscription = (_event, status) => callback(status);
        ipcRenderer.on('update-status', subscription);
        return () => ipcRenderer.removeListener('update-status', subscription); // Return cleanup function
    },
    // Listen for signal that data has been updated
    onDataUpdated: (callback) => {
        const subscription = (_event) => callback();
        ipcRenderer.on('data-updated', subscription);
        return () => ipcRenderer.removeListener('data-updated', subscription); // Return cleanup function
    },
    // --- End Updater ---

    // Generic 'on' listener exposure
    on: (channel, callback) => {
        // Consider adding channel validation here for security if needed
        const subscription = (_event, ...args) => callback(...args);
        ipcRenderer.on(channel, subscription);
        // Return a function to unsubscribe
        return () => {
            ipcRenderer.removeListener(channel, subscription);
        };
    },

    // Invoke function (Mainly for Renderer -> Main)
    invoke: (channel, ...args) => {
        // Removed 'auth:get-fresh-token' as it's handled differently now.
        // Renderer will invoke dynamic channels created by main.
        // Add 'ai:get-suggestions', 'request-vagueness-check', and 'request-update-check' to the list of valid channels
        const validInvokeChannels = [
            'db:store-match', 'db:get-match', 'db:get-match-by-source', 'db:get-status',
            'ai:format-input', 'ai:get-suggestions', 'request-vagueness-check',
            'request-update-check' // Added updater channel
        ];
        // Allow dynamically generated channels for token response (e.g., 'get-token-response-...')
        const isTokenResponseChannel = /^get-token-response-/.test(channel);

        if (validInvokeChannels.includes(channel) || isTokenResponseChannel) {
            return ipcRenderer.invoke(channel, ...args);
        }
        console.error(`Invalid invoke channel requested from renderer: ${channel}`);
        return Promise.reject(new Error(`Invalid invoke channel: ${channel}`));
    }
    // Removed ipcHandle and ipcRemoveHandler as they caused errors
});
