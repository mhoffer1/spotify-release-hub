import { useState, useEffect } from 'react';
import './App.css';
import LoginScreen from './components/LoginScreen';
import MainView from './components/MainView';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('App mounted, checking for electronAPI...');
    
    // Check if electronAPI is available
    if (!window.electronAPI) {
      console.error('electronAPI not found on window object');
      setError('Electron API not available. Please make sure you are running the app through Electron.');
      setIsLoading(false);
      return;
    }

    console.log('electronAPI found, checking auth...');

    // Check if already authenticated
    window.electronAPI.checkAuth()
      .then((result) => {
        console.log('Auth check result:', result);
        setIsAuthenticated(result.authenticated);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to check auth:', err);
        setError('Failed to initialize application');
        setIsLoading(false);
      });

    // Listen for errors
    const unsubscribe = window.electronAPI.onError((error) => {
      console.error('Application error:', error);
      alert(`Error: ${error.message}`);
    });

    return () => unsubscribe();
  }, []);

  if (error) {
    return (
      <div className="app">
        <div className="error-container">
          <h1>Error</h1>
          <p>{error}</p>
          <p>Please restart the application.</p>
        </div>
      </div>
    );
  }

  const handleLogin = async () => {
    setIsLoading(true);
    const result = await window.electronAPI.startAuth();
    if (result.success) {
      setIsAuthenticated(true);
    } else {
      alert(`Authentication failed: ${result.error}`);
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    await window.electronAPI.logout();
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <div className="app">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {!isAuthenticated ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <MainView onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
