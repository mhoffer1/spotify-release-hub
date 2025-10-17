/// <reference types="vite/client" />

import type {
  AnalyzePlaylistRequest,
  AnalyzePlaylistResponse,
  FollowArtistsRequest,
  FollowArtistsResponse,
  ScanReleasesRequest,
  ScanReleasesResponse,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  GetTracksResponse,
  CreatePlaylistFromTracksRequest,
  SpotifyTrack,
  ProgressUpdate,
} from '@shared/types';

declare global {
  interface Window {
    electronAPI: {
      // Auth
      startAuth: () => Promise<{ success: boolean; error?: string }>;
      checkAuth: () => Promise<{ authenticated: boolean }>;
      logout: () => Promise<{ success: boolean }>;

      // Playlist Analyzer
      analyzePlaylist: (request: AnalyzePlaylistRequest) => Promise<{
        success: boolean;
        data?: AnalyzePlaylistResponse;
        error?: string;
      }>;
      onAnalyzeProgress: (callback: (progress: ProgressUpdate) => void) => () => void;

      // Follow Artists
      followArtists: (request: FollowArtistsRequest) => Promise<{
        success: boolean;
        data?: FollowArtistsResponse;
        error?: string;
      }>;
      onFollowProgress: (callback: (progress: ProgressUpdate) => void) => () => void;

      // Scan Releases
      scanReleases: (request: ScanReleasesRequest) => Promise<{
        success: boolean;
        data?: ScanReleasesResponse;
        error?: string;
      }>;
      onScanProgress: (callback: (progress: ProgressUpdate) => void) => () => void;

      // Create Playlist
      createPlaylist: (request: CreatePlaylistRequest) => Promise<{
        success: boolean;
        data?: CreatePlaylistResponse;
        error?: string;
      }>;
      onCreatePlaylistProgress: (callback: (progress: ProgressUpdate) => void) => () => void;

      // Track Management
      getTracksFromAlbums: (albumIds: string[]) => Promise<{
        success: boolean;
        data?: SpotifyTrack[];
        error?: string;
      }>;
      createPlaylistFromTracks: (request: CreatePlaylistFromTracksRequest) => Promise<{
        success: boolean;
        data?: CreatePlaylistResponse;
        error?: string;
      }>;

      // Utilities
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;

      // Error handling
      onError: (callback: (error: { message: string }) => void) => () => void;
    };
  }
}

export {};
