import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type {
  AnalyzePlaylistRequest,
  AnalyzePlaylistResponse,
  FollowArtistsRequest,
  FollowArtistsResponse,
  ScanReleasesRequest,
  ScanReleasesResponse,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  ProgressUpdate,
} from '../shared/types';

console.log('Preload script starting...');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  startAuth: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_START),
  checkAuth: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),

  // Playlist Analyzer
  analyzePlaylist: (request: AnalyzePlaylistRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYZE_PLAYLIST, request),
  onAnalyzeProgress: (callback: (progress: ProgressUpdate) => void) => {
    const subscription = (_event: any, progress: ProgressUpdate) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.ANALYZE_PLAYLIST_PROGRESS, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ANALYZE_PLAYLIST_PROGRESS, subscription);
  },

  // Follow Artists
  followArtists: (request: FollowArtistsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.FOLLOW_ARTISTS, request),
  onFollowProgress: (callback: (progress: ProgressUpdate) => void) => {
    const subscription = (_event: any, progress: ProgressUpdate) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.FOLLOW_ARTISTS_PROGRESS, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FOLLOW_ARTISTS_PROGRESS, subscription);
  },

  // Scan Releases
  scanReleases: (request: ScanReleasesRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_RELEASES, request),
  onScanProgress: (callback: (progress: ProgressUpdate) => void) => {
    const subscription = (_event: any, progress: ProgressUpdate) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.SCAN_RELEASES_PROGRESS, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_RELEASES_PROGRESS, subscription);
  },

  // Create Playlist
  createPlaylist: (request: CreatePlaylistRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_PLAYLIST, request),
  onCreatePlaylistProgress: (callback: (progress: ProgressUpdate) => void) => {
    const subscription = (_event: any, progress: ProgressUpdate) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.CREATE_PLAYLIST_PROGRESS, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CREATE_PLAYLIST_PROGRESS, subscription);
  },

  // Error handling
  onError: (callback: (error: { message: string }) => void) => {
    const subscription = (_event: any, error: { message: string }) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.ERROR, subscription);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ERROR, subscription);
  },
});

// Type declarations for window object
declare global {
  interface Window {
    electronAPI: {
      startAuth: () => Promise<{ success: boolean; error?: string }>;
      checkAuth: () => Promise<{ authenticated: boolean }>;
      logout: () => Promise<{ success: boolean }>;
      analyzePlaylist: (request: AnalyzePlaylistRequest) => Promise<{ 
        success: boolean; 
        data?: AnalyzePlaylistResponse; 
        error?: string 
      }>;
      onAnalyzeProgress: (callback: (progress: ProgressUpdate) => void) => () => void;
      followArtists: (request: FollowArtistsRequest) => Promise<{ 
        success: boolean; 
        data?: FollowArtistsResponse; 
        error?: string 
      }>;
      onFollowProgress: (callback: (progress: ProgressUpdate) => void) => () => void;
      scanReleases: (request: ScanReleasesRequest) => Promise<{ 
        success: boolean; 
        data?: ScanReleasesResponse; 
        error?: string 
      }>;
      onScanProgress: (callback: (progress: ProgressUpdate) => void) => () => void;
      createPlaylist: (request: CreatePlaylistRequest) => Promise<{ 
        success: boolean; 
        data?: CreatePlaylistResponse; 
        error?: string 
      }>;
      onCreatePlaylistProgress: (callback: (progress: ProgressUpdate) => void) => () => void;
      onError: (callback: (error: { message: string }) => void) => () => void;
    };
  }
}

console.log('Preload script completed, electronAPI exposed');
