import React from 'react';
import {
  Box,
  Drawer,
  Typography,
  IconButton,
  TextField,
  Button,
  LinearProgress,
  Stack,
  useTheme,
  alpha,
  Alert,
} from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4'; // Moon (for light mode)
import Brightness7Icon from '@mui/icons-material/Brightness7'; // Sun (for black mode -> light)
import NightsStayIcon from '@mui/icons-material/NightsStay'; // Crescent (for dark mode -> black)
import SearchIcon from '@mui/icons-material/Search';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useState } from 'react'; // Import useState for loading indicator
import { useThemeContext } from '../context/ThemeContext'; // Import the theme context hook

const drawerWidth = 340; // Keep consistent width

/**
 * Renders the left-side drawer panel containing the search input field,
 * search/cancel buttons, status indicators (DB connection, progress, messages),
 * search timing results, and theme toggle button.
 *
 * @param {object} props - Component props.
 * @param {string} props.searchTerms - The current value of the search input field.
 * @param {object} props.dbStatus - Object indicating database connection status ({ connected: boolean, message: string }).
 * @param {boolean} props.isSearching - True if any search preparation or execution is active.
 * @param {string|null} props.currentSearch - The type of search currently running ('uspto', 'mgs') or null.
 * @param {number} props.searchProgress - The progress percentage (0-100) of the current search.
 * @param {object} props.searchStatus - Object indicating the overall search status ({ type: string, message: string }).
 * @param {object} props.searchTime - Object containing search durations ({ uspto: string|null, mgs: string|null }).
 * @param {string} props.currentTermMessage - Message indicating the term currently being processed.
 * @param {(event: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) => void} props.onSearchTermsChange - Callback when the search input value changes.
 * @param {() => void} props.onSearchClick - Callback when the search button is clicked.
 * @param {() => void} props.onCancelClick - Callback when the cancel button is clicked.
 */
