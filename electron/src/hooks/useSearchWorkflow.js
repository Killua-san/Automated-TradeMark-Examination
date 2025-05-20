import { useState, useEffect, useCallback } from 'react';
// Removed 'import type' as this is a JS file. JSDoc @typedef will still work.

/**
 * @typedef {import('./useSearchContext').MgsTask} MgsTask - Import type via JSDoc
 */

/**
 * @typedef {'idle' | 'preparing' | 'searching' | 'error' | 'success' | 'cancelled'} SearchWorkflowStatusType
 */

/**
 * @typedef {object} SearchWorkflowStatus
 * @property {SearchWorkflowStatusType} type - The current status type of the workflow.
 * @property {string} message - A user-friendly message describing the status or error.
 */

/**
 * @typedef {'uspto' | 'mgs' | null} CurrentSearchType
 */

/**
 * @typedef {object} SearchTime
 * @property {string|null} uspto - Duration string for USPTO search, or null if not run/completed.
 * @property {string|null} mgs - Duration string for MGS search, or null if not run/completed.
 */

/**
 * @typedef {object} SearchWorkflowValue
 * @property {SearchWorkflowStatus} searchStatus - The overall status of the search workflow.
 * @property {boolean} isSearching - True if either USPTO or MGS search is actively running.
 * @property {number} searchProgress - The progress percentage (0-100) of the current search type.
 * @property {SearchTime} searchTime - An object containing the completion times for USPTO and MGS searches.
 * @property {CurrentSearchType} currentSearch - Indicates which search type ('uspto', 'mgs') is currently active, or null.
 * @property {string} currentTermMessage - A message indicating the specific term being processed (if available).
 * @property {(usptoTermsList: string[], mgsTasks: MgsTask[]) => void} startWorkflow - Function to initiate the search workflow with calculated USPTO terms and MGS tasks.
 * @property {() => void} cancelWorkflow - Function to signal cancellation of the ongoing search workflow.
 * @property {(message?: string) => void} setLoadingStatus - Function to set a specific loading/preparing message (potentially deprecated if useSearchContext handles prep status).
 */

/**
 * Custom hook to manage the state and execution logic of the live search workflow (USPTO and MGS).
 * It listens to IPC events from the main process to track progress, errors, and completion,
 * and orchestrates the sequence of USPTO then MGS searches.
 *
 * @returns {SearchWorkflowValue} The search workflow state and control functions.
 */
