import { useState, useCallback, useEffect, useMemo } from 'react';
import { getStoredMatch, clearResultCache } from '../services/dynamodbService';
import { useAuth } from '../context/AuthContext';
import localIdManualData from '../assets/id_manual_data.json';
import { normalizeDescription } from '../utils/stringUtils'; // Import from utils

// Prepare the local data map outside the hook or using useMemo for efficiency
const localDataMap = new Map();
try {
    localIdManualData.forEach(item => {
        const normalizedDesc = normalizeDescription(item.description);
        if (normalizedDesc) { // Only add if description is not empty
            // Store the original item, keyed by normalized description
            localDataMap.set(normalizedDesc, item);
        }
    });
    console.log(`Loaded ${localDataMap.size} entries from local ID manual data.`);
} catch (error) {
    console.error("Error processing local ID manual data:", error);
    // Handle error appropriately, maybe show a warning to the user
}

// --- Helper Functions for prepareSearch ---

// 1. Check Local Data (Exact, Prefix, Partial) & Initiate Vagueness Checks
const _checkLocalData = (parsedTerms) => {
    console.log(`_checkLocalData: Starting local data check for ${parsedTerms.length} terms...`);
    const dbResults = {};
    const termsRequiringDbCheck = [];
    const vaguenessCheckPromises = [];
    const vaguenessCheckMap = new Map(); // Map resultKey to its promise index

    parsedTerms.forEach(term => {
        const normalizedTerm = normalizeDescription(term);
        let foundLocally = false;

        // Check Exact Local Match
        const exactLocalMatch = localDataMap.get(normalizedTerm);
        if (exactLocalMatch) {
            console.log(`_checkLocalData: Found exact local match for "${term}"`);
            foundLocally = true;
            const isDeleted = exactLocalMatch.status === 'D';
            const resultKey = `${normalizedTerm}-local-exact`;
            dbResults[resultKey] = { term, termId: exactLocalMatch.termId, description: exactLocalMatch.description, status: exactLocalMatch.status, searchDate: new Date().toISOString(), source: 'local', isDeleted, isVague: null, vaguenessReasoning: null };
        } else {
            // Check Prefix Local Match (Template)
            let firstPrefixMatch = null;
            if (normalizedTerm) {
                for (const localItem of localDataMap.values()) {
                    const normalizedLocalDesc = normalizeDescription(localItem.description);
                    if (normalizedLocalDesc.startsWith(normalizedTerm)) {
                        firstPrefixMatch = localItem;
                        break;
                    }
                }
            }
            if (firstPrefixMatch) {
                console.log(`_checkLocalData: Found local prefix match (template) for "${term}"`);
                foundLocally = true;
                const isDeleted = firstPrefixMatch.status === 'D';
                const resultKey = `${normalizedTerm}-local-template`;
                dbResults[resultKey] = { term, termId: firstPrefixMatch.termId, descriptionExample: firstPrefixMatch.description, status: firstPrefixMatch.status, searchDate: new Date().toISOString(), source: 'local-template', isDeleted, isVague: null, vaguenessReasoning: null };
                // Trigger vagueness check
                const promise = window.electronAPI.checkVagueness(term);
                vaguenessCheckMap.set(resultKey, vaguenessCheckPromises.length);
                vaguenessCheckPromises.push(promise);
            } else {
                // Check Partial (Substring) Local Match
                let firstPartialMatch = null;
                if (normalizedTerm) {
                    for (const localItem of localDataMap.values()) {
                        const normalizedLocalDesc = normalizeDescription(localItem.description);
                        if (normalizedLocalDesc.includes(normalizedTerm)) {
                            firstPartialMatch = localItem;
                            break;
                        }
                    }
                }
                if (firstPartialMatch) {
                    console.log(`_checkLocalData: Found partial (substring) local match for "${term}"`);
                    foundLocally = true;
                    const isDeleted = firstPartialMatch.status === 'D';
                    const resultKey = `${normalizedTerm}-local-partial`;
                    dbResults[resultKey] = { term, termId: firstPartialMatch.termId, descriptionExample: firstPartialMatch.description, status: firstPartialMatch.status, searchDate: new Date().toISOString(), source: 'local-partial', isDeleted, isVague: null, vaguenessReasoning: null };
                    // Trigger vagueness check
                    const promise = window.electronAPI.checkVagueness(term);
                    vaguenessCheckMap.set(resultKey, vaguenessCheckPromises.length);
                    vaguenessCheckPromises.push(promise);
                }
            }
        }

        // If not found locally, add to DB check list
        if (!foundLocally) {
            console.log(`_checkLocalData: No local match for "${term}". Adding to DB check.`);
            termsRequiringDbCheck.push(term);
        }
    });

    console.log(`_checkLocalData: Complete. ${termsRequiringDbCheck.length} terms require DB check. ${vaguenessCheckPromises.length} vagueness checks initiated.`);
    return { dbResults, termsRequiringDbCheck, vaguenessCheckPromises, vaguenessCheckMap };
};

