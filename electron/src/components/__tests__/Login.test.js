import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom'; // Import jest-dom matchers
import userEvent from '@testing-library/user-event';
import Login from '../Login'; // Adjust path relative to __tests__ directory
import { AuthProvider } from '../../context/AuthContext'; // Import AuthProvider

// Mock the AuthService as it's likely used within AuthProvider or Login
jest.mock('../../services/AuthService', () => ({
  login: jest.fn().mockResolvedValue({ success: true }), // Mock a successful login
  // Mock getCurrentUserSession as AuthProvider calls it on mount
  // Return null or reject to simulate no active session initially
  getCurrentUserSession: jest.fn().mockResolvedValue(null),
  // Add other functions from AuthService if they are called during render/initialization
}));

// Mock window.electronAPI to prevent console warnings in tests if needed
// global.window.electronAPI = {
//   on: jest.fn(),
//   invoke: jest.fn(),
//   // Add other methods if used by the context/components
// };

describe('Login Component', () => {
  // Helper function to render Login within necessary providers
  const renderLogin = () => {
    render(
      <AuthProvider> {/* Wrap Login with AuthProvider */}
        <Login />
      </AuthProvider>
    );
  };

  it('renders username input field', () => {
    renderLogin();
    // Use regex for case-insensitivity and flexibility - Changed 'email' to 'username'
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it('renders password input field', () => {
    renderLogin();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders login button', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('allows user to type into email and password fields', async () => {
    const user = userEvent.setup();
    renderLogin();

    // Changed 'email' to 'username'
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);

    // Changed variable name and value
    await user.type(usernameInput, 'testuser');
    await user.type(passwordInput, 'password123');

    // Changed variable name and expected value
    expect(usernameInput).toHaveValue('testuser');
    expect(passwordInput).toHaveValue('password123');
  });

  // Add more tests later for form submission, error handling, etc.
  // it('calls login service on form submission', async () => {
  //   const user = userEvent.setup();
  //   const mockLogin = require('../../services/AuthService').login; // Get the mocked function
  //   renderLogin();
  //
  //   const emailInput = screen.getByLabelText(/email/i);
  //   const passwordInput = screen.getByLabelText(/password/i);
  //   const loginButton = screen.getByRole('button', { name: /login/i });
  //
  //   await user.type(emailInput, 'test@example.com');
  //   await user.type(passwordInput, 'password123');
  //   await user.click(loginButton);
  //
  //   expect(mockLogin).toHaveBeenCalledTimes(1);
  //   expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
  // });
});
