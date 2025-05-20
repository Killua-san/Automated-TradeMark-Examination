import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * @typedef {'full' | 'partial' | 'deleted' | 'none' | 'local' | 'local-partial' | 'local-template'} MatchType
 */

/**
 * @typedef {'USPTO' | 'MGS (NICE On)' | 'MGS (NICE Off)' | 'local' | 'local-partial' | 'local-template'} ResultSource
 */

/**
 * Represents a normalized search result item, standardized for display and categorization.
 * @typedef {object} NormalizedResultItem
 * @property {string} term - The original search term.
 * @property {ResultSource} source - The normalized source of the result.
 * @property {string} status - The descriptive status text of the result.
 * @property {string|null} description - The exact description (primarily for 'local' source).
 * @property {string|null} descriptionExample - An example description (for 'local-partial', 'local-template').
 * @property {string|null} vaguenessReasoning - Explanation if the term was deemed vague by AI.
 * @property {string|null} termId - The Term ID if available (e.g., from USPTO/MGS full match).
 * @property {string|null} classNumber - The NICE class number if available.
 * @property {MatchType} matchType - The type of match found.
 * @property {boolean|null} isVague - Whether the term was deemed vague (true/false) or not checked (null).
 * @property {string|null} searchDate - ISO string representation of when the result was obtained/cached.
 * @property {string} originalSource - The original source string before normalization (e.g., 'uspto', 'mgs-nice-on').
 * @property {string|null} originalStatus - The original status code ('D'/'A') for local items.
 * @property {boolean|null} isDeleted - Flag indicating if the item was marked deleted in local data.
 */

/**
 * @typedef {object} SuggestionState
 * @property {string[]} suggestions - Array of AI-generated suggestions.
 * @property {boolean} isLoading - True if suggestions are currently being fetched.
 * @property {string|null} error - Error message if fetching suggestions failed.
 */

/**
 * @typedef {object<string, SuggestionState>} AllSuggestionsState - Map from lowercase term to its suggestion state.
 */

/**
 * @typedef {object} CategorizedResults
 * @property {NormalizedResultItem[]} fullMatches - Results considered exact/full matches.
 * @property {NormalizedResultItem[]} vagueUSPTO - USPTO/Local results deemed vague or potentially problematic.
 * @property {NormalizedResultItem[]} acceptableUSPTO - USPTO/Local results deemed acceptable alternatives (not full matches, not vague).
 * @property {NormalizedResultItem[]} otherResults - Other results (e.g., MGS non-full, deleted items, errors).
 */

/**
 * @typedef {object} SearchResultsValue
 * @property {object} searchResults - Raw results state keyed by term-source (e.g., 'term-uspto').
 * @property {CategorizedResults} resultsByCategory - Results processed, normalized, and categorized for display.
 * @property {(initialData: object) => void} setInitialResults - Function to populate results from initial DB/local checks.
 * @property {() => void} clearResults - Function to clear all current results and suggestions.
 * @property {AllSuggestionsState} allSuggestions - State object holding AI suggestions for terms.
 * @property {(term: string, reason: string, example: string) => Promise<void>} fetchSuggestionsForTerm - Function to trigger fetching AI suggestions for a specific vague term.
 */


// --- Helper Function: Normalize Result Item ---
/**
 * Normalizes a raw search result item from various sources (IPC, DB cache, local)
 * into a consistent structure (`NormalizedResultItem`).
 * Handles potential inconsistencies in field names (term/searchterm, status/statusText)
 * and infers missing fields like `matchType`, `termId`, `classNumber` for older data formats.
 *
 * @param {object} item - The raw result item.
 * @returns {NormalizedResultItem|null} The normalized item, or null if essential fields are missing.
 */
