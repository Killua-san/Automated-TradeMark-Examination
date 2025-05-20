import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar, // Keep if needed for potential future header items
  Typography,
  IconButton,
  TextField,
  Button,
  Divider,
  LinearProgress,
  Stack,
  Tabs,
  Tab,
  useTheme,
  alpha,
  Grid,
  Alert, // Import Alert for better status messages
  AlertTitle,
} from '@mui/material';
import SearchResultsPanel from './SearchResultsPanel'; // Updated path if needed
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import SearchIcon from '@mui/icons-material/Search';
import CancelIcon from '@mui/icons-material/Cancel';
// Custom Hooks
import { useSearchContext } from '../hooks/useSearchContext'; // Import the new hook
import { useSearchWorkflow } from '../hooks/useSearchWorkflow';
import { useSearchResults } from '../hooks/useSearchResults';
// Import category icons
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
// Import the new UI components
import SearchInputPanel from './SearchInputPanel';
import ResultsDisplayArea from './ResultsDisplayArea';

import {
    storeFullMatch,
    getStoredMatch,
    initializePromise,
    validateConnection, // Keep if used elsewhere, else remove
    clearResultCache
} from '../services/dynamodbService'; // Updated path if needed

const drawerWidth = 340; // Adjusted width slightly

/**
 * @typedef {object} DbStatusState
 * @property {boolean} connected - Whether the database is currently connected.
 * @property {string} message - A message describing the database connection status.
 */

/**
 * The main content area of the application after authentication.
 * Orchestrates the search input, results display, and the overall search workflow
 * by coordinating the `useSearchContext`, `useSearchWorkflow`, and `useSearchResults` hooks.
 * Manages UI state like tab selection and database connection status display.
 */
