// Configuration for AWS Cognito and the backend API Gateway (Using CommonJS syntax)

const cognitoConfig = {
  // Cognito User Pool ID
  userPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID || 'YOUR_COGNITO_USER_POOL_ID_HERE',
  // Cognito App Client ID (Public client - no secret)
  clientId: process.env.REACT_APP_COGNITO_CLIENT_ID || 'YOUR_COGNITO_CLIENT_ID_HERE',
  // AWS region your Cognito User Pool is in
  region: process.env.REACT_APP_COGNITO_REGION || 'YOUR_COGNITO_REGION_HERE'
};

const apiConfig = {
  // Invoke URL of your deployed API Gateway stage
  baseUrl: process.env.REACT_APP_API_BASE_URL || 'YOUR_API_BASE_URL_HERE'
};

// Basic validation (can be expanded)
// Check if default placeholder values are still being used (excluding process.env overrides)
if (cognitoConfig.userPoolId === 'YOUR_COGNITO_USER_POOL_ID_HERE' ||
    cognitoConfig.clientId === 'YOUR_COGNITO_CLIENT_ID_HERE' ||
    cognitoConfig.region === 'YOUR_COGNITO_REGION_HERE' ||
    apiConfig.baseUrl === 'YOUR_API_BASE_URL_HERE') {
  // This warning might still appear if using defaults, which is okay for testing.
  // Consider removing this check or making it more robust if defaults are intended.
  if (!process.env.REACT_APP_COGNITO_USER_POOL_ID && !process.env.REACT_APP_COGNITO_CLIENT_ID && !process.env.REACT_APP_COGNITO_REGION && !process.env.REACT_APP_API_BASE_URL) {
      console.warn(
        'AWS Config: Using default Cognito/API Gateway details from aws-config.js. ' +
        'Ensure these are correct or set corresponding REACT_APP_... environment variables for production.'
      );
  }
} else if (!cognitoConfig.userPoolId || !cognitoConfig.clientId || !cognitoConfig.region || !apiConfig.baseUrl) {
   // Check if any value is actually missing (not just default)
   console.error(
    'AWS Config: One or more Cognito or API Gateway details are missing. ' +
    'Check aws-config.js or REACT_APP_... environment variables.'
  );
}

console.log('App Config Initialized:', {
  cognitoRegion: cognitoConfig.region,
  cognitoUserPoolId: cognitoConfig.userPoolId,
  cognitoClientId: cognitoConfig.clientId ? '******' : 'Not Set', // Mask client ID
  apiBaseUrl: apiConfig.baseUrl
});

// Other app-wide configurations
const appConfig = {
  // Example: Set a default timeout for API calls
  apiTimeout: 30000, // 30 seconds
};

// Export using CommonJS module.exports
module.exports = {
  cognitoConfig,
  apiConfig,
  appConfig
};

// Note: Removed all direct AWS SDK credential configuration.
// Authentication is now handled via Cognito and API Gateway.