// 2. Wait for Vagueness Checks and Update Results
const _waitForVaguenessChecks = async (vaguenessCheckPromises, vaguenessCheckMap, dbResults, setPreparationStatus) => {
    if (vaguenessCheckPromises.length === 0) {
        console.log("_waitForVaguenessChecks: No vagueness checks to wait for.");
        return; // Nothing to do
    }

    console.log(`_waitForVaguenessChecks: Waiting for ${vaguenessCheckPromises.length} checks...`);
    setPreparationStatus({ type: 'loading', message: `Running AI vagueness checks (${vaguenessCheckPromises.length})...` });
    const settledResults = await Promise.allSettled(vaguenessCheckPromises);
    console.log(`_waitForVaguenessChecks: Vagueness checks settled.`);

    settledResults.forEach((result, index) => {
        let resultKeyToUpdate = null;
        for (const [key, promiseIndex] of vaguenessCheckMap.entries()) {
            if (promiseIndex === index) {
                resultKeyToUpdate = key;
                break;
            }
        }

        if (resultKeyToUpdate && dbResults[resultKeyToUpdate]) {
            const term = dbResults[resultKeyToUpdate].term;
            if (result.status === 'fulfilled') {
                const vaguenessData = result.value;
                if (vaguenessData && !vaguenessData.error) {
                    dbResults[resultKeyToUpdate].isVague = vaguenessData.isVague;
                    dbResults[resultKeyToUpdate].vaguenessReasoning = vaguenessData.vaguenessReasoning;
                    console.log(`_waitForVaguenessChecks: Updated vagueness for ${term}: isVague=${vaguenessData.isVague}`);
                } else {
                    console.error(`_waitForVaguenessChecks: Vagueness check for ${term} reported error:`, vaguenessData?.error);
                    dbResults[resultKeyToUpdate].vaguenessReasoning = `AI Check Error: ${vaguenessData?.error || 'Unknown error'}`;
                }
            } else {
                console.error(`_waitForVaguenessChecks: Vagueness promise rejected for ${term}:`, result.reason);
                dbResults[resultKeyToUpdate].vaguenessReasoning = `AI Check Failed: ${result.reason?.message || result.reason}`;
            }
        } else {
             console.error(`_waitForVaguenessChecks: Could not find result key for settled promise index ${index}`);
        }
    });
};

// 3. Check Database Cache for Remaining Terms
const _checkDatabaseCache = async (termsRequiringDbCheck, getToken, setPreparationStatus) => {
    if (termsRequiringDbCheck.length === 0) {
        console.log("_checkDatabaseCache: No terms require database checks.");
        return { dbResults: {}, usptoTermsSet: new Set(), mgsTasksCalc: [] };
    }

    console.log(`_checkDatabaseCache: Starting parallel DB checks for ${termsRequiringDbCheck.length} terms...`);
    setPreparationStatus({ type: 'loading', message: `Checking database cache (${termsRequiringDbCheck.length} terms)...` });

    const dbResults = {};
    const usptoTermsSet = new Set();
    const mgsTasksCalc = [];

    try {
        const checkPromises = termsRequiringDbCheck.map(term => getStoredMatch(term, getToken));
        const allStoredResults = await Promise.all(checkPromises);
        console.log(`_checkDatabaseCache: Parallel DB checks completed.`);

        allStoredResults.forEach((storedResults, index) => {
            const term = termsRequiringDbCheck[index];
            const termLower = term.toLowerCase();
            console.log(`_checkDatabaseCache: Processing DB Result for term "${term}":`, storedResults);

            if (storedResults) {
                if (storedResults.needsFresh) usptoTermsSet.add(term);
                if (storedResults.needsMGS) {
                    const needsNiceOn = !storedResults.mgsNiceOn;
                    const needsNiceOff = !storedResults.mgsNiceOff;
                    if (needsNiceOn || needsNiceOff) {
                        mgsTasksCalc.push({ term, needsNiceOn, needsNiceOff });
                    }
                }
                // Populate results object
                if (storedResults.uspto) dbResults[`${termLower}-uspto`] = storedResults.uspto;
                if (storedResults.mgsNiceOn) dbResults[`${termLower}-mgs-nice-on`] = storedResults.mgsNiceOn;
                if (storedResults.mgsNiceOff) dbResults[`${termLower}-mgs-nice-off`] = storedResults.mgsNiceOff;
            } else {
                console.warn(`_checkDatabaseCache: Null result from getStoredMatch for "${term}". Assuming needs search.`);
                usptoTermsSet.add(term);
                mgsTasksCalc.push({ term, needsNiceOn: true, needsNiceOff: true });
            }
        });
        return { dbResults, usptoTermsSet, mgsTasksCalc };

    } catch (error) {
        // Define errorMsg once here
        const errorMsg = `Database check failed: ${error.message || 'Unknown error'}`;
        console.error('_checkDatabaseCache: Error during database check phase:', errorMsg, error);
        // Re-throw the error to be handled by the main prepareSearch function's catch block
        throw error;
    }
};

