import ElectronStore from 'electron-store';
import axios from 'axios';
import { BrowserWindow } from 'electron';
import * as http from 'http';
import * as url from 'url';
import type { AuthTokens, AppConfig } from '../../shared/types';
import { SPOTIFY_ACCOUNTS_BASE_URL, SPOTIFY_SCOPES } from '../../shared/constants';

interface StoreSchema {
  tokens: AuthTokens | null;
  config: AppConfig | null;
}

export class AuthService {
  private store: ElectronStore<StoreSchema>;
  private config: AppConfig;

  constructor() {
    this.store = new ElectronStore<StoreSchema>({
      defaults: {
        tokens: null,
        config: null,
      },
    });

    // Always load config from environment variables (not from cache)
    this.config = {
      clientId: process.env.SPOTIFY_CLIENT_ID || '',
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
      redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:8888/callback',
    };

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        'Missing Spotify credentials. Please create a .env file (see .env.example) or set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables.'
      );
    }

    // Clear old stored config and tokens when credentials change
    const storedConfig = this.store.get('config');
    if (storedConfig && storedConfig.clientId !== this.config.clientId) {
      console.log('New credentials detected - clearing old tokens and config');
      this.store.clear();
    }
    
    this.store.set('config', this.config);
  }

  async authenticate(): Promise<AuthTokens> {
    return new Promise((resolve, reject) => {
      let isResolved = false;
      
      // Create authorization URL
      const authUrl = this.buildAuthUrl();
      
      // Create a temporary HTTP server to handle the callback
      const server = http.createServer(async (req, res) => {
        if (!req.url || isResolved) return;
        
        const parsedUrl = url.parse(req.url, true);
        
        if (parsedUrl.pathname === '/callback') {
          const code = parsedUrl.query.code as string;
          const error = parsedUrl.query.error as string;
          
          if (error) {
            isResolved = true;
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Authentication Failed</h1><p>You can close this window.</p></body></html>');
            server.close();
            authWindow?.close();
            reject(new Error(`Authentication failed: ${error}`));
            return;
          }
          
          if (code) {
            try {
              const tokens = await this.exchangeCodeForTokens(code);
              this.storeTokens(tokens);
              
              isResolved = true;
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to the app.</p></body></html>');
              
              server.close();
              authWindow?.close();
              resolve(tokens);
            } catch (error) {
              isResolved = true;
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<html><body><h1>Authentication Error</h1><p>Failed to exchange code for tokens.</p></body></html>');
              server.close();
              authWindow?.close();
              reject(error);
            }
          }
        }
      });
      
      // Start server on port 8888
      server.listen(8888, '127.0.0.1', () => {
        console.log('Auth callback server listening on http://127.0.0.1:8888');
      });
      
      server.on('error', (error) => {
        console.error('Auth server error:', error);
        if (!isResolved) {
          isResolved = true;
          reject(new Error('Failed to start authentication server'));
        }
      });

      // Create a new window for authentication
      let authWindow: BrowserWindow | null = new BrowserWindow({
        width: 500,
        height: 700,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      authWindow.loadURL(authUrl);
      authWindow.show();

      authWindow.on('closed', () => {
        if (!isResolved) {
          isResolved = true;
          server.close();
          reject(new Error('Authentication window closed'));
        }
        authWindow = null;
      });
    });
  }

  private buildAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: SPOTIFY_SCOPES,
      show_dialog: 'true',
    });

    return `${SPOTIFY_ACCOUNTS_BASE_URL}/authorize?${params.toString()}`;
  }

  private async exchangeCodeForTokens(code: string): Promise<AuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
    });

    const authHeader = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await axios.post(
      `${SPOTIFY_ACCOUNTS_BASE_URL}/api/token`,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authHeader}`,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    return {
      access_token,
      refresh_token,
      expires_at: Date.now() + expires_in * 1000,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const authHeader = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await axios.post(
      `${SPOTIFY_ACCOUNTS_BASE_URL}/api/token`,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authHeader}`,
        },
      }
    );

    const { access_token, expires_in } = response.data;

    return {
      access_token,
      refresh_token: refreshToken, // Reuse the same refresh token
      expires_at: Date.now() + expires_in * 1000,
    };
  }

  storeTokens(tokens: AuthTokens): void {
    this.store.set('tokens', tokens);
  }

  getStoredTokens(): AuthTokens | null {
    return this.store.get('tokens');
  }

  clearTokens(): void {
    this.store.set('tokens', null);
  }

  isTokenExpired(tokens: AuthTokens): boolean {
    return Date.now() >= tokens.expires_at - 60000; // Refresh 1 minute before expiry
  }
}
