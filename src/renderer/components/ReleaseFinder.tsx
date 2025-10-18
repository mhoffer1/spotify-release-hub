import { useState, useEffect } from 'react';
import type { ReleaseWithArtist, ProgressUpdate } from '@shared/types';
import { DAYS_OPTIONS, DEFAULT_DAYS_BACK } from '@shared/constants';
import './ReleaseFinder.css';

function ReleaseFinder() {
  const [daysBack, setDaysBack] = useState(DEFAULT_DAYS_BACK);
  const [maxArtists, setMaxArtists] = useState(5); // Default to 5 for test mode
  const [isScanning, setIsScanning] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [releases, setReleases] = useState<ReleaseWithArtist[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [canCancel, setCanCancel] = useState(false);
  const [playlistSummary, setPlaylistSummary] = useState<{
    name: string;
    url?: string;
    tracksAdded?: number;
  } | null>(null);

  const generateDefaultPlaylistName = () => {
    const date = new Date().toISOString().split('T')[0];
    return `New Releases - ${date}`;
  };

  useEffect(() => {
    const unsubscribeScan = window.electronAPI.onScanProgress((p: ProgressUpdate) => {
      setProgress(p);
    });
    const unsubscribeCreate = window.electronAPI.onCreatePlaylistProgress((p: ProgressUpdate) => {
      setProgress(p);
    });

    return () => {
      unsubscribeScan();
      unsubscribeCreate();
    };
  }, []);

  useEffect(() => {
    if (!playlistName) {
      setPlaylistName(generateDefaultPlaylistName());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setCanCancel(true);
    setProgress(null);
    setReleases([]);
    setPlaylistSummary(null);

    const effectiveMaxArtists = testMode && maxArtists > 0 ? maxArtists : 0;
    console.log('[ReleaseFinder] Scanning with params:', { daysBack, testMode, maxArtists, effectiveMaxArtists });

    const response = await window.electronAPI.scanReleases({
      daysBack,
      maxArtists: effectiveMaxArtists, // 0 means all artists
    });

    if (response.success && response.data) {
      console.log('[ReleaseFinder] Scan results:', {
        totalReleases: response.data.releases.length,
        requestedMaxArtists: effectiveMaxArtists
      });
      setReleases(response.data.releases);

      if (response.data.releases.length === 0) {
        alert('No new releases found for the selected timeframe.');
        setIsScanning(false);
        setCanCancel(false);
        return;
      }

      const defaultName = generateDefaultPlaylistName();
      const finalPlaylistName = playlistName.trim() || defaultName;
      setPlaylistName(finalPlaylistName);

      await createPlaylistFromReleases(response.data.releases, finalPlaylistName);
    } else {
      alert(`Error: ${response.error}`);
    }

    setIsScanning(false);
    setCanCancel(false);
    // Don't clear progress here - keep it visible across tabs
  };

  const createPlaylistFromReleases = async (releaseData: ReleaseWithArtist[], finalName: string) => {
    setIsCreatingPlaylist(true);
    setCanCancel(true);
    setProgress(null);

    const response = await window.electronAPI.createPlaylist({
      playlistName: finalName,
      releases: releaseData,
      isPublic: false,
    });

    if (response.success && response.data) {
      alert(
        `Playlist created successfully!\n\n${response.data.tracksAdded} tracks added\n${finalName}\n\nOpening in Spotify...`
      );
      if (response.data.playlistUrl) {
        window.open(response.data.playlistUrl, '_blank');
      }
      setPlaylistSummary({
        name: finalName,
        url: response.data.playlistUrl,
        tracksAdded: response.data.tracksAdded,
      });
    } else {
      alert(`Error: ${response.error}`);
      setPlaylistSummary(null);
    }

    setIsCreatingPlaylist(false);
    setCanCancel(false);
  };

  const handleCancel = () => {
    // Since operations run in main process, we'll just hide the UI state
    setIsScanning(false);
    setIsCreatingPlaylist(false);
    setCanCancel(false);
    setProgress(null);
    alert('Operation cancelled. Note: Background process may still complete.');
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isLoading = isScanning || isCreatingPlaylist;

  return (
    <div className="release-finder">
      <div className="section-header">
        <h2>Find New Releases</h2>
        <p>Discover recent releases from your followed artists</p>
      </div>

      {/* Persistent loading indicator */}
      {progress && (
        <div className="progress-container sticky-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            ></div>
          </div>
          <div className="progress-info">
            <p className="progress-text">
              {progress.message} ({progress.current}/{progress.total})
            </p>
            {canCancel && (
              <button
                className="btn btn-cancel"
                onClick={handleCancel}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <div className="control-panel">
        <div className="control-group">
          <label htmlFor="days-select">Look back:</label>
          <select
            id="days-select"
            className="select"
            value={daysBack}
            onChange={(e) => setDaysBack(Number(e.target.value))}
            disabled={isLoading}
          >
            {DAYS_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              disabled={isLoading}
            />
            <span>Test mode (limit artists)</span>
          </label>
        </div>

        {testMode && (
          <div className="control-group">
            <label htmlFor="max-artists">Max artists:</label>
            <input
              id="max-artists"
              type="number"
              className="input small-input"
              min="1"
              max="50"
              value={maxArtists || 5}
              onChange={(e) => setMaxArtists(Number(e.target.value))}
              disabled={isLoading}
              placeholder="5"
            />
            <span className="hint">Useful for testing with fewer artists</span>
          </div>
        )}

        <div className="control-group">
          <label htmlFor="playlist-name">Playlist name:</label>
          <input
            id="playlist-name"
            type="text"
            className="input"
            placeholder="New Releases - YYYY-MM-DD"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            disabled={isLoading}
          />
          <span className="hint">Playlist will be created automatically after scan</span>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleScan}
          disabled={isLoading}
        >
          {isScanning || isCreatingPlaylist ? 'Processing...' : 'Scan & Create Playlist'}
        </button>
      </div>

      {releases.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h3>
              Found {releases.length} new release{releases.length !== 1 ? 's' : ''}
            </h3>
            <p className="results-subtitle">
              Playlist <strong>{playlistSummary?.name || playlistName}</strong> was created automatically with these releases.
            </p>
          </div>

          <div className="release-list">
            {releases.map((release) => (
              <div key={release.id} className="release-card">
                {release.images && release.images[0] && (
                  <img
                    src={release.images[0].url}
                    alt={release.name}
                    className="release-image"
                  />
                )}
                <div className="release-info">
                  <div className="release-name">{release.name}</div>
                  <div className="release-artist">{release.artist_name}</div>
                  <div className="release-meta">
                    <span className="release-type">{release.album_type.toUpperCase()}</span>
                    <span className="release-separator">•</span>
                    <span className="release-date">{formatDate(release.release_date)}</span>
                    <span className="release-separator">•</span>
                    <span className="release-tracks">{release.total_tracks} track{release.total_tracks !== 1 ? 's' : ''}</span>
                  </div>
                  {release.external_urls?.spotify && (
                    <a
                      href={release.external_urls.spotify}
                      className="release-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on Spotify →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {playlistSummary && (
            <div className="playlist-creator">
              <div className="playlist-summary">
                <p>
                  Added <strong>{playlistSummary.tracksAdded ?? releases.length}</strong> tracks to playlist{' '}
                  <strong>{playlistSummary.name}</strong>.
                </p>
                {playlistSummary.url && (
                  <a
                    href={playlistSummary.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="release-link"
                  >
                    Open playlist in Spotify →
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!isScanning && releases.length === 0 && !progress && (
        <div className="empty-state">
          <p>Select a timeframe and scan to discover new releases!</p>
          {testMode && <p className="hint">Test mode is enabled - scanning will be limited to {maxArtists || 5} artists</p>}
        </div>
      )}
    </div>
  );
}

export default ReleaseFinder;
