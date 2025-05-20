import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
// No longer need direct ipcRenderer import here
import {
    authenticateUser,
    confirmSignUp,
    getCurrentUserIdToken,
    getCurrentUserSession,
    signOutUser,
    signUpUser
} from '../services/AuthService'; // Assuming AuthService is in ../services/

/**
 * @typedef {object} UserProfile - Represents the user profile information derived from the ID token payload.
 * @property {string} sub - The user's unique identifier (subject).
 * @property {string} email - The user's email address.
 * @property {boolean} email_verified - Whether the user's email has been verified.
 * @property {string} username - The user's username (from Cognito).
 * // Add other relevant fields from your Cognito ID token payload if needed
 */

/**
 * @typedef {object} AuthContextType
 * @property {UserProfile | null} user - The authenticated user's profile object, or null if not authenticated.
 * @property {boolean} isAuthenticated - True if the user is currently authenticated (ID token exists).
 * @property {boolean} isLoading - True while the initial session check is in progress.
 * @property {(username: string, password: string) => Promise<boolean>} login - Function to authenticate the user. Returns true on success, throws error on failure.
 * @property {(username: string, email: string, password: string) => Promise<any>} signup - Function to initiate user signup. Returns CognitoUser object on success, throws error on failure.
 * @property {(username: string, code: string) => Promise<string>} confirmSignup - Function to confirm user signup with a verification code. Returns 'SUCCESS' on success, throws error on failure.
 * @property {() => void} logout - Function to sign the user out.
 * @property {() => Promise<string|null>} getToken - Async function to retrieve the current valid JWT ID token, handling refresh if necessary. Returns token string or null.
 */

/**
 * React Context for managing authentication state and operations.
 * Provides user profile, authentication status, loading state, and functions for login, logout, signup, etc.
 * @type {React.Context<AuthContextType|null>}
 */
const AuthContext = createContext(null);

/**
 * Provides the authentication context to its children components.
 * Handles session checking, token management (including IPC for main process), and exposes auth functions.
 * @param {object} props
 * @param {React.ReactNode} props.children - The child components to wrap with the provider.
 */
