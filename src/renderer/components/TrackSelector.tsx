import { useState } from 'react';
import './TrackSelector.css';

interface Track {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
  duration_ms: number;
  preview_url: string | null;
  uri: string;
}

interface TrackSelectorProps {
  tracks: Track[];
  onExportPlaylist: (selectedTrackUris: string[], playlistName: string) => Promise<void>;
}

function TrackSelector({ tracks, onExportPlaylist }: TrackSelectorProps) {
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [playlistName, setPlaylistName] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const toggleTrack = (trackId: string) => {
    const newSelected = new Set(selectedTracks);
    if (newSelected.has(trackId)) {
      newSelected.delete(trackId);
    } else {
      newSelected.add(trackId);
    }
    setSelectedTracks(newSelected);
  };

  const selectAll = () => {
    setSelectedTracks(new Set(tracks.map(t => t.id)));
  };

  const deselectAll = () => {
    setSelectedTracks(new Set());
  };

  const playTrack = (track: Track) => {
    // Open track in Spotify (app or web player)
    // This will play the full track in the user's Spotify account
    const spotifyUrl = `https://open.spotify.com/track/${track.id}`;
    window.electronAPI.openExternal(spotifyUrl);
  };

  const handleExport = async () => {
    if (selectedTracks.size === 0) {
      alert('Please select at least one track');
      return;
    }

    if (!playlistName.trim()) {
      alert('Please enter a playlist name');
      return;
    }

    setIsExporting(true);

    try {
      const selectedTrackUris = tracks
        .filter(t => selectedTracks.has(t.id))
        .map(t => t.uri);

      await onExportPlaylist(selectedTrackUris, playlistName.trim());
      
      // Reset after successful export
      setSelectedTracks(new Set());
      setPlaylistName('');
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="track-selector">
      <div className="track-selector-header">
        <div className="header-info">
          <h2>Select Tracks</h2>
          <p className="track-count">
            {selectedTracks.size} of {tracks.length} selected
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-text" onClick={selectAll}>
            Select All
          </button>
          <button className="btn-text" onClick={deselectAll}>
            Deselect All
          </button>
        </div>
      </div>

      <div className="track-list">
        {tracks.map((track, index) => (
          <div
            key={track.id}
            className={`track-item ${selectedTracks.has(track.id) ? 'selected' : ''}`}
          >
            <div className="track-number">{index + 1}</div>
            
            <button
              className="play-button"
              onClick={(e) => {
                e.stopPropagation();
                playTrack(track);
              }}
              title="Play in Spotify"
            >
              ▶
            </button>

            <img
              src={track.album.images[2]?.url || track.album.images[0]?.url}
              alt={track.album.name}
              className="track-album-art"
            />

            <div className="track-info" onClick={() => toggleTrack(track.id)}>
              <div className="track-name">{track.name}</div>
              <div className="track-artist">
                {track.artists.map(a => a.name).join(', ')}
              </div>
            </div>

            <div className="track-album">{track.album.name}</div>
            <div className="track-duration">{formatDuration(track.duration_ms)}</div>

            <input
              type="checkbox"
              checked={selectedTracks.has(track.id)}
              onChange={() => toggleTrack(track.id)}
              className="track-checkbox"
            />
          </div>
        ))}
      </div>

      <div className="export-section">
        <div className="export-controls">
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Enter playlist name..."
            className="playlist-name-input"
            disabled={isExporting}
          />
          <button
            className="btn btn-primary export-button"
            onClick={handleExport}
            disabled={isExporting || selectedTracks.size === 0 || !playlistName.trim()}
          >
            {isExporting ? 'Creating Playlist...' : `Export ${selectedTracks.size} Tracks`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TrackSelector;
