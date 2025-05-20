import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const SignUp = ({ onSwitchToLogin }) => { // Added prop to switch forms
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmationCode, setConfirmationCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [needsConfirmation, setNeedsConfirmation] = useState(false); // Track if confirmation step is needed
    const { signup, confirmSignup } = useAuth();

    const handleSignUpSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            await signup(username, email, password);
            setNeedsConfirmation(true); // Move to confirmation step
            setError(''); // Clear previous errors
        } catch (err) {
            console.error("Signup component error:", err);
            setError(err.message || 'Sign up failed.');
            setNeedsConfirmation(false); // Stay on signup form if initial signup fails
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmationSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            const result = await confirmSignup(username, confirmationCode);
            if (result === 'SUCCESS') {
                alert('Account confirmed successfully! Please log in.');
                onSwitchToLogin(); // Switch to login form after successful confirmation
            } else {
                 setError('Confirmation failed. Please try again.');
            }
        } catch (err) {
            console.error("Confirmation component error:", err);
            setError(err.message || 'Confirmation failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            {!needsConfirmation ? (
                <>
                    <h2>Sign Up</h2>
                    <form onSubmit={handleSignUpSubmit}>
                        <div>
                            <label htmlFor="signup-username">Username:</label>
                            <input
                                type="text"
                                id="signup-username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="signup-email">Email:</label>
                            <input
                                type="email"
                                id="signup-email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="signup-password">Password:</label>
                            <input
                                type="password"
                                id="signup-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                // Add password policy hints if desired
                            />
                        </div>
                        {error && <p style={{ color: 'red' }}>{error}</p>}
                        <button type="submit" disabled={loading}>
                            {loading ? 'Signing up...' : 'Sign Up'}
                        </button>
                    </form>
                    <p>
                        Already have an account?{' '}
                        <button onClick={onSwitchToLogin} disabled={loading}>
                            Login
                        </button>
                    </p>
                </>
            ) : (
                <>
                    <h2>Confirm Sign Up</h2>
                    <p>A confirmation code has been sent to {email}. Please enter it below.</p>
                    <form onSubmit={handleConfirmationSubmit}>
                        <div>
                            <label htmlFor="confirmation-code">Confirmation Code:</label>
                            <input
                                type="text"
                                id="confirmation-code"
                                value={confirmationCode}
                                onChange={(e) => setConfirmationCode(e.target.value)}
                                required
                            />
                        </div>
                        {error && <p style={{ color: 'red' }}>{error}</p>}
                        <button type="submit" disabled={loading}>
                            {loading ? 'Confirming...' : 'Confirm Account'}
                        </button>
                    </form>
                     <p>
                        Entered wrong details?{' '}
                        <button onClick={() => setNeedsConfirmation(false)} disabled={loading}>
                            Go Back to Sign Up
                        </button>
                         {' '}or{' '}
                         <button onClick={onSwitchToLogin} disabled={loading}>
                            Go to Login
                        </button>
                    </p>
                </>
            )}
        </div>
    );
};

export default SignUp;
