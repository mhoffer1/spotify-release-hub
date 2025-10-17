// Shared TypeScript interfaces and types

export interface SpotifyArtist {
  id: string;
  name: string;
  external_urls?: {
    spotify?: string;
  };
  images?: Array<{
    url: string;
    height: number;
    width: number;
  }>;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album?: SpotifyAlbum;
  duration_ms: number;
  external_urls?: {
    spotify?: string;
  };
  preview_url?: string | null;
  uri?: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album_type: 'album' | 'single' | 'compilation';
  album_group?: string;
  release_date: string;
  release_date_precision: 'year' | 'month' | 'day';
  total_tracks: number;
  images?: Array<{
    url: string;
    height: number;
    width: number;
  }>;
  external_urls?: {
    spotify?: string;
  };
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string;
  owner: {
    display_name: string;
    id: string;
  };
  tracks: {
    total: number;
  };
  external_urls?: {
    spotify?: string;
  };
  images?: Array<{
    url: string;
  }>;
}

export interface UnfollowedArtist extends SpotifyArtist {
  frequency: number;
}

export interface ReleaseWithArtist extends SpotifyAlbum {
  artist_name: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface AppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Auth
  AUTH_START: 'auth:start',
  AUTH_SUCCESS: 'auth:success',
  AUTH_ERROR: 'auth:error',
  AUTH_CHECK: 'auth:check',
  AUTH_LOGOUT: 'auth:logout',
  
  // Playlist Artist Follower
  ANALYZE_PLAYLIST: 'playlist:analyze',
  ANALYZE_PLAYLIST_PROGRESS: 'playlist:analyze:progress',
  ANALYZE_PLAYLIST_COMPLETE: 'playlist:analyze:complete',
  FOLLOW_ARTISTS: 'playlist:follow',
  FOLLOW_ARTISTS_PROGRESS: 'playlist:follow:progress',
  FOLLOW_ARTISTS_COMPLETE: 'playlist:follow:complete',
  
  // New Releases
  SCAN_RELEASES: 'releases:scan',
  SCAN_RELEASES_PROGRESS: 'releases:scan:progress',
  SCAN_RELEASES_COMPLETE: 'releases:scan:complete',
  CREATE_PLAYLIST: 'releases:create-playlist',
  CREATE_PLAYLIST_PROGRESS: 'releases:create-playlist:progress',
  CREATE_PLAYLIST_COMPLETE: 'releases:create-playlist:complete',
  
  // Track Management
  GET_TRACKS_FROM_ALBUMS: 'tracks:get-from-albums',
  CREATE_PLAYLIST_FROM_TRACKS: 'tracks:create-playlist',
  
  // General
  ERROR: 'error',
} as const;

// Request/Response types for IPC
export interface AnalyzePlaylistRequest {
  playlistUrl: string;
}

export interface AnalyzePlaylistResponse {
  playlistName: string;
  playlistOwner: string;
  unfollowedArtists: UnfollowedArtist[];
}

export interface FollowArtistsRequest {
  artistIds: string[];
}

export interface FollowArtistsResponse {
  followedCount: number;
  failedCount: number;
  failedArtists: string[];
}

export interface ScanReleasesRequest {
  daysBack: number;
  maxArtists?: number;
}

export interface ScanReleasesResponse {
  releases: ReleaseWithArtist[];
  totalArtistsChecked: number;
}

export interface CreatePlaylistRequest {
  playlistName: string;
  releases: ReleaseWithArtist[];
  isPublic: boolean;
}

export interface CreatePlaylistResponse {
  playlistUrl: string;
  playlistId: string;
  tracksAdded: number;
}

export interface GetTracksRequest {
  albumIds: string[];
}

export interface GetTracksResponse {
  tracks: SpotifyTrack[];
}

export interface CreatePlaylistFromTracksRequest {
  playlistName: string;
  trackUris: string[];
  isPublic: boolean;
}

export interface ProgressUpdate {
  current: number;
  total: number;
  message: string;
}
