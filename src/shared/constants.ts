export const APP_NAME = 'Spotify Release Hub';
export const APP_VERSION = '1.0.0';

// Spotify API Configuration
export const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';
export const SPOTIFY_ACCOUNTS_BASE_URL = 'https://accounts.spotify.com';

// OAuth Scopes
export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-follow-read',
  'user-follow-modify',
].join(' ');

// Rate limiting
export const DEFAULT_DELAY_MS = 200; // Delay between API calls
export const RATE_LIMIT_RETRY_DEFAULT = 5; // Default retry after seconds for rate limits
export const CHUNK_SIZE_FOLLOW = 20; // Artists to follow per request
export const CHUNK_SIZE_PLAYLIST_ADD = 100; // Tracks to add to playlist per request
export const CHUNK_SIZE_TRACK_DETAILS = 50; // Track detail lookups per batch (Spotify max)
export const MAX_REQUESTS_PER_INTERVAL = 15; // Soft cap per rate-limit window
export const REQUEST_INTERVAL_MS = 1000; // Rate-limit window size in ms
export const MAX_RATE_LIMIT_WAIT_SECONDS = 30; // Upper bound for retry-after waits
export const MAX_DYNAMIC_DELAY_MS = 2000; // Ceiling for adaptive delay backoff

// UI Constants
export const DAYS_OPTIONS = [7, 14, 30];
export const DEFAULT_DAYS_BACK = 7;
export const DEFAULT_MAX_ARTISTS = 0; // 0 means all
