import './LoginScreen.css';

interface LoginScreenProps {
  onLogin: () => void;
}

function LoginScreen({ onLogin }: LoginScreenProps) {
  return (
    <div className="login-screen">
      <div className="login-content">
        <div className="logo-section">
          <h1 className="app-title">Spotify Release Hub</h1>
          <p className="app-subtitle">Your Desktop Power Tool for Spotify</p>
        </div>

        <div className="features">
          <div className="feature">
            <div className="feature-icon">♪</div>
            <h3>Follow from Playlists</h3>
            <p>Discover and follow artists from any playlist</p>
          </div>
          <div className="feature">
            <div className="feature-icon">★</div>
            <h3>New Release Finder</h3>
            <p>Never miss new music from your followed artists</p>
          </div>
        </div>

        <button className="btn btn-primary login-btn" onClick={onLogin}>
          Login with Spotify
        </button>

        <p className="login-notice">
          You'll be redirected to Spotify to authorize this app
        </p>
      </div>
    </div>
  );
}

export default LoginScreen;
