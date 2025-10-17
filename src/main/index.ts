import dotenv from 'dotenv';
import { app, BrowserWindow, ipcMain, shell, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import { SpotifyService } from './services/SpotifyService';
import { AuthService } from './services/AuthService';
import { IPC_CHANNELS, ProgressUpdate } from '../shared/types';
import type {
  AnalyzePlaylistRequest,
  FollowArtistsRequest,
  ScanReleasesRequest,
  CreatePlaylistRequest,
} from '../shared/types';

// Load environment variables
dotenv.config();

let mainWindow: BrowserWindow | null = null;
let spotifyService: SpotifyService | null = null;
let authService: AuthService;

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload-simple.js');
  console.log('Preload path:', preloadPath);
  console.log('__dirname:', __dirname);
  console.log('Preload exists:', require('fs').existsSync(preloadPath));
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
    title: 'Spotify Release Hub',
    show: false,
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });
}

// Initialize services
authService = new AuthService();

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle(IPC_CHANNELS.AUTH_START, async () => {
  try {
    const tokens = await authService.authenticate();
    spotifyService = new SpotifyService(tokens);
    return { success: true };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle(IPC_CHANNELS.AUTH_CHECK, async () => {
  try {
    const tokens = authService.getStoredTokens();
    if (tokens) {
      spotifyService = new SpotifyService(tokens);
      return { authenticated: true };
    }
    return { authenticated: false };
  } catch (error) {
    return { authenticated: false };
  }
});

ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
  authService.clearTokens();
  spotifyService = null;
  return { success: true };
});

ipcMain.handle(IPC_CHANNELS.ANALYZE_PLAYLIST, async (_event: IpcMainInvokeEvent, request: AnalyzePlaylistRequest) => {
  try {
    if (!spotifyService) {
      throw new Error('Not authenticated');
    }

    const result = await spotifyService.analyzePlaylist(
      request.playlistUrl,
      (progress: ProgressUpdate) => {
        mainWindow?.webContents.send(IPC_CHANNELS.ANALYZE_PLAYLIST_PROGRESS, progress);
      }
    );

    return { success: true, data: result };
  } catch (error) {
    console.error('Analyze playlist error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle(IPC_CHANNELS.FOLLOW_ARTISTS, async (_event: IpcMainInvokeEvent, request: FollowArtistsRequest) => {
  try {
    if (!spotifyService) {
      throw new Error('Not authenticated');
    }

    const result = await spotifyService.followArtistsBulk(
      request.artistIds,
      (progress: ProgressUpdate) => {
        mainWindow?.webContents.send(IPC_CHANNELS.FOLLOW_ARTISTS_PROGRESS, progress);
      }
    );

    return { success: true, data: result };
  } catch (error) {
    console.error('Follow artists error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle(IPC_CHANNELS.SCAN_RELEASES, async (_event: IpcMainInvokeEvent, request: ScanReleasesRequest) => {
  try {
    if (!spotifyService) {
      throw new Error('Not authenticated');
    }

    const result = await spotifyService.scanRecentReleases(
      request.daysBack,
      request.maxArtists,
      (progress: ProgressUpdate) => {
        mainWindow?.webContents.send(IPC_CHANNELS.SCAN_RELEASES_PROGRESS, progress);
      }
    );

    return { success: true, data: result };
  } catch (error) {
    console.error('Scan releases error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle(IPC_CHANNELS.CREATE_PLAYLIST, async (_event: IpcMainInvokeEvent, request: CreatePlaylistRequest) => {
  try {
    if (!spotifyService) {
      throw new Error('Not authenticated');
    }

    const result = await spotifyService.createPlaylistFromReleases(
      request.playlistName,
      request.releases,
      request.isPublic,
      (progress: ProgressUpdate) => {
        mainWindow?.webContents.send(IPC_CHANNELS.CREATE_PLAYLIST_PROGRESS, progress);
      }
    );

    return { success: true, data: result };
  } catch (error) {
    console.error('Create playlist error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Get tracks from albums
ipcMain.handle(IPC_CHANNELS.GET_TRACKS_FROM_ALBUMS, async (_event: IpcMainInvokeEvent, albumIds: string[]) => {
  try {
    if (!spotifyService) {
      throw new Error('Not authenticated');
    }

    console.log('[IPC] Getting tracks from albums:', albumIds.length);

    const tracks = await spotifyService.getTracksFromAlbums(albumIds, (progress: ProgressUpdate) => {
      mainWindow?.webContents.send(IPC_CHANNELS.SCAN_RELEASES_PROGRESS, progress);
    });

    return { success: true, data: tracks };
  } catch (error) {
    console.error('Get tracks error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Create playlist from track URIs
ipcMain.handle(IPC_CHANNELS.CREATE_PLAYLIST_FROM_TRACKS, async (_event: IpcMainInvokeEvent, request: any) => {
  try {
    if (!spotifyService) {
      throw new Error('Not authenticated');
    }

    console.log('[IPC] Creating playlist from tracks:', request.trackUris.length);

    const result = await spotifyService.createPlaylistFromTracks(
      request.playlistName,
      request.trackUris,
      request.isPublic || false,
      (progress: ProgressUpdate) => {
        mainWindow?.webContents.send(IPC_CHANNELS.CREATE_PLAYLIST_PROGRESS, progress);
      }
    );

    return { success: true, data: result };
  } catch (error) {
    console.error('Create playlist from tracks error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Handle opening external URLs
ipcMain.handle('shell:open-external', async (_event: IpcMainInvokeEvent, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external URL:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception:', error);
  mainWindow?.webContents.send(IPC_CHANNELS.ERROR, {
    message: error.message,
  });
});