function SearchInputPanel({
  // State props
  searchTerms,
  dbStatus,
  isSearching,
  currentSearch, // To show which search is running ('uspto' or 'mgs')
  searchProgress,
  searchStatus,
  searchTime,
  // themeMode, // Removed prop
  currentTermMessage, // Added prop for current term being processed
  // Callback props
  onSearchTermsChange,
  onSearchClick,
  onCancelClick,
  // changeTheme, // Removed prop
}) {
  const theme = useTheme(); // Keep using MUI's useTheme for theme object access
  const { themeMode, changeTheme } = useThemeContext(); // Get mode and changer from context
  const [isFormatting, setIsFormatting] = useState(false); // State for paste formatting loader

  // Handle Enter key press in TextField
  const handleKeyDown = (event) => {
    // Check if Enter key was pressed and search isn't running
    if (event.key === 'Enter' && !isSearching) {
      // Prevent default form submission behavior if any
      event.preventDefault();
      // Trigger the search (db connection check will happen in the workflow)
      onSearchClick();
    }
  };

  // --- Handle Paste and Format ---
  const handlePaste = async (event) => {
    event.preventDefault(); // Prevent default paste
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) return;

    console.log("Pasted text:", pastedText);
    setIsFormatting(true); // Show loader/indicator if needed

    try {
      // Call the AI formatting function via preload API
      const formattedText = await window.electronAPI.formatInput(pastedText);
      console.log("Formatted text received:", formattedText);
      // Update the state via the prop callback from the context hook
      onSearchTermsChange({ target: { value: formattedText } }); // Simulate event object
    } catch (error) {
      console.error("Error formatting pasted text:", error);
      // Handle error - maybe show a notification to the user?
      // For now, just paste the original text as fallback
      onSearchTermsChange({ target: { value: pastedText } });
    } finally {
      setIsFormatting(false); // Hide loader
    }
  };

  // Helper to render the status alert (moved from MainContent)
  const getStatusAlert = () => {
    // Don't show idle message or searching message if progress bar is visible
    if (searchStatus.type === 'idle' || (searchStatus.type === 'searching' && isSearching)) return null;

    let severity = searchStatus.type;
    if (searchStatus.type === 'cancelled') severity = 'info';
    if (searchStatus.type === 'loading') severity = 'info';
    // Default to 'info' for types other than error/success/warning/info
    if (!['error', 'success', 'warning', 'info'].includes(severity)) severity = 'info';

    return (
      <Alert severity={severity} sx={{ mt: 1, mb: 0.5 }} variant="outlined">
        {searchStatus.message}
      </Alert>
    );
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          borderRight: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box sx={{ p: 2.5, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h5" sx={{ mb: 4, color: 'text.primary' }}>
          Trademark ID Search
        </Typography>

        <Typography variant="caption" sx={{ color: dbStatus.connected ? 'success.main' : 'error.main', mb: 3, textAlign: 'center' }}>
          {dbStatus.message}
        </Typography>

        <Stack spacing={3}>
          <TextField
            id="search-terms-input"
            label="Enter Descriptions"
            multiline
            rows={7}
            placeholder="Enter descriptions seperated by a semi-colon (e.g. 'term1; term2; term3')"
            value={searchTerms}
            onChange={onSearchTermsChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste} // Add paste handler
            variant="outlined"
            fullWidth
            disabled={isFormatting} // Disable input while formatting
            sx={{
              '& .MuiOutlinedInput-root': {
                // Removed bgcolor: alpha(theme.palette.action.hover, 0.5)
                // Add subtle focus enhancement
                '&.Mui-focused fieldset': {
                  borderWidth: '2px', // Slightly thicker border on focus
                },
                // Ensure smooth transition
                transition: theme.transitions.create(['border-color', 'box-shadow', 'border-width']),
              },
            }}
          />

          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              fullWidth
              onClick={onSearchClick} // Use prop callback
              disabled={isSearching} // Remove dbStatus check from disabled state
              startIcon={isSearching ? <HourglassEmptyIcon /> : <SearchIcon />}
              sx={{ py: 1.25 }}
            >
              {/* Use props for dynamic button text */}
              {isFormatting ? 'Formatting...' : (isSearching ? `${currentSearch?.toUpperCase() ?? ''} Searching...` : 'Search All')}
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={onCancelClick} // Use prop callback
              disabled={!isSearching} // Use prop state
              sx={{ px: 2 }}
              aria-label="Cancel Search"
            >
              <CancelIcon />
            </Button> {/* Ensure closing tag */}
          </Stack>

          <Box sx={{ height: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center', mt: 1 }}>
            {isSearching && ( // Use prop state
              <LinearProgress
                variant="determinate"
                value={searchProgress} // Use prop state
                sx={{ height: 6, borderRadius: theme.shape.borderRadius, mb: 0.5 }}
              />
            )}
            {/* Display current term message below progress bar */}
            {isSearching && currentTermMessage && (
              <Typography variant="caption" sx={{ textAlign: 'center', color: 'text.secondary', mt: 0.5, minHeight: '18px' }}>
                {currentTermMessage}
              </Typography>
            )}
            {getStatusAlert()} {/* Use helper function */}
            {/* Show idle message when not searching and status is idle */}
            {!isSearching && searchStatus.type === 'idle' && (
              <Typography variant="caption" sx={{ textAlign: 'center', color: 'text.secondary', minHeight: '24px' }}>
                {searchStatus.message} {/* Use prop state */}
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>

      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack spacing={0.5}>
            {/* Use prop state for search times */}
            {searchTime.uspto && <Typography variant="caption" color="text.secondary">USPTO: {searchTime.uspto}</Typography>}
            {searchTime.mgs && <Typography variant="caption" color="text.secondary">MGS: {searchTime.mgs}</Typography>}
          </Stack>
          <IconButton
            onClick={changeTheme} // Use new function
            title={
              themeMode === 'light' ? "Switch to Dark Mode" :
              themeMode === 'dark' ? "Switch to Black Mode" :
              "Switch to Light Mode" // Currently black
            }
          >
            {/* Cycle icons based on current mode */}
            {themeMode === 'light' && <Brightness4Icon />}
            {themeMode === 'dark' && <NightsStayIcon />}
            {themeMode === 'black' && <Brightness7Icon />}
          </IconButton>
        </Box>
      </Box>
    </Drawer>
  );
}

export default SearchInputPanel;
