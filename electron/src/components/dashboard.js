import React, { useState, useEffect } from 'react'; // Added useState, useEffect
import { Box, Container, Button, Typography, CircularProgress } from '@mui/material'; // Added CircularProgress
import Maincontent from './Maincontent'; // Corrected import path casing
import { useAuth } from '../context/AuthContext'; // Import useAuth

/**
 * The main dashboard component displayed after successful authentication.
 * It renders a simple header with the username and a logout button,
 * and includes the `Maincontent` component which handles the core search functionality.
 */
function Dashboard() {
  const { user, logout } = useAuth(); // Get user and logout function
  const [updateStatus, setUpdateStatus] = useState('idle'); // 'idle', 'checking', 'downloading', 'converting', 'up-to-date', 'update-complete', 'error'
  const [updateMessage, setUpdateMessage] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // Listen for status updates from the main process
    const removeStatusListener = window.electronAPI.onUpdateStatus(({ status, message }) => {
      console.log('Renderer received update status:', status, message);
      setUpdateStatus(status);
      setUpdateMessage(message || ''); // Set message or clear if none provided
      setIsUpdating(['checking', 'downloading', 'converting'].includes(status));
    });

    // Optional: Listen for data updated signal if you need to refresh UI elements
    const removeDataListener = window.electronAPI.onDataUpdated(() => {
        console.log('Renderer received data-updated signal.');
        // Potentially trigger a refresh of data used in Maincontent here
        // For now, just reset status message after a delay
        setTimeout(() => {
             if (updateStatus === 'update-complete') { // Only clear success message
                 setUpdateStatus('idle');
                 setUpdateMessage('');
             }
        }, 5000); // Clear message after 5 seconds
    });


    // Cleanup listeners on component unmount
    return () => {
      removeStatusListener();
      removeDataListener();
    };
  }, [updateStatus]); // Re-run effect if updateStatus changes (e.g., to clear message)

  const handleUpdateCheck = () => {
    if (isUpdating) return; // Prevent multiple clicks
    console.log('Requesting manual update check...');
    setIsUpdating(true); // Optimistically set updating state
    setUpdateStatus('checking');
    setUpdateMessage('Initiating manual check...');
    window.electronAPI.requestUpdateCheck().catch(err => {
        console.error("Error invoking requestUpdateCheck:", err);
        setUpdateStatus('error');
        setUpdateMessage(`Error starting check: ${err.message}`);
        setIsUpdating(false);
    });
  };


  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Container 
        maxWidth={false}
        sx={{
          flex: 1,
          py: 3, // Keep vertical padding
          // Removed horizontal padding (px) and maxWidth
          display: 'flex', // Ensure container allows flex item (Maincontent) to grow
          flexDirection: 'column', // Stack children vertically
          // Add some padding if needed, e.g., px: 2
        }}
      >
        {/* Simple Header for User Info and Logout */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 1, // Padding for the header
            borderBottom: 1, // Separator line
            borderColor: 'divider'
          }}
        >
          <Typography variant="body1" sx={{ mr: 2 }}> {/* Added margin */}
            Welcome, {user?.username || 'User'} {/* Display username from user object */}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}> {/* Group buttons and status */}
            {/* Update Status Display */}
            {isUpdating && <CircularProgress size={20} sx={{ mr: 1 }} />}
            <Typography variant="caption" sx={{ mr: 1, minWidth: '150px', textAlign: 'right' }}>
              {updateStatus !== 'idle' ? updateMessage || updateStatus : ''}
            </Typography>
            {/* Update Button */}
            <Button
              variant="contained" // Changed variant for emphasis
              size="small"
              onClick={handleUpdateCheck}
              disabled={isUpdating}
              sx={{ mr: 1 }} // Add margin between buttons
            >
              Update USPTO Manual
            </Button>
            {/* Logout Button */}
            <Button variant="outlined" size="small" onClick={logout}>
              Logout
            </Button>
          </Box>
        </Box>

        {/* Main Content Area */}
        {/* Removed themeMode and changeTheme props from Maincontent */}
        <Maincontent /> {/* Corrected component name casing */}
      </Container>
    </Box>
  );
}

export default Dashboard;
