import { contextBridge, ipcRenderer } from 'electron';

console.log('=== PRELOAD SCRIPT STARTING ===');
console.log('contextBridge available:', typeof contextBridge !== 'undefined');
console.log('ipcRenderer available:', typeof ipcRenderer !== 'undefined');

// IPC Channel names - must match main process
const IPC_CHANNELS = {
  AUTH_START: 'auth:start',
  AUTH_CHECK: 'auth:check',
  AUTH_LOGOUT: 'auth:logout',
  ANALYZE_PLAYLIST: 'playlist:analyze',
  ANALYZE_PLAYLIST_PROGRESS: 'playlist:analyze:progress',
  FOLLOW_ARTISTS: 'playlist:follow',
  FOLLOW_ARTISTS_PROGRESS: 'playlist:follow:progress',
  SCAN_RELEASES: 'releases:scan',
  SCAN_RELEASES_PROGRESS: 'releases:scan:progress',
  CREATE_PLAYLIST: 'releases:create-playlist',  // Fixed to match types.ts
  CREATE_PLAYLIST_PROGRESS: 'releases:create-playlist:progress',  // Fixed
  GET_TRACKS_FROM_ALBUMS: 'tracks:get-from-albums',
  CREATE_PLAYLIST_FROM_TRACKS: 'tracks:create-playlist',
  APP_ERROR: 'app:error',
};

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    test: () => 'API is working!',
    startAuth: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_START),
    checkAuth: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
    analyzePlaylist: (request: any) => ipcRenderer.invoke(IPC_CHANNELS.ANALYZE_PLAYLIST, request),
    onAnalyzeProgress: (callback: Function) => {
      const sub = (_e: any, p: any) => callback(p);
      ipcRenderer.on(IPC_CHANNELS.ANALYZE_PLAYLIST_PROGRESS, sub);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.ANALYZE_PLAYLIST_PROGRESS, sub);
    },
    followArtists: (request: any) => ipcRenderer.invoke(IPC_CHANNELS.FOLLOW_ARTISTS, request),
    onFollowProgress: (callback: Function) => {
      const sub = (_e: any, p: any) => callback(p);
      ipcRenderer.on(IPC_CHANNELS.FOLLOW_ARTISTS_PROGRESS, sub);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.FOLLOW_ARTISTS_PROGRESS, sub);
    },
    scanReleases: (request: any) => ipcRenderer.invoke(IPC_CHANNELS.SCAN_RELEASES, request),
    onScanProgress: (callback: Function) => {
      const sub = (_e: any, p: any) => callback(p);
      ipcRenderer.on(IPC_CHANNELS.SCAN_RELEASES_PROGRESS, sub);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_RELEASES_PROGRESS, sub);
    },
    createPlaylist: (request: any) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_PLAYLIST, request),
    onCreatePlaylistProgress: (callback: Function) => {
      const sub = (_e: any, p: any) => callback(p);
      ipcRenderer.on(IPC_CHANNELS.CREATE_PLAYLIST_PROGRESS, sub);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CREATE_PLAYLIST_PROGRESS, sub);
    },
    getTracksFromAlbums: (albumIds: string[]) => ipcRenderer.invoke(IPC_CHANNELS.GET_TRACKS_FROM_ALBUMS, albumIds),
    createPlaylistFromTracks: (request: any) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_PLAYLIST_FROM_TRACKS, request),
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    onError: (callback: Function) => {
      const sub = (_e: any, err: any) => callback(err);
      ipcRenderer.on(IPC_CHANNELS.APP_ERROR, sub);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_ERROR, sub);
    },
  });
  
  console.log('=== PRELOAD SCRIPT COMPLETED SUCCESSFULLY ===');
  console.log('electronAPI exposed on window');
} catch (error) {
  console.error('=== PRELOAD SCRIPT FAILED ===');
  console.error(error);
}