function MainContent() {
  const theme = useTheme();

  // --- Local State ---
  /** @type {[number, React.Dispatch<React.SetStateAction<number>>]} Current selected tab index for results display. */
  const [selectedTab, setSelectedTab] = useState(0);
  /** @type {[DbStatusState, React.Dispatch<React.SetStateAction<DbStatusState>>]} Database connection status. */
  const [dbStatus, setDbStatus] = useState({ connected: false, message: 'Connecting to database...' });

  // --- Use Custom Hooks ---
  /** @type {import('../hooks/useSearchContext').SearchContextValue} Search context hook values. */
  const context = useSearchContext(); // Hook for search input, preparation, context
  /** @type {import('../hooks/useSearchWorkflow').SearchWorkflowValue} Search workflow hook values. */
  const workflow = useSearchWorkflow(); // Hook for workflow execution (USPTO/MGS)
  /** @type {import('../hooks/useSearchResults').SearchResultsValue} Search results hook values. */
  const results = useSearchResults(context.currentSearchTermsSet); // Hook for results, pass the set from context

  // Destructure values from hooks for easier use
  // Context Hook
  const {
    /** @type {string} The raw search terms string from the input. */
    rawSearchTerms,
    /** @type {boolean} True if search preparation (DB checks, local checks) is in progress. */
    isPreparing,
    /** @type {import('../hooks/useSearchContext').PreparationStatus} Status of the search preparation process. */
    preparationStatus,
    /** @type {object} Initial results from database/local cache. */
    initialDbResults,
    /** @type {string[]} List of terms to search on USPTO. */
    usptoTermsList,
    /** @type {Array<object>} List of tasks for MGS search. */
    mgsTasks,
    /** @type {(event: React.ChangeEvent<HTMLInputElement>) => void} Handler for search terms input change. */
    handleSearchTermsChange: contextHandleSearchTermsChange, // Rename to avoid conflict
    /** @type {() => Promise<void>} Function to start the search preparation process. */
    prepareSearch,
  } = context;

  // Workflow Hook
  const {
    /** @type {import('../hooks/useSearchWorkflow').SearchStatus} Overall status of the search workflow. Renamed from hook to avoid conflict. */
    searchStatus: workflowStatus, // Rename to avoid conflict
    /** @type {boolean} True if either USPTO or MGS search is actively running. Renamed from hook. */
    isSearching: isWorkflowSearching, // Rename to avoid conflict
    /** @type {number} Progress percentage of the current search. */
    searchProgress,
    /** @type {string} Time taken for the current search. */
    searchTime,
    /** @type {string} Identifier for the current search type ('uspto' or 'mgs'). */
    currentSearch, // Needed for display logic
    /** @type {(usptoTerms: string[], mgsTasksArr: object[]) => void} Function to start the search workflow. */
    startWorkflow,
    /** @type {() => void} Function to cancel the ongoing search workflow. */
    cancelWorkflow,
    // setLoadingStatus, // This might not be needed directly anymore
  } = workflow;

  // Results Hook
  const {
    /** @type {import('../hooks/useSearchResults').CategorizedResults} Search results categorized for display. */
    resultsByCategory, // Use the categorized results directly
    /** @type {(initialData: object) => void} Function to set initial results in the results hook. */
    setInitialResults,
    /** @type {() => void} Function to clear all current search results. */
    clearResults,
    /** @type {import('../hooks/useSearchResults').AllSuggestionsState} State object holding AI suggestions for terms. */
    allSuggestions,
    /** @type {(term: string, reason: string, example: string) => Promise<void>} Function to trigger fetching AI suggestions. */
    fetchSuggestionsForTerm,
  } = results;


  // --- Effects ---

  /**
   * Callback function to check the database connection status via an IPC call.
   * Updates the `dbStatus` state with the connection status.
   */
  const checkDbStatus = useCallback(() => {
      console.log("MainContent: Requesting DB status via IPC...");
      setDbStatus(prev => ({ ...prev, message: 'Checking database connection...' })); // Indicate checking
      window.electronAPI.invoke('db:get-status')
        .then(status => {
          console.log("MainContent: Received DB status:", status);
          setDbStatus(status); // Expecting { connected: boolean, message: string }
        })
        .catch(error => {
          console.error("MainContent: Error getting DB status via IPC:", error);
          setDbStatus({ connected: false, message: `Error checking DB status: ${error.message || 'Unknown error'}` });
        });
  }, []); // No dependencies needed for useCallback here

  // Effect for initial DB status check and network status listeners
  useEffect(() => {
    // Initial check on mount
    checkDbStatus();

    const handleOnline = () => {
      console.log("MainContent: Network status changed to ONLINE. Re-checking DB status...");
      checkDbStatus(); // Re-check DB when network comes online
    };

    const handleOffline = () => {
      console.log("MainContent: Network status changed to OFFLINE.");
      // Immediately set DB status to disconnected without checking IPC
      setDbStatus({ connected: false, message: 'Network offline. Database unavailable.' });
    };

    // Add listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkDbStatus]); // Dependency on the memoized checkDbStatus function

  // Effect to trigger workflow after preparation is complete
  useEffect(() => {
    // Check if preparation just finished successfully
    if (!isPreparing && preparationStatus.type === 'success') {
      console.log("MainContent: Preparation successful. Setting initial results and starting workflow.");
      // Set initial results in the results hook
      results.setInitialResults(initialDbResults);
      // Start the workflow with the calculated lists
      workflow.startWorkflow(usptoTermsList, mgsTasks);
    } else if (!isPreparing && preparationStatus.type === 'error') {
        console.error("MainContent: Preparation failed:", preparationStatus.message);
        // Optionally update workflow status to reflect the preparation error
        // workflow.setLoadingStatus(`Preparation failed: ${preparationStatus.message}`); // Or add a dedicated error state
    }
    // Intentionally omitting workflow and results from dependencies to only trigger on prep completion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreparing, preparationStatus, initialDbResults, usptoTermsList, mgsTasks]);


  // --- Event Handlers ---

  /**
   * Handles the click event for the search button.
   * Clears previous results and initiates the search preparation process.
   */
  const handleSearchClick = () => {
    console.log("MainContent: Search button clicked. Clearing results and starting preparation...");
    results.clearResults(); // Clear previous results
    context.prepareSearch(); // Start the preparation process (DB check etc.)
  };

  /**
   * Handles the click event for the cancel button.
   * Cancels the ongoing search workflow.
   */
  const handleCancelClick = () => {
    workflow.cancelWorkflow();
  };

  /**
   * Handles the change event for the results display tabs.
   * @param {React.SyntheticEvent} event - The event source of the callback.
   * @param {number} newValue - The index of the newly selected tab.
   */
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  // --- Render Logic ---

  /** @type {boolean} Combined state indicating if any search-related activity (preparation or active searching) is ongoing. */
  const combinedIsSearching = isPreparing || isWorkflowSearching;

  /** @type {import('../hooks/useSearchContext').PreparationStatus | import('../hooks/useSearchWorkflow').SearchStatus} Combined status message for display. Prioritizes preparation status/error. */
  const combinedStatus = isPreparing
    ? preparationStatus
    : (preparationStatus.type === 'error' ? preparationStatus : workflowStatus); // Show prep error even after prep finishes

  // --- Component Return JSX ---
  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <SearchInputPanel
        searchTerms={rawSearchTerms} // Use raw terms from context hook
        dbStatus={dbStatus}
        isSearching={combinedIsSearching} // Use combined searching state
        currentSearch={currentSearch} // From workflow hook
        searchProgress={searchProgress} // From workflow hook
        // Pass combined status - SearchInputPanel might need adjustment to display this correctly
        searchStatus={combinedStatus}
        searchTime={searchTime} // From workflow hook
        // Removed themeMode and changeTheme props
        onSearchTermsChange={contextHandleSearchTermsChange} // Use handler from context hook
        onSearchClick={handleSearchClick} // Use simplified handler
        onCancelClick={handleCancelClick} // Use handler calling workflow hook
      />
      {/* Wrap ResultsDisplayArea in a Box that can grow and manage its own layout */}
      <Box sx={{ flexGrow: 1, width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ResultsDisplayArea
          selectedTab={selectedTab}
          onTabChange={handleTabChange}
          resultsByCategory={resultsByCategory} // From results hook
          // Derive loading states from workflow hook
          isUsptoLoading={isWorkflowSearching && currentSearch === 'uspto'}
          isMgsLoading={isWorkflowSearching && currentSearch === 'mgs'}
          // Pass suggestion-related props
          allSuggestions={allSuggestions}
          fetchSuggestionsForTerm={fetchSuggestionsForTerm}
        />
      </Box>
    </Box>
  );
}

export default MainContent;