const normalizeResultItem = (item) => {
    if (!item) return null;

    // --- Field Destructuring & Handling Alternatives ---
    // Use 'term' if present, fallback to 'searchterm' (older format)
    const term = item.term || item.searchterm;
    const {
        source, // e.g., 'uspto', 'mgs-nice-on'
        matchType, // e.g., 'full', 'partial', 'deleted', 'none'
        statusText, // Preferred descriptive status text field
        status, // Fallback status text field OR 'D'/'A' status for local source
        isVague, // boolean or null from AI check
        description, // Exact description (primarily for 'local' source)
        descriptionExample, // Example description (for 'local-partial', 'local-template')
        vaguenessReasoning, // AI reasoning for vagueness
        termId, // USPTO/MGS Term ID
        classNumber, // NICE class number
        searchDate, // ISO Date string of the search/cache entry
        isDeleted, // boolean flag from local data check if applicable
        // Add other potential fields if needed
    } = item;

    // --- Status Text Handling ---
    // Use 'statusText' if available, otherwise fallback to the older 'status' field for descriptive text.
    // Note: For local source items, item.status might be 'D' or 'A', handle this later in categorization.
    const currentStatusText = statusText || (item.source !== 'local' ? status : null) || 'Status unavailable'; // Provide default

    // --- Match Type Inference (for older data) ---
    let currentMatchType = matchType;
    if (currentMatchType === undefined && currentStatusText && item.source !== 'local') {
        // Only infer if matchType is missing and we have status text (and not a local item where status means D/A)
        console.log(`normalizeResultItem: Inferring matchType for older item (term: ${term}, source: ${source})`);
        if (currentStatusText.startsWith("Full match found")) {
            currentMatchType = "full";
        } else if (currentStatusText.startsWith("Deleted description found")) {
            currentMatchType = "deleted";
        } else if (currentStatusText === "No match found" || currentStatusText.startsWith("MGS No Match")) {
            currentMatchType = "none";
        } else { // Assume partial otherwise (includes "Apart of", "Partial match", "General description")
            currentMatchType = "partial";
        }
        console.log(`normalizeResultItem: Inferred matchType: ${currentMatchType}`);
    } else if (item.source === 'local') {
        // For local items, determine matchType based on originalStatus ('D'/'A') later in categorization
        currentMatchType = 'local'; // Use a placeholder or determine later
    } else if (currentMatchType === undefined) {
        console.warn(`normalizeResultItem: Could not infer matchType for item (term: ${term}, source: ${source})`, item);
        currentMatchType = 'none'; // Default if inference fails
    }

    // --- Term ID / Class Number Extraction (for older data) ---
    // Attempt extraction only if it's likely a full match and fields are missing
    let currentTermId = termId;
    let currentClassNumber = classNumber;
    if (currentMatchType === 'full' && currentStatusText) {
        if (currentTermId === undefined) {
             const termIdMatch = currentStatusText.match(/Term ID: ([\w-]+)/);
             currentTermId = termIdMatch ? termIdMatch[1] : null;
             if(currentTermId) console.log(`normalizeResultItem: Extracted termId for older item: ${currentTermId}`);
        }
        if (currentClassNumber === undefined) {
             const classMatch = currentStatusText.match(/Class (\d+)/);
             currentClassNumber = classMatch ? classMatch[1] : null;
             if(currentClassNumber) console.log(`normalizeResultItem: Extracted classNumber for older item: ${currentClassNumber}`);
        }
    }

    // --- Basic Validation ---
    // Ensure essential fields are present after potential inference/extraction
    if (!term || !source || !currentMatchType) {
         console.warn("normalizeResultItem: Skipping item with missing essential fields (term, source, matchType) after potential inference:", item);
         return null; // Skip this item if core info is missing
    }

    // --- Source Normalization ---
    let normalizedSource;
    switch(source) {
        case 'uspto': normalizedSource = 'USPTO'; break;
        case 'mgs-nice-on': normalizedSource = 'MGS (NICE On)'; break;
        case 'mgs-nice-off': normalizedSource = 'MGS (NICE Off)'; break;
        case 'local':
        case 'local-exact': // Treat exact local as just 'local'
            normalizedSource = 'local'; break;
        case 'local-partial': normalizedSource = 'local-partial'; break;
        case 'local-template': normalizedSource = 'local-template'; break;
        default: normalizedSource = source; // Keep unknown sources as-is
    }

    // --- Final Object Construction ---
    return {
        term,
        source: normalizedSource,
        status: currentStatusText, // Use the resolved/defaulted status text
        description, // Exact description for 'local' source
        descriptionExample, // Example for partial/template local
        vaguenessReasoning,
        termId: currentTermId,
        classNumber: currentClassNumber,
        matchType: currentMatchType, // Use resolved/inferred match type
        isVague: typeof isVague === 'boolean' ? isVague : null, // Ensure boolean or null
        searchDate,
        // Keep original source and status ('D'/'A') for local items for categorization logic
        originalSource: item.source,
        originalStatus: item.status, // This is the 'D'/'A' status for local items
        isDeleted: typeof isDeleted === 'boolean' ? isDeleted : null, // Ensure boolean or null
    };
};