export function useSearchWorkflow() {
  /** @type {[SearchWorkflowStatus, React.Dispatch<React.SetStateAction<SearchWorkflowStatus>>]} */
  const [searchStatus, setSearchStatus] = useState({ type: 'idle', message: 'Enter terms and click Search.' });
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  /** @type {[SearchTime, React.Dispatch<React.SetStateAction<SearchTime>>]} */
  const [searchTime, setSearchTime] = useState({ uspto: null, mgs: null });
  /** @type {[CurrentSearchType, React.Dispatch<React.SetStateAction<CurrentSearchType>>]} */
  const [currentSearch, setCurrentSearch] = useState(null);
  const [currentTermMessage, setCurrentTermMessage] = useState('');
  /** @type {[MgsTask[], React.Dispatch<React.SetStateAction<MgsTask[]>>]} */
  const [pendingMgsTasks, setPendingMgsTasks] = useState([]); // Store MGS tasks for transition

  // --- Internal Workflow Logic ---

  /**
   * Internal function to initiate the MGS search via IPC.
   * Updates the status and progress state.
   * @param {MgsTask[]} mgsTasks - The list of tasks for the MGS search.
   */
  const startMgsSearchInternal = useCallback((mgsTasks) => {
      if (mgsTasks && mgsTasks.length > 0) {
          const numTasks = mgsTasks.length;
          console.log(`useSearchWorkflow: Requesting MGS search for ${numTasks} tasks via IPC...`, mgsTasks);
          // DO NOT set state here. State will be set by handleSearchStarted upon confirmation from main process.
          // Send the structured task data as JSON via the exposed API
          window.electronAPI.startMgsSearch(JSON.stringify(mgsTasks));
      } else {
          console.log("useSearchWorkflow: No MGS searches needed or tasks empty.");
          // If MGS wasn't needed, finalize the workflow state
          setIsSearching(false);
          setCurrentSearch(null);
          setCurrentTermMessage('');
          // Only set success if not already in error/cancelled state
          if (searchStatus.type !== 'error' && searchStatus.type !== 'cancelled') {
              setSearchStatus({ type: 'success', message: 'Search complete.' });
          }
      }
  }, [searchStatus.type]); // Dependency: searchStatus.type to avoid setting success over error/cancel

  /**
   * Handles the completion of a specific search type (USPTO or MGS).
   * Records the duration and initiates the next step (MGS) or finalizes the workflow.
   * @param {'uspto' | 'mgs'} searchTypeCompleted - The type of search that just finished.
   * @param {string} duration - The duration string reported by the search script.
   */
  const handleSearchCompletion = useCallback((searchTypeCompleted, duration) => {
    if (searchTypeCompleted === 'uspto') {
      setSearchTime(prev => ({ ...prev, uspto: duration }));
      console.log(`useSearchWorkflow: USPTO search completed in ${duration}. Waiting for main process signal to start MGS.`);
      // Signal that USPTO part is done, transitioning state. MGS start is now triggered by 'request-mgs-start' IPC.
      setCurrentSearch(null);
      // Removed: startMgsSearchInternal(pendingMgsTasks);
    } else if (searchTypeCompleted === 'mgs') {
      setSearchTime(prev => ({ ...prev, mgs: duration }));
      console.log(`useSearchWorkflow: MGS search completed in ${duration}. All searches finished.`);
      // Finalize the workflow state
      setIsSearching(false);
      setCurrentSearch(null);
      setCurrentTermMessage('');
      setPendingMgsTasks([]); // Clear the stored tasks
      // Set success only if the status wasn't already error/cancelled
      if (searchStatus.type !== 'error' && searchStatus.type !== 'cancelled') {
        setSearchStatus({ type: 'success', message: 'Search complete.' });
      }
    }
  }, [startMgsSearchInternal, pendingMgsTasks, searchStatus.type]); // Dependencies

  // --- Effect for IPC Event Handlers ---
  useEffect(() => {
    /** Handles 'search-started' event from main process */
    const handleSearchStarted = (event, searchType) => {
      console.log(`useSearchWorkflow: IPC Event 'search-started': ${searchType}`);
      // This event confirms the main process has successfully started the search
      setIsSearching(true);
      setCurrentSearch(searchType); // Set the current search type based on the event
      setSearchProgress(0);
      setCurrentTermMessage('');
      setSearchStatus({ type: 'searching', message: `Running ${searchType.toUpperCase()} search...` }); // Update status based on confirmed search type
    };

    /** Handles 'search-progress' event from main process */
    const handleSearchProgress = (event, progressData) => {
        // Expect progressData = { progress: number, searchType: string, currentTerm?: string }
        if (typeof progressData !== 'object' || progressData === null) {
            console.warn("useSearchWorkflow: IPC Event 'search-progress': Received unexpected format:", progressData);
            return;
        }
        const { progress, searchType, currentTerm } = progressData;
        console.log(`useSearchWorkflow: IPC Event 'search-progress': ${searchType} ${progress}% ${currentTerm ? `(${currentTerm})` : ''}`);

        setSearchProgress(progress);
        if (currentTerm) {
            setCurrentTermMessage(`Processing: "${currentTerm}"`);
        }
        // Update status message only if it matches the currently active search
        if (currentSearch === searchType) {
            setSearchStatus(prev => ({ ...prev, type: 'searching', message: `Searching ${searchType.toUpperCase()}... ${progress}%` }));
        }
    };

    /** Handles 'search-error' event from main process */
    const handleSearchError = (event, message, searchType) => {
      // Attempt to parse structured error, fallback to string
      const errorPayload = (typeof message === 'object' && message !== null) ? message : { message: String(message) };
      const errorText = errorPayload.message || 'Unknown error';
      const errorTerm = errorPayload.term; // Optional term associated with the error

      // Ignore potential debug messages proxied from stderr
      if (typeof errorText === 'string' && errorText.toLowerCase().includes('debug:')) {
          console.warn(`useSearchWorkflow: IPC Event 'search-error': Debug message ignored: ${errorText}`);
          return;
      }

      // Construct a user-friendly error message
      let displayMessage = `Error during ${searchType?.toUpperCase() || 'search'}`;
      if (errorTerm) displayMessage += ` for term "${errorTerm}"`;
      displayMessage += `: ${String(errorText)}`; // Ensure error text is a string

      console.error(`useSearchWorkflow: IPC Event 'search-error': (${searchType || 'N/A'})`, message); // Log original error
      setSearchStatus({ type: 'error', message: displayMessage });
      setIsSearching(false);
      setCurrentSearch(null);
      setCurrentTermMessage('');
      setPendingMgsTasks([]); // Clear pending tasks on error
     };

     /** Combined handler for time reports from both search types */
     const handleTimeReport = (event, timeResult) => {
         // Expect timeResult = { type: 'search_time', source: 'uspto'|'mgs', value: string }
         if (timeResult && timeResult.value && timeResult.source) {
             console.log(`useSearchWorkflow: IPC Event 'search-time'/'mgs-search-time': Source=${timeResult.source}, Duration=${timeResult.value}`);
             handleSearchCompletion(timeResult.source, timeResult.value);
         } else {
             console.warn("useSearchWorkflow: IPC Event 'search-time'/'mgs-search-time': Received unexpected format:", timeResult);
         }
     };

     // Note: Assumes main process forwards both 'search-time' and 'mgs-search-time' events
     // If consolidated in main.js, only one listener might be needed.
     const handleSearchTime = (event, timeResult) => handleTimeReport(event, timeResult);
     const handleMgsSearchTime = (event, timeResult) => handleTimeReport(event, timeResult);

    /** Handles 'search-finished' event (process exit/cancel signal) from main process */
    const handleSearchFinished = (event, { searchType, code }) => { // Expect { searchType, code }
      console.log(`useSearchWorkflow: IPC Event 'search-finished': Process for ${searchType} exited/cancelled with code ${code}.`);
      // Check if the active search process finished unexpectedly (non-zero exit code)
      // and wasn't already handled by completion, error, or cancellation flows.
      if (isSearching && currentSearch === searchType && !['success', 'error', 'cancelled'].includes(searchStatus.type)) {
        if (code !== 0) { // Process exited with an error code
          console.warn(`useSearchWorkflow: ${searchType.toUpperCase()} process finished unexpectedly (code ${code}) while state was ${searchStatus.type}.`);
          if (searchType === 'uspto') {
            // If USPTO died unexpectedly, still try to run MGS if needed
            console.log("useSearchWorkflow: USPTO exited unexpectedly, attempting to start MGS...");
            startMgsSearchInternal(pendingMgsTasks);
          } else {
            // If MGS died unexpectedly, report error and stop
            console.error(`useSearchWorkflow: MGS process exited unexpectedly (code ${code}).`);
            setIsSearching(false);
            setPendingMgsTasks([]);
            setCurrentSearch(null);
            setCurrentTermMessage('');
            setSearchStatus({ type: 'error', message: `${searchType.toUpperCase()} search finished unexpectedly (code ${code}).` });
          }
        } else {
          // Process exited normally (code 0), but completion wasn't handled by 'search-time'/'mgs-search-time'
          // This *shouldn't* typically happen if the time report always comes before close, but handle defensively.
          console.warn(`useSearchWorkflow: ${searchType.toUpperCase()} process finished normally (code 0) but completion state wasn't set. Finalizing.`);
          setIsSearching(false);
          setPendingMgsTasks([]);
          setCurrentSearch(null);
          setCurrentTermMessage('');
          // If USPTO finished normally here, MGS should have been triggered by handleSearchCompletion.
          // If MGS finished normally here, the workflow is done.
          // Set success only if not already error/cancelled.
          if (searchStatus.type !== 'error' && searchStatus.type !== 'cancelled') {
             setSearchStatus({ type: 'success', message: 'Search complete (finalized by exit).' });
          }
        }
      } else if (searchStatus.type === 'cancelled') {
          console.log(`useSearchWorkflow: Search process for ${searchType} finished after cancellation signal.`);
          // State already set by cancelWorkflow, do nothing extra.
      } else {
          console.log(`useSearchWorkflow: Search process for ${searchType} finished normally or state already handled (status: ${searchStatus.type}).`);
          // Normal completion/error handled by handleSearchCompletion/handleSearchError.
      }
    };

    // Register IPC listeners using the exposed Electron API
    const unsubStarted = window.electronAPI.onSearchStarted(handleSearchStarted);
    const unsubProgress = window.electronAPI.onSearchProgress(handleSearchProgress);
    const unsubError = window.electronAPI.onSearchError(handleSearchError);
    const unsubTime = window.electronAPI.onSearchTime(handleSearchTime);
     const unsubMgsTime = window.electronAPI.onMgsSearchTime(handleMgsSearchTime);
    const unsubFinished = window.electronAPI.onSearchFinished(handleSearchFinished);

    /** Handles 'request-mgs-start' event from main process after USPTO finishes */
    const handleRequestMgsStart = (event) => {
        console.log("useSearchWorkflow: IPC Event 'request-mgs-start': Received signal from main process.");
        startMgsSearchInternal(pendingMgsTasks);
    };
    const unsubRequestMgsStart = window.electronAPI.onRequestMgsStart(handleRequestMgsStart);


    // Cleanup function to remove listeners on unmount
    return () => {
      console.log("Cleaning up useSearchWorkflow listeners...");
      if (typeof unsubStarted === 'function') unsubStarted();
      if (typeof unsubProgress === 'function') unsubProgress();
      if (typeof unsubError === 'function') unsubError();
      if (typeof unsubTime === 'function') unsubTime();
      if (typeof unsubMgsTime === 'function') unsubMgsTime();
      if (typeof unsubFinished === 'function') unsubFinished();
      if (typeof unsubRequestMgsStart === 'function') unsubRequestMgsStart(); // Cleanup new listener
      // Fallback for older potential API structure
      window.electronAPI.removeAllListeners?.('search-started');
      window.electronAPI.removeAllListeners?.('search-progress');
      window.electronAPI.removeAllListeners?.('search-error');
      window.electronAPI.removeAllListeners?.('search-time');
      window.electronAPI.removeAllListeners?.('mgs-search-time');
      window.electronAPI.removeAllListeners?.('search-finished');
      window.electronAPI.removeAllListeners?.('request-mgs-start'); // Cleanup new listener fallback
    };
  }, [currentSearch, handleSearchCompletion, startMgsSearchInternal, pendingMgsTasks, isSearching, searchStatus.type]); // Dependencies updated

  // --- Control Functions Exposed by Hook ---

  /**
   * Starts the search workflow. Determines whether to start with USPTO or MGS search
   * based on the provided lists, or sets success state if no live searches are needed.
   * @param {string[]} usptoTermsList - List of terms requiring USPTO search.
   * @param {MgsTask[]} mgsTasks - List of tasks for MGS search.
   */
  const startWorkflow = useCallback((usptoTermsList, mgsTasks) => {
      // Reset state for a new workflow run
      setSearchTime({ uspto: null, mgs: null });
      setSearchProgress(0);
      setIsSearching(false); // Will be set true by 'search-started' event if needed
      setCurrentSearch(null);
      setCurrentTermMessage('');
      setPendingMgsTasks(mgsTasks || []); // Store MGS tasks for potential transition

      // Determine the starting point of the workflow
      if (usptoTermsList && usptoTermsList.length > 0) {
          const numTerms = usptoTermsList.length;
          console.log(`useSearchWorkflow: Starting workflow with USPTO search for ${numTerms} terms...`, usptoTermsList);
          setSearchStatus({ type: 'searching', message: `Starting USPTO search (${numTerms} term${numTerms > 1 ? 's' : ''})...` });
          setCurrentSearch('uspto');
          // Initiate USPTO search via IPC
          window.electronAPI.startSearch(usptoTermsList.join('\n'));
      } else if (mgsTasks && mgsTasks.length > 0) {
          console.log("useSearchWorkflow: Starting workflow directly with MGS search.");
          // If no USPTO terms, start MGS directly
          setIsSearching(true); // Set searching true here as no 'search-started' will fire for USPTO
          startMgsSearchInternal(mgsTasks);
      } else {
          console.log("useSearchWorkflow: No live searches needed (results from local/cache only).");
          setSearchStatus({ type: 'success', message: 'Results loaded from local data/cache.' });
          setIsSearching(false); // Ensure searching is false
          setCurrentSearch(null);
      }
  }, [startMgsSearchInternal]); // Dependency

  /**
   * Cancels the currently running search workflow.
   * Sends a cancellation signal via IPC and immediately updates the frontend state.
   */
  const cancelWorkflow = useCallback(() => {
    console.log("useSearchWorkflow: Attempting to cancel search workflow...");
    // Signal the main process to cancel ongoing Python scripts
    if (isSearching || searchStatus.type === 'searching' || searchStatus.type === 'preparing') { // Check if likely active
        window.electronAPI.cancelSearch();
    } else {
        console.log("useSearchWorkflow: No active search detected to send cancel signal.");
    }
    // Immediately update frontend state to reflect cancellation
    setIsSearching(false);
    setCurrentSearch(null);
    setCurrentTermMessage('');
    setSearchProgress(0);
    setPendingMgsTasks([]); // Clear pending tasks
    setSearchStatus({ type: 'cancelled', message: 'Search cancelled by user.' });
    // Optional: Reset search times?
    // setSearchTime({ uspto: null, mgs: null });
  }, [isSearching, searchStatus.type]); // Dependencies

  /**
   * Sets a specific loading/preparing status message.
   * Note: This might be less used if `useSearchContext` handles the preparation phase status.
   * @param {string} [message='Preparing search...'] - The message to display.
   */
  const setLoadingStatus = useCallback((message = 'Preparing search...') => {
      setSearchStatus({ type: 'preparing', message });
  }, []);


  // Return the public API of the hook
  return {
    searchStatus,
    isSearching,
    searchProgress,
    searchTime,
    currentSearch,
    currentTermMessage,
    startWorkflow,
    cancelWorkflow,
    setLoadingStatus,
  };
}
