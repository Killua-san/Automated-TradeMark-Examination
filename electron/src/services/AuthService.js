import {
  CognitoUserPool,
  CognitoUserAttribute,
  CognitoUser,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';
import { cognitoConfig } from '../config/aws-config'; // Import the updated config

const userPool = new CognitoUserPool({
  UserPoolId: cognitoConfig.userPoolId,
  ClientId: cognitoConfig.clientId,
});

/**
 * Signs up a new user.
 * @param {string} username - The desired username.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's chosen password.
 * @returns {Promise<CognitoUser>} A promise that resolves with the CognitoUser object if signup initiated successfully.
 */
export const signUpUser = (username, email, password) => {
  return new Promise((resolve, reject) => {
    const attributeList = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      // Add other required attributes here if configured in Cognito
    ];

    userPool.signUp(username, password, attributeList, null, (err, result) => {
      if (err) {
        console.error('Sign up error:', err);
        reject(err);
        return;
      }
      console.log('Sign up successful:', result);
      resolve(result.user); // The user object is needed for confirmation
    });
  });
};

/**
 * Confirms the user's signup with a verification code.
 * @param {string} username - The username of the user to confirm.
 * @param {string} code - The verification code sent to the user (e.g., via email).
 * @returns {Promise<string>} A promise that resolves with 'SUCCESS' on successful confirmation.
 */
export const confirmSignUp = (username, code) => {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool,
    });

    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) {
        console.error('Confirmation error:', err);
        reject(err);
        return;
      }
      console.log('Confirmation successful:', result);
      resolve(result); // Should be 'SUCCESS'
    });
  });
};

/**
 * Authenticates a user (signs them in).
 * @param {string} username - The username.
 * @param {string} password - The password.
 * @returns {Promise<object>} A promise that resolves with the user session object containing tokens.
 */
export const authenticateUser = (username, password) => {
  return new Promise((resolve, reject) => {
    const authenticationData = {
      Username: username,
      Password: password,
    };
    const authenticationDetails = new AuthenticationDetails(authenticationData);

    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session) => {
        console.log('Authentication successful:', session);
        // You typically want the ID token for API Gateway authorization
        // const idToken = session.getIdToken().getJwtToken();
        resolve(session);
      },
      onFailure: (err) => {
        console.error('Authentication failed:', err);
        reject(err);
      },
      // Handle MFA, new password required, etc. if configured
      // newPasswordRequired: (userAttributes, requiredAttributes) => { ... }
      // mfaRequired: (codeDeliveryDetails) => { ... }
    });
  });
};

/**
 * Gets the current authenticated user's session (including tokens).
 * Refreshes tokens if necessary.
 * @returns {Promise<object|null>} A promise that resolves with the session object or null if not authenticated.
 */
export const getCurrentUserSession = () => {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      console.log('No current user found.');
      resolve(null); // Not logged in
      return;
    }

    cognitoUser.getSession((err, session) => {
      if (err) {
        console.error('Error getting session:', err);
        // Often means session expired or invalid, treat as logged out
        resolve(null);
        return;
      }
      if (!session || !session.isValid()) {
         console.log('Session is invalid or expired.');
         resolve(null);
         return;
      }
      console.log('Session is valid.');
      resolve(session); // Session contains getIdToken(), getAccessToken(), getRefreshToken()
    });
  });
};

/**
 * Signs out the current user globally.
 */
export const signOutUser = () => {
  const cognitoUser = userPool.getCurrentUser();
  if (cognitoUser) {
    console.log('Signing out user...');
    cognitoUser.signOut();
    // Note: This clears tokens locally. No promise/callback needed.
  } else {
     console.log('No current user to sign out.');
  }
};

/**
 * Gets the ID token from the current valid session.
 * @returns {Promise<string|null>} A promise that resolves with the JWT ID token or null.
 */
export const getCurrentUserIdToken = async () => {
    try {
        const session = await getCurrentUserSession();
        if (session && session.isValid()) {
            return session.getIdToken().getJwtToken();
        }
        return null;
    } catch (error) {
        // Error getting session likely means not logged in or session invalid
        console.error("Error retrieving ID token:", error);
        return null;
    }
};

// Add other functions as needed (e.g., forgotPassword, changePassword)