export const AuthProvider = ({ children }) => {
    /** @type {[UserProfile|null, React.Dispatch<React.SetStateAction<UserProfile|null>>]} */
    const [user, setUser] = useState(null); // Store user profile object or null
    const [idToken, setIdToken] = useState(null); // Store JWT ID token
    const [isLoading, setIsLoading] = useState(true); // Track initial session check

    /**
     * Checks for an existing valid user session on initial load or when needed.
     * Updates user, idToken, and isLoading state based on the session status.
     * Uses `getCurrentUserSession` from AuthService, which handles token refresh.
     */
    const checkSession = useCallback(async () => {
        setIsLoading(true);
        console.log("AuthContext: Checking user session...");
        try {
            const session = await getCurrentUserSession();
            if (session && session.isValid()) {
                setUser(session.getIdToken().payload); // Store user info from token payload
                setIdToken(session.getIdToken().getJwtToken());
                console.log("AuthContext: Session restored for", session.getIdToken().payload.username);
            } else {
                setUser(null);
                setIdToken(null);
            }
        } catch (error) {
            console.error("AuthContext: Error checking session:", error);
            setUser(null);
            setIdToken(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        checkSession();
    }, [checkSession]);

    /**
     * Effect hook to set up an IPC listener for 'get-fresh-token-request' from the main process.
     * When requested, it retrieves the current (potentially refreshed) ID token using `getToken`
     * and sends it back to the main process via a dynamically provided response channel.
     * This allows the main process to make authenticated requests (e.g., to DynamoDB).
     * Cleans up the listener on unmount.
     */
    useEffect(() => {
        // Check if the electronAPI and the necessary functions are exposed by preload
        if (window.electronAPI && typeof window.electronAPI.on === 'function' && typeof window.electronAPI.invoke === 'function') {

            const listener = async (responseChannel) => {
                if (!responseChannel || typeof responseChannel !== 'string') {
                    console.error("AuthContext: Invalid responseChannel received from main process.");
                    return;
                }
                console.log(`AuthContext: Received 'get-fresh-token-request' for channel ${responseChannel}.`);
                try {
                    // Use the existing service function which handles refresh logic
                    const token = await getCurrentUserIdToken();
                    console.log(`AuthContext: Got token (length ${token ? token.length : 'null'}), invoking response on ${responseChannel}.`);
                    // Send the token back to the main process via the specific response channel
                    await window.electronAPI.invoke(responseChannel, token);
                    console.log(`AuthContext: Successfully invoked response on ${responseChannel}.`);
                } catch (error) {
                    console.error(`AuthContext: Error getting/sending token for channel ${responseChannel}:`, error);
                    // Attempt to send null back on error to unblock main process, if possible
                    try {
                        await window.electronAPI.invoke(responseChannel, null);
                    } catch (invokeError) {
                         console.error(`AuthContext: Failed to invoke null response on ${responseChannel}:`, invokeError);
                    }
                }
            };

            // Use the exposed 'on' function from preload script to listen for requests
            const unsubscribe = window.electronAPI.on('get-fresh-token-request', listener);
            console.log("AuthContext: Listener 'get-fresh-token-request' registered via preload.");

            // Cleanup listener on component unmount
            return () => {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                    console.log("AuthContext: Listener 'get-fresh-token-request' removed via preload.");
                }
            };
        } else {
            console.warn("AuthContext: window.electronAPI.on or window.electronAPI.invoke not available. Cannot register token request listener.");
        }
    }, []); // Empty dependency array ensures this runs only once on mount/unmount

    /**
     * Authenticates a user with username and password.
     * Updates user, idToken, and isLoading state.
     * @param {string} username - The user's username.
     * @param {string} password - The user's password.
     * @returns {Promise<boolean>} True if login is successful.
     * @throws {Error} If login fails (error is re-thrown from AuthService).
     */
    const login = useCallback(async (username, password) => {
        setIsLoading(true);
        try {
            const session = await authenticateUser(username, password);
            if (session && session.isValid()) {
                setUser(session.getIdToken().payload);
                setIdToken(session.getIdToken().getJwtToken());
                console.log("AuthContext: Login successful for", username);
                setIsLoading(false);
                return true; // Indicate success
            }
             throw new Error("Invalid session after login."); // Should not happen
        } catch (error) {
            console.error("AuthContext: Login failed:", error);
            setUser(null);
            setIdToken(null);
            setIsLoading(false);
            throw error; // Re-throw for the component to handle
        }
    }, []);

    /**
     * Initiates the signup process for a new user.
     * Does not log the user in automatically. Confirmation is required.
     * @param {string} username - The desired username.
     * @param {string} email - The user's email address.
     * @param {string} password - The desired password.
     * @returns {Promise<any>} The CognitoUser object from AuthService, needed for confirmation.
     * @throws {Error} If signup fails (error is re-thrown from AuthService).
     */
    const signup = useCallback(async (username, email, password) => {
        // No loading state change here, handled by component maybe
        try {
            const cognitoUser = await signUpUser(username, email, password);
            console.log("AuthContext: Signup initiated for", username);
            return cognitoUser; // Return user for confirmation step
        } catch (error) {
            console.error("AuthContext: Signup failed:", error);
            throw error; // Re-throw for component
        }
    }, []);

     /**
      * Confirms user signup using the verification code sent to the user.
      * @param {string} username - The username of the user being confirmed.
      * @param {string} code - The verification code.
      * @returns {Promise<string>} Should resolve with 'SUCCESS' if confirmation is successful.
      * @throws {Error} If confirmation fails (error is re-thrown from AuthService).
      */
    const confirmSignup = useCallback(async (username, code) => {
        try {
            const result = await confirmSignUp(username, code);
            console.log("AuthContext: Signup confirmed for", username, result);
            return result; // Should be 'SUCCESS'
        } catch (error) {
            console.error("AuthContext: Signup confirmation failed:", error);
            throw error; // Re-throw for component
        }
    }, []);


    /**
     * Logs the current user out by clearing the session and local state.
     */
    const logout = useCallback(() => {
        try {
            signOutUser();
            setUser(null);
            setIdToken(null);
            console.log("AuthContext: User logged out.");
        } catch (error) {
             console.error("AuthContext: Error during logout:", error);
             // Still clear local state even if Cognito signout had issues
             setUser(null);
             setIdToken(null);
        }
    }, []);

    /**
     * Retrieves the current JWT ID token.
     * Returns the token from state if available, otherwise attempts to fetch
     * the current session (which handles refresh) via AuthService.
     * Updates the token state if a new token is fetched.
     * Essential for making authenticated requests (e.g., via IPC to main process).
     * @returns {Promise<string|null>} The JWT ID token string, or null if unavailable/unauthenticated.
     */
    const getToken = useCallback(async () => {
        if (idToken) {
            // Basic check: If we have a token in state, assume it's likely valid
            // (AuthService's getSession handles refresh implicitly when called).
            // For simplicity, we rely on checkSession/getSession to manage validity.
            return idToken;
        }
        // If no token in state, explicitly try to get the current token (which triggers refresh if needed)
        // If no token in state, try fetching the session again
        console.log("AuthContext: No token in state, attempting to get session.");
        const currentIdToken = await getCurrentUserIdToken();
        setIdToken(currentIdToken); // Update state
        return currentIdToken;

    }, [idToken]); // Dependency on idToken state

    /**
     * The value provided by the AuthContext.
     * Includes authentication state and functions.
     * @type {AuthContextType}
     */
    const value = {
        user,
        isAuthenticated: !!idToken,
        isLoading,
        login,
        signup,
        confirmSignup,
        logout,
        getToken,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

/**
 * Custom hook to easily access the AuthContext value.
 * Ensures the hook is used within an AuthProvider.
 * @returns {AuthContextType} The authentication context value.
 * @throws {Error} If used outside of an AuthProvider.
 */
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === null || context === undefined) { // Added null check for stricter type safety
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
