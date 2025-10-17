import { useState, useEffect } from 'react';
import type { UnfollowedArtist, ProgressUpdate } from '@shared/types';
import './PlaylistFollower.css';

function PlaylistFollower() {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [results, setResults] = useState<{
    playlistName: string;
    playlistOwner: string;
    unfollowedArtists: UnfollowedArtist[];
  } | null>(null);
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribeAnalyze = window.electronAPI.onAnalyzeProgress(setProgress);
    const unsubscribeFollow = window.electronAPI.onFollowProgress(setProgress);

    return () => {
      unsubscribeAnalyze();
      unsubscribeFollow();
    };
  }, []);

  const handleAnalyze = async () => {
    if (!playlistUrl.trim()) {
      alert('Please enter a playlist URL');
      return;
    }

    setIsAnalyzing(true);
    setProgress(null);
    setResults(null);
    setSelectedArtists(new Set());

    const response = await window.electronAPI.analyzePlaylist({ playlistUrl });

    if (response.success && response.data) {
      setResults(response.data);
    } else {
      alert(`Error: ${response.error}`);
    }

    setIsAnalyzing(false);
    setProgress(null);
  };

  const toggleArtist = (artistId: string) => {
    const newSelected = new Set(selectedArtists);
    if (newSelected.has(artistId)) {
      newSelected.delete(artistId);
    } else {
      newSelected.add(artistId);
    }
    setSelectedArtists(newSelected);
  };

  const toggleAll = () => {
    if (!results) return;
    
    if (selectedArtists.size === results.unfollowedArtists.length) {
      setSelectedArtists(new Set());
    } else {
      setSelectedArtists(new Set(results.unfollowedArtists.map((a) => a.id)));
    }
  };

  const handleFollow = async () => {
    if (selectedArtists.size === 0) {
      alert('Please select at least one artist to follow');
      return;
    }

    setIsFollowing(true);
    setProgress(null);

    const response = await window.electronAPI.followArtists({
      artistIds: Array.from(selectedArtists),
    });

    if (response.success && response.data) {
      alert(
        `Successfully followed ${response.data.followedCount} artists!${
          response.data.failedCount > 0
            ? `\n${response.data.failedCount} failed to follow.`
            : ''
        }`
      );
      
      // Remove followed artists from results
      if (results) {
        const updatedArtists = results.unfollowedArtists.filter(
          (a) => !selectedArtists.has(a.id) || response.data!.failedArtists.includes(a.id)
        );
        setResults({ ...results, unfollowedArtists: updatedArtists });
      }
      setSelectedArtists(new Set());
    } else {
      alert(`Error: ${response.error}`);
    }

    setIsFollowing(false);
    setProgress(null);
  };

  return (
    <div className="playlist-follower">
      <div className="section-header">
        <h2>Follow Artists from Playlist</h2>
        <p>Paste a Spotify playlist URL to discover artists you're not following</p>
      </div>

      <div className="input-section">
        <input
          type="text"
          className="input"
          placeholder="https://open.spotify.com/playlist/..."
          value={playlistUrl}
          onChange={(e) => setPlaylistUrl(e.target.value)}
          disabled={isAnalyzing || isFollowing}
        />
        <button
          className="btn btn-primary"
          onClick={handleAnalyze}
          disabled={isAnalyzing || isFollowing || !playlistUrl.trim()}
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze Playlist'}
        </button>
      </div>

      {progress && (
        <div className="progress-container">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            ></div>
          </div>
          <p className="progress-text">
            {progress.message} ({progress.current}/{progress.total})
          </p>
        </div>
      )}

      {results && results.unfollowedArtists.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h3>
              Found {results.unfollowedArtists.length} unfollowed artists in "
              {results.playlistName}"
            </h3>
            <div className="results-actions">
              <button className="btn-link" onClick={toggleAll}>
                {selectedArtists.size === results.unfollowedArtists.length
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleFollow}
                disabled={selectedArtists.size === 0 || isFollowing}
              >
                Follow Selected ({selectedArtists.size})
              </button>
            </div>
          </div>

          <div className="artist-list">
            {results.unfollowedArtists.map((artist) => (
              <div
                key={artist.id}
                className={`artist-card ${
                  selectedArtists.has(artist.id) ? 'selected' : ''
                }`}
                onClick={() => toggleArtist(artist.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedArtists.has(artist.id)}
                  onChange={() => {}}
                  className="artist-checkbox"
                />
                {artist.images && artist.images.length > 0 ? (
                  <img
                    src={artist.images[0].url}
                    alt={artist.name}
                    className="artist-image"
                  />
                ) : (
                  <div className="artist-image-placeholder">
                    <span className="artist-icon">♪</span>
                  </div>
                )}
                <div className="artist-info">
                  <div className="artist-name">{artist.name}</div>
                  <div className="artist-frequency">
                    Appears {artist.frequency} time{artist.frequency !== 1 ? 's' : ''} in playlist
                  </div>
                  {artist.external_urls?.spotify && (
                    <a
                      href={artist.external_urls.spotify}
                      className="artist-link"
                      onClick={(e) => e.stopPropagation()}
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
        </div>
      )}

      {results && results.unfollowedArtists.length === 0 && (
        <div className="empty-state">
          <p>You're already following all artists from this playlist!</p>
        </div>
      )}
    </div>
  );
}

export default PlaylistFollower;
