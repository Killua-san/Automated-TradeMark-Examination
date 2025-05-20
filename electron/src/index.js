// electron/renderer.js (or electron/index.js, etc.)
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app'; // Corrected import path
import { AuthProvider } from './context/AuthContext'; // Import AuthProvider
import { ThemeProviderWrapper } from './context/ThemeContext'; // Import ThemeProviderWrapper
import './styles/styles.css'; // Fix import path to use relative path

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider> {/* Wrap App with AuthProvider */}
      <ThemeProviderWrapper> {/* Wrap AuthProvider (and thus App) with ThemeProviderWrapper */}
        <App />
      </ThemeProviderWrapper>
    </AuthProvider>
  </React.StrictMode>
);