/**
 * @typedef {'idle' | 'loading' | 'success' | 'error'} PreparationStatusType
 */

/**
 * @typedef {object} PreparationStatus
 * @property {PreparationStatusType} type - The current status type.
 * @property {string} message - A user-friendly message describing the status or error.
 */

/**
 * @typedef {object} MgsTask
 * @property {string} term - The search term.
 * @property {boolean} needsNiceOn - Whether a search with NICE classification is needed.
 * @property {boolean} needsNiceOff - Whether a search without NICE classification is needed.
 */

/**
 * @typedef {object} SearchContextValue
 * @property {string} rawSearchTerms - The raw string input from the search text area.
 * @property {string[]} termsArray - An array of parsed, trimmed, non-empty search terms.
 * @property {Set<string>} currentSearchTermsSet - A Set of lowercase search terms for filtering results.
 * @property {MgsTask[]} mgsTasks - An array of tasks calculated for the MGS search.
 * @property {string[]} usptoTermsList - An array of terms needing a live USPTO search.
 * @property {object} initialDbResults - An object containing results found during local/DB cache checks, keyed by term and source (e.g., 'term-local-exact').
 * @property {boolean} isPreparing - True if the preparation phase (local/DB checks, vagueness checks) is currently running.
 * @property {PreparationStatus} preparationStatus - An object indicating the current status or error of the preparation phase.
 * @property {(event: React.ChangeEvent<HTMLInputElement>) => void} handleSearchTermsChange - Callback to update the raw search terms state.
 * @property {() => Promise<void>} prepareSearch - Async function to initiate the search preparation process.
 */

/**
 * Custom hook to manage the state and logic related to search input and the preparation phase.
 * This includes parsing terms, checking local data, checking a database cache via IPC,
 * initiating AI vagueness checks via IPC, and calculating the necessary tasks for live USPTO and MGS searches.
 *
 * @returns {SearchContextValue} The search context state and functions.
 */
