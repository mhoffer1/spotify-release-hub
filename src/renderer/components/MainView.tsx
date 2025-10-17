import { useState } from 'react';
import './MainView.css';
import PlaylistFollower from './PlaylistFollower';
import ReleaseFinder from './ReleaseFinder';

interface MainViewProps {
  onLogout: () => void;
}

function MainView({ onLogout }: MainViewProps) {
  const [activeTab, setActiveTab] = useState<'playlist' | 'releases'>('playlist');

  return (
    <div className="main-view">
      <header className="app-header">
        <h1 className="header-title">Spotify Release Hub</h1>
        <button className="btn btn-secondary logout-btn" onClick={onLogout}>
          Logout
        </button>
      </header>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'playlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('playlist')}
        >
          Follow from Playlist
        </button>
        <button
          className={`tab ${activeTab === 'releases' ? 'active' : ''}`}
          onClick={() => setActiveTab('releases')}
        >
          Find New Releases
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'playlist' ? <PlaylistFollower /> : <ReleaseFinder />}
      </div>
    </div>
  );
}

export default MainView;
