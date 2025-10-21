import { useState, useEffect, useMemo } from 'react';
import './App.css';
import LoginScreen from './components/LoginScreen';
import MainView from './components/MainView';
import type { UpdateInfoPayload } from '@shared/types';

const summarizeReleaseNotes = (notes?: string) => {
  if (!notes) {
    return null;
  }

  const cleaned = notes
    .split('\n')
    .map((line) => line.replace(/^[-*#>\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');

  if (!cleaned) {
    return null;
  }

  const maxLength = 220;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfoPayload | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [isUpdateDismissed, setIsUpdateDismissed] = useState(false);

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
        if (result.error) {
          setError(result.error);
          setIsLoading(false);
          return;
        }
        setIsAuthenticated(result.authenticated);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to check auth:', err);
        setError('Failed to initialize application');
        setIsLoading(false);
      });

    const unsubscribeError = window.electronAPI.onError((ipcError) => {
      console.error('Application error:', ipcError);
      alert(`Error: ${ipcError.message}`);
    });

    const unsubscribeUpdateAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setIsUpdateDismissed(false);
      setUpdateError(null);
      setUpdateMessage(null);
    });

    const unsubscribeUpdateNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
      setUpdateMessage('You are already using the latest version.');
    });

    const unsubscribeUpdateError = window.electronAPI.onUpdateError((updateErr) => {
      setUpdateError(updateErr.message);
    });

    window.electronAPI.checkForUpdates({ silent: true });

    // Listen for errors
    return () => {
      unsubscribeError();
      unsubscribeUpdateAvailable();
      unsubscribeUpdateNotAvailable();
      unsubscribeUpdateError();
    };
  }, []);

  useEffect(() => {
    if (!updateError && !updateMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setUpdateError(null);
      setUpdateMessage(null);
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [updateError, updateMessage]);

  const updateSummary = useMemo(() => summarizeReleaseNotes(updateInfo?.releaseNotes), [updateInfo]);

  const handleViewUpdate = () => {
    if (updateInfo) {
      window.electronAPI.openExternal(updateInfo.url);
      setIsUpdateDismissed(true);
    }
  };

  const handleDismissUpdate = () => {
    setIsUpdateDismissed(true);
  };

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
      if (result.error) {
        setError(result.error);
      } else {
        alert('Authentication failed. Please try again.');
      }
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    await window.electronAPI.logout();
    setIsAuthenticated(false);
  };

  const showUpdateBanner = updateInfo && !isUpdateDismissed;

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
      {showUpdateBanner && (
        <div className="update-banner">
          <div className="update-banner__content">
            <h2>Update available</h2>
            <p>
              Version <strong>{updateInfo.version}</strong>
              {updateInfo.publishedAt && (
                <span>
                  {' '}
                  · Released {new Date(updateInfo.publishedAt).toLocaleDateString()}
                </span>
              )}
            </p>
            {updateSummary && <p className="update-banner__summary">{updateSummary}</p>}
          </div>
          <div className="update-banner__actions">
            <button className="btn btn-primary" onClick={handleViewUpdate}>
              View release
            </button>
            <button className="btn btn-secondary" onClick={handleDismissUpdate}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {updateError && (
        <div className="update-banner update-banner--error">
          <span>{updateError}</span>
          <button className="link-button" onClick={() => setUpdateError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {updateMessage && !showUpdateBanner && (
        <div className="update-banner update-banner--info">
          <span>{updateMessage}</span>
          <button className="link-button" onClick={() => setUpdateMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      {!isAuthenticated ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <MainView onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
