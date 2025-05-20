// This service now acts as a wrapper for IPC calls to the main process for DynamoDB operations.
// It maintains a local cache for performance but does not interact with the AWS SDK directly.

// Note: Functions now expect a `getToken` function (from AuthContext) to be passed in.

// --- Caching ---
const resultCache = new Map(); // Local cache remains in the renderer

// Cache operations helper
export const cacheOperations = {
  clear: () => {
      console.log("Clearing local result cache.");
      resultCache.clear();
  },
  set: (key, value) => resultCache.set(key, value),
  get: (key) => resultCache.get(key),
  has: (key) => resultCache.has(key)
};

// Function to clear the cache (exported)
export const clearResultCache = () => cacheOperations.clear();


// --- Core Functions ---

// Removed storeFullMatch and updateAggregateCache functions as storage is now initiated via IPC directly from useSearchResults

/**
 * Gets stored results for a term, checking cache first, then calling main process via IPC.
 * Determines if fresh USPTO or MGS searches are needed based on the results.
 * @param {string} term - The search term.
 * @param {Function} getToken - Async function to retrieve the current user's ID token.
 */
export const getStoredMatch = async (term, getToken) => {
  if (typeof getToken !== 'function') {
    console.error("DynamoDB Service: getToken function was not provided to getStoredMatch.");
    // Handle appropriately - maybe throw error or return specific state
    return { needsFresh: true, needsMGS: true, uspto: null, mgsNiceOn: null, mgsNiceOff: null };
  }
  const normalizedTerm = term.toLowerCase();
  const cacheKey = `${normalizedTerm}-results`; // Aggregate cache key

  // Check aggregate cache first
  if (resultCache.has(cacheKey)) {
    const cached = resultCache.get(cacheKey);
    console.log(`Using cached aggregate results for ${normalizedTerm}:`, cached);
    return cached;
  }

  try {
    console.log(`Requesting stored matches via IPC for: ${normalizedTerm}`);
    // Retrieve the Cognito ID Token using the passed function
    const idToken = await getToken();
    if (!idToken) {
        console.error("DynamoDB Service: No ID Token available from getToken(). User might not be logged in.");
        // Handle appropriately - maybe throw error or return specific state
        // For now, returning default needsFresh/needsMGS state
        return { needsFresh: true, needsMGS: true, uspto: null, mgsNiceOn: null, mgsNiceOff: null };
    }

    // Call main process to query database for all sources, passing the token
    // Expect main process to return a map like { 'uspto': item, 'mgs-nice-on': item, ... }
    const dbSourceMap = await window.electronAPI.invoke('db:get-match', { term: normalizedTerm, idToken });

    // Process the results returned from the main process
    const usptoResult = dbSourceMap['uspto'] || null;
    const mgsNiceOnResult = dbSourceMap['mgs-nice-on'] || null;
    const mgsNiceOffResult = dbSourceMap['mgs-nice-off'] || null;

    // Determine if searches are needed based on age (e.g., 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    const needsFresh = !(usptoResult && new Date(usptoResult.searchDate).getTime() > thirtyDaysAgo);

    const hasRecentMgsOn = mgsNiceOnResult && new Date(mgsNiceOnResult.searchDate).getTime() > thirtyDaysAgo;
    const hasRecentMgsOff = mgsNiceOffResult && new Date(mgsNiceOffResult.searchDate).getTime() > thirtyDaysAgo;
    // Needs MGS search if *either* NICE variant is missing or outdated
    const needsMGS = !hasRecentMgsOn || !hasRecentMgsOff;

    const results = {
        uspto: usptoResult,
        mgsNiceOn: mgsNiceOnResult,
        mgsNiceOff: mgsNiceOffResult,
        needsFresh,
        needsMGS
    };

    console.log('IPC DB results processed:', {
      term: normalizedTerm,
      hasUSPTO: !!results.uspto,
      hasMgsNiceOn: !!results.mgsNiceOn,
      hasMgsNiceOff: !!results.mgsNiceOff,
      needsFresh: results.needsFresh,
      needsMGS: results.needsMGS
    });

    // Update specific caches from the returned map
    if (results.uspto) cacheOperations.set(`${normalizedTerm}-uspto`, results.uspto);
    if (results.mgsNiceOn) cacheOperations.set(`${normalizedTerm}-mgs-nice-on`, results.mgsNiceOn);
    if (results.mgsNiceOff) cacheOperations.set(`${normalizedTerm}-mgs-nice-off`, results.mgsNiceOff);

    // Cache the aggregated results object
    resultCache.set(cacheKey, results);
    return results;

  } catch (error) {
    // Catch errors from the IPC call itself
    console.error(`IPC Error getting matches for "${normalizedTerm}":`, error);
    // Return default "needs everything" state on IPC error
    return {
      needsFresh: true,
      needsMGS: true,
      uspto: null,
      mgsNiceOn: null,
      mgsNiceOff: null
    };
  }
};


/**
 * Gets a stored match for a specific term and source, checking cache first, then calling main process via IPC.
 * Useful for retrieving a single result entry directly.
 *
 * @param {string} term - The search term.
 * @param {string} source - The specific source (e.g., 'uspto', 'mgs-nice-on', 'mgs-nice-off').
 * @param {Function} getToken - Async function to retrieve the current user's ID token.
 * @returns {Promise<object|null>} A promise that resolves with the specific stored item object, or null if not found or an error occurs.
 */
export const getStoredMatchBySource = async (term, source, getToken) => {
    if (typeof getToken !== 'function') {
      console.error("DynamoDB Service: getToken function was not provided to getStoredMatchBySource.");
      return null; // Or handle as needed
    }
    const normalizedTerm = term.toLowerCase();
    const normalizedSource = source.toLowerCase();
    const specificCacheKey = `${normalizedTerm}-${normalizedSource}`;

    // Check specific cache first
    if (cacheOperations.has(specificCacheKey)) {
        console.log(`Using cached specific result for ${specificCacheKey}`);
        return cacheOperations.get(specificCacheKey);
    }

    // If not in specific cache, call main process via IPC
    try {
        console.log(`Requesting specific match via IPC for: ${specificCacheKey}`);
        // Retrieve the Cognito ID Token using the passed function
        const idToken = await getToken();
        if (!idToken) {
            console.error("DynamoDB Service: No ID Token available from getToken() for getStoredMatchBySource. User might not be logged in.");
            return null; // Or handle as needed
        }

        // Expect main process to return the specific item or null
        const item = await window.electronAPI.invoke('db:get-match-by-source', { term: normalizedTerm, source: normalizedSource, idToken });

        // Cache the result (even if null) to avoid re-querying via IPC
        cacheOperations.set(specificCacheKey, item);
        console.log(`Cached specific result for ${specificCacheKey}:`, item);
        return item;

    } catch (error) {
        console.error(`IPC Error retrieving specific match for ${specificCacheKey}:`, error);
        return null; // Return null on IPC error
    }
};