export function useSearchContext() {
  const [rawSearchTerms, setRawSearchTerms] = useState('');
  const [termsArray, setTermsArray] = useState([]);
  const [currentSearchTermsSet, setCurrentSearchTermsSet] = useState(new Set());
  const [mgsTasks, setMgsTasks] = useState([]);
  const [usptoTermsList, setUsptoTermsList] = useState([]);
  const [initialDbResults, setInitialDbResults] = useState({});
  const [isPreparing, setIsPreparing] = useState(false);
  /** @type {[PreparationStatus, React.Dispatch<React.SetStateAction<PreparationStatus>>]} */
  const [preparationStatus, setPreparationStatus] = useState({ type: 'idle', message: '' });
  const { getToken } = useAuth();

  /**
   * Updates the raw search terms state when the input field changes.
   */
  const handleSearchTermsChange = useCallback((event) => {
    setRawSearchTerms(event.target.value);
  }, []);

  /**
   * Initiates the search preparation process.
   * Parses terms, checks local data, waits for vagueness checks, checks DB cache,
   * and sets the state for initial results, USPTO terms, and MGS tasks.
   * Handles errors during the process, potentially falling back to assuming all live searches are needed.
   */
  const prepareSearch = useCallback(async () => {
    if (!rawSearchTerms.trim()) {
      setPreparationStatus({ type: 'error', message: 'Please enter search terms.' });
      return;
    }

    setIsPreparing(true);
    setPreparationStatus({ type: 'loading', message: 'Parsing terms...' }); // Initial status
    clearResultCache(); // Clear DB service cache at the start
    setPreparationStatus({ type: 'loading', message: 'Checking local data...' }); // More specific status

    // Split the raw input terms directly
    const parsedTerms = rawSearchTerms.split(';').map(term => term.trim()).filter(term => term);
    if (parsedTerms.length === 0) {
      setPreparationStatus({ type: 'error', message: 'No valid terms found in input.' });
      setIsPreparing(false);
      return;
    }

    setTermsArray(parsedTerms);
    const termsSet = new Set(parsedTerms.map(t => t.toLowerCase()));
    setCurrentSearchTermsSet(termsSet); // Set this early for potential use

    try {
      // --- Step 1: Check Local Data & Initiate Vagueness Checks ---
      const {
        dbResults: localDbResults,
        termsRequiringDbCheck,
        vaguenessCheckPromises,
        vaguenessCheckMap
      } = _checkLocalData(parsedTerms);

      // --- Step 2: Wait for Vagueness Checks (if any) ---
      await _waitForVaguenessChecks(vaguenessCheckPromises, vaguenessCheckMap, localDbResults, setPreparationStatus);

      // --- Step 3: Check Database Cache for Remaining Terms ---
      const {
        dbResults: cachedDbResults,
        usptoTermsSet,
        mgsTasksCalc
      } = await _checkDatabaseCache(termsRequiringDbCheck, getToken, setPreparationStatus);

      // --- Step 4: Combine Results & Update State ---
      const finalDbResults = { ...localDbResults, ...cachedDbResults };
      setInitialDbResults(finalDbResults);
      // --- MODIFICATION START: Always create MGS tasks for ALL parsed terms ---
      const finalMgsTasks = parsedTerms.map(term => ({
          term: term,
          needsNiceOn: true, // Always request MGS Nice On
          needsNiceOff: true // Always request MGS Nice Off
      }));
      setMgsTasks(finalMgsTasks);
      // --- MODIFICATION END ---
      setUsptoTermsList(Array.from(usptoTermsSet)); // Keep USPTO logic based on cache check of non-local terms
      setPreparationStatus({ type: 'success', message: 'Preparation complete. Ready for live search.' });
      console.log('useSearchContext: Preparation complete.', { finalDbResults, finalMgsTasks, usptoTermsList: Array.from(usptoTermsSet) }); // Log finalMgsTasks

    } catch (error) {
      // Handle errors from _checkDatabaseCache or other unexpected issues
      // Define errorMsg once here
      const errorMsg = `Database check failed: ${error.message || 'Unknown error'}`;
      console.error('useSearchContext: Error during database check phase:', errorMsg, error); // Log the full error too

      // --- MODIFICATION START: Handle DB error by assuming all searches needed ---
      console.warn('useSearchContext: Database check failed. Assuming all terms require live searches.');
      // Use the 'parsedTerms' calculated at the beginning of the function
      setInitialDbResults({}); // No results from DB
      setUsptoTermsList(parsedTerms); // All terms need USPTO (as fallback)
      // MGS tasks are still generated for all terms in this fallback scenario
      setMgsTasks(parsedTerms.map(term => ({ term: term, needsNiceOn: true, needsNiceOff: true })));

      // Set status to success, but indicate DB issue happened. The main DB status indicator should show disconnected.
      setPreparationStatus({ type: 'success', message: 'Database check failed; proceeding with live searches.' });
      // --- MODIFICATION END ---

    } finally {
      setIsPreparing(false); // This still runs, setting loading state to false
    }
  }, [rawSearchTerms, getToken]); // Added getToken to dependency array

  return {
    rawSearchTerms,
    termsArray,
    currentSearchTermsSet,
    mgsTasks,
    usptoTermsList,
    initialDbResults,
    isPreparing,
    preparationStatus,
    handleSearchTermsChange, // Expose handler for input
    prepareSearch, // Expose function to start preparation
  };
}