/**
 * Categorizes a *normalized* search result item into predefined display categories.
 * Modifies the item's status/matchType for clarity based on category (e.g., for local items).
 *
 * @param {NormalizedResultItem | null} item - The normalized item to categorize.
 * @param {CategorizedResults} categorized - The object holding categorized arrays (will be mutated).
 */
const categorizeNormalizedItem = (item, categorized) => {
    if (!item) return; // Skip if normalization failed

    let categoryAssigned = 'otherResults'; // Default category

    // --- Categorization Logic ---

    // 1. Handle Local Source Items (Exact Matches from localIdManualData.json)
    if (item.originalSource === 'local' || item.originalSource === 'local-exact') {
        if (item.isDeleted || item.originalStatus === 'D') {
            // If marked deleted in local data or has 'D' status
            item.status = `Deleted (Local List - Status: ${item.originalStatus || 'D'})`; // Add context to status
            item.matchType = 'deleted'; // Set matchType explicitly
            categorized.otherResults.push(item);
            categoryAssigned = 'otherResults (Local Deleted)';
        } else {
            // Assume non-deleted local entries are full matches
            item.matchType = 'full'; // Ensure matchType is set
            item.status = `Full Match (Local List - Status: ${item.originalStatus || 'A'})`; // Add context
            categorized.fullMatches.push(item);
            categoryAssigned = 'fullMatches (Local)';
        }
    // 2. Handle Local Partial/Template Matches (from localIdManualData.json)
    } else if (item.originalSource === 'local-partial' || item.originalSource === 'local-template') {
         const checkVague = item.isVague; // isVague check was performed during context preparation
         if (checkVague === true) {
             // If AI deemed the *original term* vague
             categorized.vagueUSPTO.push(item);
             categoryAssigned = `vagueUSPTO (from ${item.originalSource})`;
         } else {
             // If AI deemed term acceptable or check failed (checkVague is false or null)
             // Treat these as potentially acceptable alternatives
             categorized.acceptableUSPTO.push(item);
             categoryAssigned = `acceptableUSPTO (from ${item.originalSource})`;
         }
     // 3. Handle Live USPTO Results
     } else if (item.source === 'USPTO') {
         if (item.matchType === 'full') {
            categorized.fullMatches.push(item);
            categoryAssigned = 'fullMatches (USPTO)';
        } else if (item.matchType === 'deleted') {
            categorized.otherResults.push(item);
            categoryAssigned = 'otherResults (USPTO deleted)';
        } else { // Handle other USPTO results (partial, none, etc.) based on vagueness check
            const checkVague = item.isVague; // isVague from live search result
            if (checkVague === true) {
              categorized.vagueUSPTO.push(item);
              categoryAssigned = 'vagueUSPTO (USPTO)';
            } else { // Includes checkVague === false and checkVague === null
              categorized.acceptableUSPTO.push(item);
              categoryAssigned = `acceptableUSPTO (USPTO - matchType: ${item.matchType}, isVague: ${checkVague})`;
            }
        }
    // 4. Handle Live MGS Results
    } else if (item.source?.startsWith('MGS')) {
        if (item.matchType === 'full') {
            categorized.fullMatches.push(item);
            categoryAssigned = 'fullMatches (MGS)';
        } else {
            // All non-full MGS results go to 'otherResults'
            categorized.otherResults.push(item);
            categoryAssigned = `otherResults (MGS ${item.matchType})`;
        }
    // 5. Handle Unknown/Other Sources
    } else {
        console.warn("Categorizing item with unknown source into otherResults:", item);
        categorized.otherResults.push(item);
        categoryAssigned = `otherResults (Unknown Source: ${item.source})`;
    }

    // --- DEBUG LOGGING ---
    console.log(`[DEBUG] Assigned term "${item.term}" (Source: ${item.originalSource || item.source}, MatchType: ${item.matchType}) to category: ${categoryAssigned}`);
};


