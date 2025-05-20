import React, { createContext, useState, useMemo, useEffect, useContext } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, responsiveFontSizes } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// Define palettes (copied from app.js)
const lightPalette = {
  mode: 'light',
  primary: { main: '#1976d2', light: '#42a5f5', dark: '#1565c0' },
  secondary: { main: '#78909c' },
  background: { default: '#fafafa', paper: '#ffffff' },
  text: { primary: 'rgba(0, 0, 0, 0.87)', secondary: 'rgba(0, 0, 0, 0.6)' },
  error: { main: '#f44336' },
  warning: { main: '#ffa726' },
  info: { main: '#29b6f6' },
  success: { main: '#66bb6a' },
  divider: 'rgba(0, 0, 0, 0.12)',
};

const darkPalette = {
  mode: 'dark',
  primary: { main: '#64b5f6', light: '#90caf9', dark: '#2196f3' },
  secondary: { main: '#90a4ae' },
  background: { default: '#1f1f1f', paper: '#242424' },
  text: { primary: '#e0e0e0', secondary: '#b0bec5' },
  error: { main: '#f44336' },
  warning: { main: '#ffa726' },
  info: { main: '#29b6f6' },
  success: { main: '#66bb6a' },
  divider: 'rgba(255, 255, 255, 0.12)',
};

const blackPalette = {
  mode: 'dark',
  primary: { main: '#64b5f6', light: '#90caf9', dark: '#2196f3' },
  secondary: { main: '#90a4ae' },
  background: { default: '#000000', paper: '#121212' },
  text: { primary: '#e0e0e0', secondary: '#b0bec5' },
  error: { main: '#f44336' },
  warning: { main: '#ffa726' },
  info: { main: '#29b6f6' },
  success: { main: '#66bb6a' },
  divider: 'rgba(255, 255, 255, 0.2)',
};

// Create the context
const ThemeContext = createContext();

// Create the provider component
export const ThemeProviderWrapper = ({ children }) => {
  const [themeMode, setThemeMode] = useState(() => {
    const storedTheme = localStorage.getItem('themeMode');
    if (storedTheme && ['light', 'dark', 'black'].includes(storedTheme)) {
      return storedTheme;
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });

  const changeTheme = useMemo(() => () => {
    setThemeMode(prevMode => {
      const nextMode = prevMode === 'light' ? 'dark' : prevMode === 'dark' ? 'black' : 'light';
      localStorage.setItem('themeMode', nextMode);
      // Apply class to body for non-MUI styles and scrollbars
      document.body.classList.remove('light-mode', 'dark-mode', 'black-mode');
      document.body.classList.add(`${nextMode}-mode`);
      return nextMode;
    });
  }, []); // changeTheme itself doesn't need dependencies as it only uses setThemeMode

  useEffect(() => {
    // Apply initial class to body on mount
    document.body.classList.remove('light-mode', 'dark-mode', 'black-mode');
    document.body.classList.add(`${themeMode}-mode`);
  }, [themeMode]); // Run only when themeMode changes

  const theme = useMemo(() => {
    let palette;
    switch (themeMode) {
      case 'dark': palette = darkPalette; break;
      case 'black': palette = blackPalette; break;
      case 'light': default: palette = lightPalette; break;
    }

    let createdTheme = createTheme({
      palette: palette,
      shape: { borderRadius: 8 },
      typography: {
        h5: { fontWeight: 600 },
        subtitle1: { fontWeight: 500 }
      },
      components: {
        MuiButton: { styleOverrides: { root: { textTransform: 'none' } } },
        MuiTab: { styleOverrides: { root: { textTransform: 'none' } } },
        MuiTabs: {
          styleOverrides: {
            indicator: { height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
          },
        },
      }
    });
    return responsiveFontSizes(createdTheme);
  }, [themeMode]);

  return (
    <ThemeContext.Provider value={{ themeMode, changeTheme }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline /> {/* Apply MUI base styles and background */}
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

// Custom hook to use the theme context
export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useThemeContext must be used within a ThemeProviderWrapper');
  }
  return context;
};
