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
  CreatePlaylistFromTracksRequest,
  ProgressUpdate,
  UpdateInfoPayload,
  UpdateErrorPayload,
  SpotifyTrack,
  UpdateCheckOptions,
} from '../shared/types';

type Unsubscribe = () => void;

type InvokeResult<T> = Promise<{ success: boolean; data?: T; error?: string; message?: string }>;

type UpdateCheckResult = Promise<{ success: boolean; message?: string }>;

const subscribe = <T>(channel: (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS], callback: (payload: T) => void): Unsubscribe => {
  const handler = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  startAuth: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_START),
  checkAuth: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),

  // Playlist Analyzer
  analyzePlaylist: (request: AnalyzePlaylistRequest): InvokeResult<AnalyzePlaylistResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYZE_PLAYLIST, request),
  onAnalyzeProgress: (callback: (progress: ProgressUpdate) => void): Unsubscribe =>
    subscribe(IPC_CHANNELS.ANALYZE_PLAYLIST_PROGRESS, callback),

  // Follow Artists
  followArtists: (request: FollowArtistsRequest): InvokeResult<FollowArtistsResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.FOLLOW_ARTISTS, request),
  onFollowProgress: (callback: (progress: ProgressUpdate) => void): Unsubscribe =>
    subscribe(IPC_CHANNELS.FOLLOW_ARTISTS_PROGRESS, callback),

  // Scan Releases
  scanReleases: (request: ScanReleasesRequest): InvokeResult<ScanReleasesResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCAN_RELEASES, request),
  onScanProgress: (callback: (progress: ProgressUpdate) => void): Unsubscribe =>
    subscribe(IPC_CHANNELS.SCAN_RELEASES_PROGRESS, callback),

  // Playlist creation
  createPlaylist: (request: CreatePlaylistRequest): InvokeResult<CreatePlaylistResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_PLAYLIST, request),
  onCreatePlaylistProgress: (callback: (progress: ProgressUpdate) => void): Unsubscribe =>
    subscribe(IPC_CHANNELS.CREATE_PLAYLIST_PROGRESS, callback),

  // Track management
  getTracksFromAlbums: (albumIds: string[]): InvokeResult<SpotifyTrack[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_TRACKS_FROM_ALBUMS, albumIds),
  createPlaylistFromTracks: (
    request: CreatePlaylistFromTracksRequest
  ): InvokeResult<CreatePlaylistResponse> => ipcRenderer.invoke(IPC_CHANNELS.CREATE_PLAYLIST_FROM_TRACKS, request),

  // Updates
  checkForUpdates: (options?: UpdateCheckOptions): UpdateCheckResult =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATES_CHECK, options),
  onUpdateAvailable: (callback: (info: UpdateInfoPayload) => void): Unsubscribe =>
    subscribe(IPC_CHANNELS.UPDATES_AVAILABLE, callback),
  onUpdateNotAvailable: (callback: () => void): Unsubscribe =>
    subscribe(IPC_CHANNELS.UPDATES_NOT_AVAILABLE, () => callback()),
  onUpdateError: (callback: (error: UpdateErrorPayload) => void): Unsubscribe =>
    subscribe(IPC_CHANNELS.UPDATES_ERROR, callback),

  // Utilities
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // Error handling
  onError: (callback: (error: { message: string }) => void): Unsubscribe =>
    subscribe(IPC_CHANNELS.ERROR, callback),
});

declare global {
  interface Window {
    electronAPI: {
      startAuth: () => Promise<{ success: boolean; error?: string }>;
      checkAuth: () => Promise<{ authenticated: boolean; error?: string }>;
      logout: () => Promise<{ success: boolean }>;
      analyzePlaylist: (request: AnalyzePlaylistRequest) => InvokeResult<AnalyzePlaylistResponse>;
      onAnalyzeProgress: (callback: (progress: ProgressUpdate) => void) => Unsubscribe;
      followArtists: (request: FollowArtistsRequest) => InvokeResult<FollowArtistsResponse>;
      onFollowProgress: (callback: (progress: ProgressUpdate) => void) => Unsubscribe;
      scanReleases: (request: ScanReleasesRequest) => InvokeResult<ScanReleasesResponse>;
      onScanProgress: (callback: (progress: ProgressUpdate) => void) => Unsubscribe;
      createPlaylist: (request: CreatePlaylistRequest) => InvokeResult<CreatePlaylistResponse>;
      onCreatePlaylistProgress: (callback: (progress: ProgressUpdate) => void) => Unsubscribe;
      getTracksFromAlbums: (albumIds: string[]) => InvokeResult<SpotifyTrack[]>;
      createPlaylistFromTracks: (request: CreatePlaylistFromTracksRequest) => InvokeResult<CreatePlaylistResponse>;
      checkForUpdates: (options?: UpdateCheckOptions) => UpdateCheckResult;
      onUpdateAvailable: (callback: (info: UpdateInfoPayload) => void) => Unsubscribe;
      onUpdateNotAvailable: (callback: () => void) => Unsubscribe;
      onUpdateError: (callback: (error: UpdateErrorPayload) => void) => Unsubscribe;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      onError: (callback: (error: { message: string }) => void) => Unsubscribe;
    };
  }
}
