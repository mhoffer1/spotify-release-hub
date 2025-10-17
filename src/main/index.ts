import dotenv from 'dotenv';
import fs from 'fs';
import { app, BrowserWindow, ipcMain, shell, IpcMainInvokeEvent, dialog } from 'electron';
import * as path from 'path';
import { SpotifyService } from './services/SpotifyService';
import { AuthService } from './services/AuthService';
import {
  IPC_CHANNELS,
  ProgressUpdate,
  UpdateInfoPayload,
  UpdateErrorPayload,
  UpdateCheckOptions,
} from '../shared/types';
import type {
  AnalyzePlaylistRequest,
  FollowArtistsRequest,
  ScanReleasesRequest,
  CreatePlaylistRequest,
} from '../shared/types';
import { autoUpdater, UpdateInfo } from 'electron-updater';

// Load environment variables with support for packaged builds
function loadEnvironmentVariables() {
  const candidates = new Set<string>();

  // Development paths
  candidates.add(path.resolve(process.cwd(), '.env'));
  candidates.add(path.resolve(__dirname, '../../.env'));

  // Packaged application paths
  candidates.add(path.join(process.resourcesPath, '.env'));
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    candidates.add(path.join(process.env.PORTABLE_EXECUTABLE_DIR, '.env'));
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const result = dotenv.config({ path: candidate, override: true });
        if (!result.error) {
          console.log(`[env] Loaded environment variables from ${candidate}`);
          return;
        }
      }
    } catch (error) {
      console.warn(`[env] Failed to load ${candidate}:`, error);
    }
  }

  // Fallback to default .env loading
  dotenv.config();
  console.log('[env] Loaded environment variables using default resolution');
}

loadEnvironmentVariables();

autoUpdater.logger = console;

let mainWindow: BrowserWindow | null = null;
let spotifyService: SpotifyService | null = null;
let authService: AuthService | null = null;
let startupError: Error | null = null;

// Update checking configuration
const updateConfig = {
  owner: process.env.GITHUB_UPDATES_OWNER || process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_UPDATES_REPO || process.env.GITHUB_REPO,
  apiBaseUrl: process.env.GITHUB_API_BASE_URL || 'https://api.github.com',
  personalAccessToken: process.env.GITHUB_UPDATES_TOKEN || process.env.GITHUB_TOKEN,
};

type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

function sendToRenderer(channel: IpcChannel, payload: unknown) {
  if (!mainWindow) return;
  mainWindow.webContents.send(channel, payload);
}

async function checkForUpdates(triggeredByUser = false) {
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  } else {
    if (triggeredByUser) {
      sendToRenderer(IPC_CHANNELS.UPDATES_ERROR, {
        message: 'Auto-updates are only available in the packaged application.',
      } satisfies UpdateErrorPayload);
    }
  }
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');

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

  mainWindow.webContents.once('did-finish-load', () => {
    if (startupError) {
      sendToRenderer(IPC_CHANNELS.ERROR, { message: startupError.message });
    }
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
try {
  authService = new AuthService();
} catch (error) {
  startupError = error instanceof Error ? error : new Error('Failed to initialize AuthService');
  console.error('[startup] Failed to initialize authentication service:', startupError);
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  if (startupError) {
    dialog.showErrorBox('Configuration error', startupError.message);
  }

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 1000 * 60 * 60 * 6); // Check every 6 hours
  }

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

app.on('before-quit', () => {
  // No need to clear interval as it's not set anymore
});

autoUpdater.on('update-available', (info: UpdateInfo) => {
  sendToRenderer(IPC_CHANNELS.UPDATES_AVAILABLE, {
    version: info.version,
    releaseNotes: info.releaseNotes,
    publishedAt: info.releaseDate,
    url: `https://github.com/${updateConfig.owner}/${updateConfig.repo}/releases/latest`,
  } as UpdateInfoPayload);
});

autoUpdater.on('update-not-available', () => {
  sendToRenderer(IPC_CHANNELS.UPDATES_NOT_AVAILABLE, {});
});

autoUpdater.on('error', (err: Error) => {
  sendToRenderer(IPC_CHANNELS.UPDATES_ERROR, {
    message: err.message,
  } as UpdateErrorPayload);
});

autoUpdater.on('download-progress', () => {
  // This can be used to show a download progress bar
});

autoUpdater.on('update-downloaded', () => {
  // Prompt the user to restart the app
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'A new version has been downloaded. Restart the application to apply the updates.',
      buttons: ['Restart', 'Later'],
    })
    .then((buttonIndex) => {
      if (buttonIndex.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});

// IPC Handlers
ipcMain.handle(IPC_CHANNELS.AUTH_START, async () => {
  try {
    if (startupError) {
      throw startupError;
    }

    if (!authService) {
      throw new Error('Authentication service not available');
    }

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
    if (!authService) {
      throw new Error('Authentication service not available');
    }

    const tokens = authService.getStoredTokens();
    if (tokens) {
      spotifyService = new SpotifyService(tokens);
      return { authenticated: true };
    }
    return { authenticated: false };
  } catch (error) {
    if (startupError) {
      return { authenticated: false, error: startupError.message };
    }
    return { authenticated: false };
  }
});

ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
  if (authService) {
    authService.clearTokens();
  }
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

ipcMain.handle(IPC_CHANNELS.UPDATES_CHECK, async (_event, options: UpdateCheckOptions = {}) => {
  checkForUpdates(!options.silent);
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
