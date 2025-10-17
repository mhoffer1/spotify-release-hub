import { useState, useEffect } from 'react';
import type { ReleaseWithArtist, ProgressUpdate } from '@shared/types';
import { DAYS_OPTIONS, DEFAULT_DAYS_BACK } from '@shared/constants';
import TrackSelector from './TrackSelector';
import './ReleaseFinder.css';

function ReleaseFinder() {
  const [daysBack, setDaysBack] = useState(DEFAULT_DAYS_BACK);
  const [maxArtists, setMaxArtists] = useState(5); // Default to 5 for test mode
  const [isScanning, setIsScanning] = useState(false);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [releases, setReleases] = useState<ReleaseWithArtist[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [canCancel, setCanCancel] = useState(false);
  const [showTrackSelector, setShowTrackSelector] = useState(false);

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

  const handleScan = async () => {
    setIsScanning(true);
    setCanCancel(true);
    setProgress(null);
    setReleases([]);

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
      const date = new Date().toISOString().split('T')[0];
      const artistText = testMode && maxArtists > 0 ? ` (${maxArtists} artists)` : '';
      setPlaylistName(`New Releases${artistText} - ${date}`);
      
      // Fetch full track details for all albums
      await fetchTracksFromReleases(response.data.releases);
    } else {
      alert(`Error: ${response.error}`);
    }

    setIsScanning(false);
    setCanCancel(false);
    // Don't clear progress here - keep it visible across tabs
  };

  const fetchTracksFromReleases = async (releases: ReleaseWithArtist[]) => {
    // Fetch tracks from Spotify Web API
    const albumIds = releases.map(r => r.id);
    console.log('[ReleaseFinder] Fetching tracks from', albumIds.length, 'albums');
    
    const fetchedTracks = await window.electronAPI.getTracksFromAlbums(albumIds);
    if (fetchedTracks.success && fetchedTracks.data) {
      console.log('[ReleaseFinder] Got', fetchedTracks.data.length, 'tracks');
      setTracks(fetchedTracks.data);
      setShowTrackSelector(true);
    } else {
      console.error('[ReleaseFinder] Failed to fetch tracks:', fetchedTracks.error);
      alert(`Error fetching tracks: ${fetchedTracks.error}`);
    }
  };

  const handleExportCustomPlaylist = async (trackUris: string[], customPlaylistName: string) => {
    setIsCreatingPlaylist(true);
    setCanCancel(true);
    
    const response = await window.electronAPI.createPlaylistFromTracks({
      playlistName: customPlaylistName,
      trackUris,
      isPublic: false,
    });

    if (response.success && response.data) {
      alert(`Playlist created successfully!\n\n${response.data.tracksAdded} tracks added\n${customPlaylistName}\n\nOpening in Spotify...`);
      if (response.data.playlistUrl) {
        window.open(response.data.playlistUrl, '_blank');
      }
    } else {
      alert(`Error: ${response.error}`);
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

  const handleCreatePlaylist = async () => {
    if (!playlistName.trim()) {
      alert('Please enter a playlist name');
      return;
    }

    if (releases.length === 0) {
      alert('No releases to add to playlist');
      return;
    }

    setIsCreatingPlaylist(true);
    setCanCancel(true);
    setProgress(null);

    const response = await window.electronAPI.createPlaylist({
      playlistName,
      releases,
      isPublic: false,
    });

    if (response.success && response.data) {
      alert(
        `Playlist created successfully!\n\n${response.data.tracksAdded} tracks added\n${playlistName}\n\nOpening in Spotify...`
      );
      // The URL will be opened automatically by the system
      if (response.data.playlistUrl) {
        window.open(response.data.playlistUrl, '_blank');
      }
    } else {
      alert(`Error: ${response.error}`);
    }

    setIsCreatingPlaylist(false);
    setCanCancel(false);
    setProgress(null);
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

        <button
          className="btn btn-primary"
          onClick={handleScan}
          disabled={isLoading}
        >
          {isScanning ? 'Scanning...' : 'Scan for New Releases'}
        </button>
      </div>

      {releases.length > 0 && !showTrackSelector && (
        <div className="results-section">
          <div className="results-header">
            <h3>
              Found {releases.length} new release{releases.length !== 1 ? 's' : ''}
            </h3>
            <p className="results-subtitle">
              Review the releases below. Load tracks to preview songs and select specific tracks, or create a playlist with all releases.
            </p>
          </div>

          <div className="view-options">
            <button
              className="btn btn-primary"
              onClick={() => fetchTracksFromReleases(releases)}
              disabled={isLoading}
            >
              Load Tracks for Preview & Selection
            </button>
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

          <div className="playlist-creator">
            <div className="playlist-form">
              <input
                type="text"
                className="input"
                placeholder="Enter playlist name..."
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                disabled={isCreatingPlaylist}
              />
              <button
                className="btn btn-success btn-large"
                onClick={handleCreatePlaylist}
                disabled={isCreatingPlaylist || !playlistName.trim()}
              >
                {isCreatingPlaylist ? 'Creating Playlist...' : 'Create Playlist on Spotify'}
              </button>
            </div>
            <p className="playlist-hint">
              This will create a new playlist on your Spotify account with all {releases.length} releases
            </p>
          </div>
        </div>
      )}

      {showTrackSelector && tracks.length > 0 && (
        <div className="track-selector-container">
          <button
            className="btn btn-secondary"
            onClick={() => setShowTrackSelector(false)}
            style={{ marginBottom: '16px' }}
          >
            ← Back to Releases
          </button>
          <TrackSelector
            tracks={tracks}
            onExportPlaylist={handleExportCustomPlaylist}
          />
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