/**
 * Custom hook to manage the state and logic related to processing, storing,
 * and categorizing search results from various sources (initial checks, live searches).
 * Also handles fetching and storing AI suggestions for vague terms.
 *
 * @param {Set<string>} currentSearchTermsSet - A Set containing the lowercase terms of the current search, used for filtering results.
 * @returns {SearchResultsValue} The search results state and associated functions.
 */
export function useSearchResults(currentSearchTermsSet) {
  /** @type {[object, React.Dispatch<React.SetStateAction<object>>]} */
  const [searchResults, setSearchResults] = useState({}); // Raw results keyed by term-source
  /** @type {[AllSuggestionsState, React.Dispatch<React.SetStateAction<AllSuggestionsState>>]} */
  const [allSuggestions, setAllSuggestions] = useState({}); // AI suggestions keyed by lowercase term
  const { getToken } = useAuth();

  /**
   * Fetches AI suggestions for a given term, reason, and example via IPC.
   * Updates the `allSuggestions` state with loading, result, or error information.
   * @param {string} term - The term to get suggestions for.
   * @param {string} reason - The reason the term is considered vague.
   * @param {string} example - An example description containing the term.
   */
  const fetchSuggestionsForTerm = useCallback(async (term, reason, example) => {
    if (!term || !reason) {
        console.warn("fetchSuggestionsForTerm: Missing term or reason.");
        return;
    }

    const termLower = term.toLowerCase();
    // Set loading state for this specific term
    setAllSuggestions(prev => ({
      ...prev,
      [termLower]: { suggestions: [], isLoading: true, error: null }
    }));

    try {
      console.log(`useSearchResults: Requesting suggestions via IPC for term: "${term}"`);
      // Call the exposed Electron API function
      const result = await window.electronAPI.getAiSuggestions(term, reason, example);

      // Process the result from IPC
      if (Array.isArray(result)) {
        console.log(`useSearchResults: Received suggestions for "${term}":`, result);
        setAllSuggestions(prev => ({
          ...prev,
          [termLower]: { suggestions: result, isLoading: false, error: null }
        }));
      } else if (result && result.error) {
        // Handle errors reported by the AI script itself
        console.error(`useSearchResults: Error from suggestion script for "${term}":`, result.error);
        setAllSuggestions(prev => ({
          ...prev,
          [termLower]: { suggestions: [], isLoading: false, error: result.error }
        }));
      } else {
        // Handle unexpected format from IPC
        console.warn(`useSearchResults: Received unexpected suggestion format for "${term}":`, result);
        setAllSuggestions(prev => ({
          ...prev,
          [termLower]: { suggestions: [], isLoading: false, error: "Received unexpected format." }
        }));
      }
    } catch (error) {
      // Handle errors during the IPC call itself
      console.error(`useSearchResults: IPC Error fetching AI suggestions for "${term}":`, error);
      setAllSuggestions(prev => ({
        ...prev,
        [termLower]: { suggestions: [], isLoading: false, error: error.message || 'Failed to fetch suggestions.' }
      }));
    }
  }, []); // No dependencies needed as it uses args directly

  // --- Effect for IPC Handlers for Live Search Results ---
  useEffect(() => {
    /**
     * Handles incoming live USPTO search results via IPC.
     * Updates the raw searchResults state and triggers background storage for full matches.
     */
    const handleSearchResult = async (event, result) => { // Made async for getToken/invoke
      // Validate incoming data structure
      if (result && result.type === 'result' && result.source === 'uspto' && result.term) {
        const termLower = result.term.toLowerCase();
        const resultKey = `${termLower}-uspto`;
        console.log(`useSearchResults: Received LIVE USPTO result for ${resultKey}`, result);
        // --- DEBUG LOGGING START ---
        console.log(`[DEBUG] Received USPTO IPC Result: term=${result.term}, matchType=${result.matchType}, isVague=${result.isVague}`, result);
        // --- DEBUG LOGGING END ---

        // Update state, potentially overwriting previous non-full matches for the same term/source
        setSearchResults(prev => {
          // Prevent overwriting an existing full match with a less specific live result
          if (prev[resultKey]?.matchType === 'full' && result.matchType !== 'full') {
            console.log(`useSearchResults: Skipping update for ${resultKey}, existing full match found.`);
            return prev;
          }
          // Store the new structured result from IPC
          const newState = { ...prev, [resultKey]: result };
          console.log(`useSearchResults: Updating state for ${termLower}-uspto. New state keys:`, Object.keys(newState));
          return newState;
        });

        // Store full matches in the database via IPC in the background
        if (result.matchType === 'full') {
          try {
            const idToken = await getToken(); // Get token before invoking IPC
            if (!idToken) {
              console.error('useSearchResults: Cannot store USPTO match, user not authenticated.');
              return;
            }
            // Pass the entire result object and the token to the main process
            const storedItem = await window.electronAPI.invoke('db:store-match', { ...result, idToken });
            if (storedItem) {
              console.log('useSearchResults: Successfully stored USPTO full match via IPC:', { term: result.term, source: result.source });
            } else {
              console.error('useSearchResults: Failed to store USPTO full match via IPC (returned null/undefined).');
            }
          } catch (err) {
            console.error(`useSearchResults: Error invoking db:store-match for USPTO term "${result.term}":`, err.message || err);
          }
        }
      } else if (result && result.type === 'error') {
         // Log errors reported by the USPTO search script
         console.error(`useSearchResults: Received USPTO Search Error via IPC for term "${result.term}":`, result);
      } else {
         // Log unexpected data format
         console.warn("useSearchResults: Received unexpected data format on 'search-result' channel:", result);
      }
    };

    /**
     * Handles incoming live MGS search results via IPC.
     * Updates the raw searchResults state and triggers background storage for full matches.
     */
    const handleMgsSearchResult = async (event, result) => { // Made async for getToken/invoke
      // Validate incoming data structure
      if (result && result.type === 'result' && result.source?.startsWith('mgs-') && result.term) {
        const termLower = result.term.toLowerCase();
        const resultKey = `${termLower}-${result.source}`; // e.g., 'term-mgs-nice-on'
        console.log(`useSearchResults: Received LIVE MGS result for ${resultKey}`, result);

        // Update state, potentially overwriting previous non-full matches
        setSearchResults(prev => {
           // Prevent overwriting an existing full match
           if (prev[resultKey]?.matchType === 'full' && result.matchType !== 'full') {
            console.log(`useSearchResults: Skipping update for ${resultKey}, existing full match found.`);
            return prev;
          }
          // Store the new structured result from IPC
          const newState = { ...prev, [resultKey]: result };
          console.log(`useSearchResults: Updating state for ${resultKey}. New state keys:`, Object.keys(newState));
          return newState;
        });

        // Store full matches in the database via IPC in the background
        if (result.matchType === 'full') {
           try {
             const idToken = await getToken(); // Get token before invoking IPC
             if (!idToken) {
               console.error(`useSearchResults: Cannot store MGS match for source ${result.source}, user not authenticated.`);
               return;
             }
             // Pass the entire result object and the token to the main process
             const storedItem = await window.electronAPI.invoke('db:store-match', { ...result, idToken });
             if (storedItem) {
               console.log('useSearchResults: Successfully stored MGS full match via IPC:', { term: result.term, source: result.source });
             } else {
               console.error(`useSearchResults: Failed to store MGS full match via IPC for source ${result.source} (returned null/undefined).`);
             }
           } catch (err) {
             console.error(`useSearchResults: Error invoking db:store-match for MGS term "${result.term}" (source: ${result.source}):`, err.message || err);
           }
        }
      } else if (result && result.type === 'error') {
         // Log errors reported by the MGS search script
         console.error(`useSearchResults: Received MGS Search Error via IPC for term "${result.term}" (source: ${result.source || 'mgs'}):`, result);
      } else {
         // Log unexpected data format
         console.warn("useSearchResults: Received unexpected data format on 'mgs-search-result' channel:", result);
      }
    };

    // Register IPC listeners using the exposed Electron API
    const unsubscribeUspto = window.electronAPI.onSearchResult(handleSearchResult);
    const unsubscribeMgs = window.electronAPI.onMgsSearchResult(handleMgsSearchResult);

    // Cleanup function to remove listeners on unmount
    return () => {
      console.log("Cleaning up useSearchResults listeners...");
      if (typeof unsubscribeUspto === 'function') unsubscribeUspto();
      if (typeof unsubscribeMgs === 'function') unsubscribeMgs();
      // Fallback for older potential API structure
      window.electronAPI.removeAllListeners?.('search-result');
      window.electronAPI.removeAllListeners?.('mgs-search-result');
    };
  }, [getToken]); // Dependency on getToken to ensure the latest function is used

  /**
   * Memoized calculation to normalize and categorize all current search results.
   * This runs whenever the raw `searchResults` state or the `currentSearchTermsSet` changes.
   * @returns {CategorizedResults} The categorized results object.
   */
  const resultsByCategory = useMemo(() => {
    console.log("useSearchResults: Recalculating resultsByCategory with state keys:", Object.keys(searchResults));
    // Initialize categories
    const categorized = {
      fullMatches: [],
      vagueUSPTO: [],
      acceptableUSPTO: [],
      otherResults: [],
    };
    const currentTerms = currentSearchTermsSet; // Use the set passed as prop for filtering

    // Iterate over the raw result *objects* in the state
    Object.values(searchResults)
      // Filter out null/undefined items and items not part of the current search
      .filter(item => {
          const term = item?.term || item?.searchterm;
          return term && currentTerms.has(term.toLowerCase());
      })
      .forEach(rawItem => {
          const normalizedItem = normalizeResultItem(rawItem); // Normalize first
          categorizeNormalizedItem(normalizedItem, categorized); // Then categorize
      });

     // Sort results within each category alphabetically by term for consistent display
     Object.keys(categorized).forEach(category => {
        categorized[category].sort((a, b) => a.term.localeCompare(b.term));
      });

     console.log("useSearchResults: Categorization complete.", {
         full: categorized.fullMatches.length,
         vague: categorized.vagueUSPTO.length,
         acceptable: categorized.acceptableUSPTO.length,
         other: categorized.otherResults.length
     });
     return categorized;
   }, [searchResults, currentSearchTermsSet]); // Dependencies

  /**
   * Sets the initial search results state, typically used after the preparation phase
   * (local/DB cache checks) is complete.
   * @param {object} initialData - An object containing initial results, keyed by term-source.
   */
  const setInitialResults = useCallback((initialData) => {
      console.log("useSearchResults: Setting initial results:", Object.keys(initialData));
      // Assuming the structure passed is { key: item }
      setSearchResults(initialData || {}); // Ensure it's an object
  }, []);

  /**
   * Clears all current search results and AI suggestions from the state.
   */
  const clearResults = useCallback(() => {
      console.log("useSearchResults: Clearing results and suggestions.");
      setSearchResults({});
      setAllSuggestions({});
  }, []);


  // Return the state and functions needed by consuming components
  return {
    searchResults, // Raw results state (might be useful for debugging)
    resultsByCategory, // Processed and categorized results for display
    setInitialResults, // Function to load initial data
    clearResults, // Function to reset results
    allSuggestions, // State for AI suggestions
    fetchSuggestionsForTerm, // Function to trigger AI suggestion fetching
  };
}
