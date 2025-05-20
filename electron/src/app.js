import React, { useState } from 'react'; // Import useState
// Removed ThemeProvider, createTheme, responsiveFontSizes, CssBaseline
import Box from '@mui/material/Box'; // Import Box for centering
import Dashboard from './components/dashboard';
import { useAuth } from './context/AuthContext'; // Import useAuth
import Login from './components/Login';       // Import Login component
import SignUp from './components/SignUp';     // Import SignUp component

// Removed theme palettes (lightPalette, darkPalette, blackPalette)

/**
 * The root component of the application.
 * Handles routing based on authentication state:
 * - Shows a loading indicator while checking the session.
 * - Shows Login or SignUp components if the user is not authenticated.
 * - Shows the main Dashboard component if the user is authenticated.
 * Uses `AuthContext` to determine the authentication status.
 */
function App() {
  const { isAuthenticated, isLoading } = useAuth(); // Get auth state
  const [showLogin, setShowLogin] = useState(true); // State to toggle between Login and SignUp forms

  // Removed themeMode state, theme creation logic, useEffect for theme, and changeTheme function

  // Conditional Rendering Logic
  let content;
  if (isLoading) {
    content = <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">Loading...</Box>;
  } else if (!isAuthenticated) {
    content = (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" sx={{ p: 2 }}>
        {showLogin ? (
          <Login onSwitchToSignup={() => setShowLogin(false)} />
        ) : (
          <SignUp onSwitchToLogin={() => setShowLogin(true)} />
        )}
      </Box>
    );
  } else {
    // User is authenticated, show the main dashboard
    // Removed themeMode and changeTheme props from Dashboard
    content = <Dashboard />;
  }

  // Removed ThemeProvider and CssBaseline wrapper
  return (
    <> {/* Use Fragment or Box if a wrapper is needed, but ThemeProvider is gone */}
      {content} {/* Render the conditionally selected content */}
    </>
  );
}

export default App;
