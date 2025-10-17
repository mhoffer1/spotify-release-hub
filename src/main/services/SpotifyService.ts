import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  AuthTokens,
  SpotifyArtist,
  SpotifyTrack,
  UnfollowedArtist,
  ReleaseWithArtist,
  AnalyzePlaylistResponse,
  FollowArtistsResponse,
  ScanReleasesResponse,
  CreatePlaylistResponse,
  ProgressUpdate,
} from '../../shared/types';
import {
  SPOTIFY_API_BASE_URL,
  DEFAULT_DELAY_MS,
  RATE_LIMIT_RETRY_DEFAULT,
  CHUNK_SIZE_FOLLOW,
  CHUNK_SIZE_PLAYLIST_ADD,
} from '../../shared/constants';

export class SpotifyService {
  private api: AxiosInstance;

  constructor(tokens: AuthTokens) {
    this.api = axios.create({
      baseURL: SPOTIFY_API_BASE_URL,
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
      timeout: 30000,
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async handleRateLimit(error: AxiosError): Promise<number> {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const waitTime = retryAfter ? parseInt(retryAfter) : RATE_LIMIT_RETRY_DEFAULT;
      console.log(`Rate limited. Waiting ${waitTime} seconds...`);
      await this.delay((waitTime + 1) * 1000);
      return waitTime;
    }
    throw error;
  }

  private async apiCallWithRetry<T>(
    apiCall: () => Promise<T>,
    maxRetries = 5
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.delay(DEFAULT_DELAY_MS);
        return await apiCall();
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          await this.handleRateLimit(error);
          continue;
        }
        
        if (attempt === maxRetries - 1) {
          throw error;
        }
        
        // Exponential backoff for other errors
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`API call failed, retrying in ${waitTime}ms...`);
        await this.delay(waitTime);
      }
    }
    throw new Error('Max retries exceeded');
  }

  private extractPlaylistId(playlistUrl: string): string {
    // Extract playlist ID from various URL formats
    const match = playlistUrl.match(/playlist[\/:]([a-zA-Z0-9]+)/);
    if (match && match[1]) {
      return match[1];
    }
    // If it's already just an ID
    if (/^[a-zA-Z0-9]+$/.test(playlistUrl)) {
      return playlistUrl;
    }
    throw new Error('Invalid playlist URL or ID');
  }

  async analyzePlaylist(
    playlistUrl: string,
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<AnalyzePlaylistResponse> {
    const playlistId = this.extractPlaylistId(playlistUrl);

    // Get playlist info
    onProgress?.({ current: 0, total: 4, message: 'Fetching playlist info...' });
    const playlistInfo = await this.apiCallWithRetry(() =>
      this.api.get(`/playlists/${playlistId}`, {
        params: { fields: 'name,owner(display_name)' },
      })
    );

    const playlistName = playlistInfo.data.name;
    const playlistOwner = playlistInfo.data.owner.display_name;

    // OPTIMIZATION: Fetch playlist artists and followed artists in parallel
    onProgress?.({ current: 1, total: 4, message: 'Fetching data...' });
    const [playlistArtists, followedArtistIds] = await Promise.all([
      this.getPlaylistArtists(playlistId),
      this.getFollowedArtistIds(),
    ]);

    // Get artist frequency in playlist
    onProgress?.({ current: 3, total: 4, message: 'Analyzing artists...' });
    const artistFrequency = await this.getArtistFrequency(playlistId);

    // Find unfollowed artists
    const unfollowedArtists: UnfollowedArtist[] = [];
    for (const [artistId, artist] of Object.entries(playlistArtists)) {
      if (!followedArtistIds.has(artistId)) {
        unfollowedArtists.push({
          ...artist,
          frequency: artistFrequency[artistId] || 0,
        });
      }
    }

    // Sort by frequency (descending) then by name
    unfollowedArtists.sort((a, b) => {
      if (b.frequency !== a.frequency) {
        return b.frequency - a.frequency;
      }
      return a.name.localeCompare(b.name);
    });

    onProgress?.({ current: 4, total: 4, message: 'Analysis complete!' });

    return {
      playlistName,
      playlistOwner,
      unfollowedArtists,
    };
  }

  private async getPlaylistArtists(playlistId: string): Promise<Record<string, SpotifyArtist>> {
    const artists: Record<string, SpotifyArtist> = {};
    let offset = 0;
    const limit = 100;

    // First, collect all unique artist IDs
    while (true) {
      const response = await this.apiCallWithRetry(() =>
        this.api.get(`/playlists/${playlistId}/tracks`, {
          params: { offset, limit, fields: 'items(track(artists(id,name,external_urls))),next' },
        })
      );

      const items = response.data.items;
      for (const item of items) {
        if (item.track?.artists) {
          for (const artist of item.track.artists) {
            if (!artists[artist.id]) {
              artists[artist.id] = {
                id: artist.id,
                name: artist.name,
                external_urls: artist.external_urls,
              };
            }
          }
        }
      }

      if (!response.data.next) break;
      offset += limit;
    }

    // Now fetch full artist details in batches of 50 (API limit)
    const artistIds = Object.keys(artists);
    console.log(`[SpotifyService] Fetching details for ${artistIds.length} artists...`);
    
    for (let i = 0; i < artistIds.length; i += 50) {
      const batch = artistIds.slice(i, i + 50);
      const response = await this.apiCallWithRetry(() =>
        this.api.get('/artists', {
          params: { ids: batch.join(',') },
        })
      );

      // Update artists with images
      for (const fullArtist of response.data.artists) {
        if (fullArtist && artists[fullArtist.id]) {
          artists[fullArtist.id].images = fullArtist.images;
        }
      }
    }

    return artists;
  }

  private async getFollowedArtistIds(): Promise<Set<string>> {
    const artistIds = new Set<string>();
    let after: string | undefined;

    while (true) {
      const response = await this.apiCallWithRetry(() =>
        this.api.get('/me/following', {
          params: { type: 'artist', limit: 50, after },
        })
      );

      const artists = response.data.artists.items;
      for (const artist of artists) {
        artistIds.add(artist.id);
      }

      if (!response.data.artists.next) break;
      after = response.data.artists.cursors.after;
    }

    return artistIds;
  }

  private async getFollowedArtists(): Promise<SpotifyArtist[]> {
    const artists: SpotifyArtist[] = [];
    let after: string | undefined;

    while (true) {
      const response = await this.apiCallWithRetry(() =>
        this.api.get('/me/following', {
          params: { type: 'artist', limit: 50, after },
        })
      );

      artists.push(...response.data.artists.items);

      if (!response.data.artists.next) break;
      after = response.data.artists.cursors.after;
    }

    return artists;
  }

  private async getArtistFrequency(playlistId: string): Promise<Record<string, number>> {
    const frequency: Record<string, number> = {};
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await this.apiCallWithRetry(() =>
        this.api.get(`/playlists/${playlistId}/tracks`, {
          params: { offset, limit, fields: 'items(track(artists)),next' },
        })
      );

      const items = response.data.items;
      for (const item of items) {
        if (item.track?.artists) {
          for (const artist of item.track.artists) {
            frequency[artist.id] = (frequency[artist.id] || 0) + 1;
          }
        }
      }

      if (!response.data.next) break;
      offset += limit;
    }

    return frequency;
  }

  async followArtistsBulk(
    artistIds: string[],
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<FollowArtistsResponse> {
    let followedCount = 0;
    const failedArtists: string[] = [];
    const totalChunks = Math.ceil(artistIds.length / CHUNK_SIZE_FOLLOW);

    for (let i = 0; i < artistIds.length; i += CHUNK_SIZE_FOLLOW) {
      const chunk = artistIds.slice(i, i + CHUNK_SIZE_FOLLOW);
      const chunkNum = Math.floor(i / CHUNK_SIZE_FOLLOW) + 1;

      onProgress?.({
        current: chunkNum,
        total: totalChunks,
        message: `Following artists (chunk ${chunkNum}/${totalChunks})...`,
      });

      try {
        await this.apiCallWithRetry(() =>
          this.api.put('/me/following', null, {
            params: { type: 'artist', ids: chunk.join(',') },
          })
        );
        followedCount += chunk.length;
      } catch (error) {
        console.error('Failed to follow chunk:', error);
        failedArtists.push(...chunk);
      }

      // Add delay between chunks
      if (i + CHUNK_SIZE_FOLLOW < artistIds.length) {
        await this.delay(2000);
      }
    }

    return {
      followedCount,
      failedCount: failedArtists.length,
      failedArtists,
    };
  }

  async scanRecentReleases(
    daysBack: number,
    maxArtists?: number,
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<ScanReleasesResponse> {
    // Calculate the date threshold
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    // Get followed artists
    onProgress?.({ current: 0, total: 1, message: 'Fetching followed artists...' });
    const artists = await this.getFollowedArtists();

    console.log('[SpotifyService] scanForNewReleases params:', { 
      daysBack, 
      maxArtists, 
      totalFollowedArtists: artists.length 
    });

    const artistsToCheck = maxArtists && maxArtists > 0 ? artists.slice(0, maxArtists) : artists;
    
    console.log('[SpotifyService] Checking releases for:', {
      requestedMax: maxArtists,
      actualArtistsToCheck: artistsToCheck.length,
      isLimited: maxArtists !== undefined && maxArtists > 0
    });

    const releases: ReleaseWithArtist[] = [];
    const seenAlbumIds = new Set<string>();

    const startTime = Date.now();
    
    // OPTIMIZATION: Process artists in parallel batches (5 at a time to avoid rate limits)
    const batchSize = 5;
    
    for (let batchStart = 0; batchStart < artistsToCheck.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, artistsToCheck.length);
      const batch = artistsToCheck.slice(batchStart, batchEnd);
      
      // Calculate progress and ETA
      const progress = batchEnd;
      const elapsed = Date.now() - startTime;
      const avgTimePerArtist = elapsed / Math.max(1, batchEnd);
      const remaining = artistsToCheck.length - progress;
      const etaMinutes = (remaining * avgTimePerArtist) / 60000;

      onProgress?.({
        current: progress,
        total: artistsToCheck.length,
        message: `Checking ${batch.map(a => a.name).join(', ')}... (ETA: ${etaMinutes.toFixed(1)}m)`,
      });

      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(artist =>
          this.getRecentReleasesForArtist(artist.id, artist.name, sinceDate)
        )
      );

      // Collect successful results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          for (const release of result.value) {
            if (!seenAlbumIds.has(release.id)) {
              seenAlbumIds.add(release.id);
              releases.push(release);
            }
          }
        } else {
          console.error('Error fetching releases:', result.reason);
        }
      }
    }

    // Sort by release date (descending)
    releases.sort((a, b) => {
      return new Date(b.release_date).getTime() - new Date(a.release_date).getTime();
    });

    return {
      releases,
      totalArtistsChecked: artistsToCheck.length,
    };
  }

  private async getRecentReleasesForArtist(
    artistId: string,
    artistName: string,
    sinceDate: Date
  ): Promise<ReleaseWithArtist[]> {
    const releases: ReleaseWithArtist[] = [];
    const albumTypes = ['album', 'single'];

    for (const albumType of albumTypes) {
      let offset = 0;
      const limit = 20;
      let shouldContinue = true;

      // Only check first 2 pages per type
      for (let page = 0; page < 2 && shouldContinue; page++) {
        const response = await this.apiCallWithRetry(() =>
          this.api.get(`/artists/${artistId}/albums`, {
            params: {
              include_groups: albumType,
              limit,
              offset,
              market: 'US',
            },
          })
        );

        const items = response.data.items;

        for (const album of items) {
          const releaseDate = this.parseReleaseDate(
            album.release_date,
            album.release_date_precision
          );

          if (releaseDate && releaseDate >= sinceDate) {
            releases.push({
              ...album,
              artist_name: artistName,
            });
          }

          // Check if last item is too old
          if (items.indexOf(album) === items.length - 1) {
            const lastDate = this.parseReleaseDate(
              album.release_date,
              album.release_date_precision
            );
            if (lastDate && lastDate < sinceDate) {
              shouldContinue = false;
            }
          }
        }

        if (!response.data.next) {
          shouldContinue = false;
        }

        offset += limit;
      }
    }

    return releases;
  }

  private parseReleaseDate(dateStr: string, precision: string): Date | null {
    try {
      if (precision === 'day') {
        return new Date(dateStr);
      }
      return null; // Can't reliably compare month/year precision for "last N days"
    } catch {
      return null;
    }
  }

  async createPlaylistFromReleases(
    playlistName: string,
    releases: ReleaseWithArtist[],
    isPublic: boolean,
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<CreatePlaylistResponse> {
    // Get current user
    onProgress?.({ current: 0, total: 3, message: 'Getting user info...' });
    const userResponse = await this.apiCallWithRetry(() => this.api.get('/me'));
    const userId = userResponse.data.id;

    // Create playlist
    onProgress?.({ current: 1, total: 3, message: 'Creating playlist...' });
    const description = `Tracks from recent releases (last ${releases.length} releases) - Created by Spotify Release Hub`;
    
    const playlistResponse = await this.apiCallWithRetry(() =>
      this.api.post(`/users/${userId}/playlists`, {
        name: playlistName,
        public: isPublic,
        description,
      })
    );

    const playlistId = playlistResponse.data.id;
    const playlistUrl = playlistResponse.data.external_urls.spotify;

    // Collect all track IDs
    onProgress?.({ current: 2, total: 3, message: 'Collecting tracks from albums...' });
    const trackIds: string[] = [];

    for (const release of releases) {
      const albumTracks = await this.getAlbumTracks(release.id);
      trackIds.push(...albumTracks);
    }

    // Add tracks in chunks
    onProgress?.({ current: 3, total: 3, message: 'Adding tracks to playlist...' });
    for (let i = 0; i < trackIds.length; i += CHUNK_SIZE_PLAYLIST_ADD) {
      const chunk = trackIds.slice(i, i + CHUNK_SIZE_PLAYLIST_ADD);
      const uris = chunk.map((id) => `spotify:track:${id}`);

      await this.apiCallWithRetry(() =>
        this.api.post(`/playlists/${playlistId}/tracks`, {
          uris,
        })
      );
    }

    return {
      playlistUrl,
      playlistId,
      tracksAdded: trackIds.length,
    };
  }

  private async getAlbumTracks(albumId: string): Promise<string[]> {
    const trackIds: string[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const response = await this.apiCallWithRetry(() =>
        this.api.get(`/albums/${albumId}/tracks`, {
          params: { offset, limit, market: 'US' },
        })
      );

      const items = response.data.items;
      for (const track of items) {
        if (track.id) {
          trackIds.push(track.id);
        }
      }

      if (!response.data.next) break;
      offset += limit;
    }

    return trackIds;
  }

  async getTracksFromAlbums(
    albumIds: string[],
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<SpotifyTrack[]> {
    const allTracks: SpotifyTrack[] = [];
    
    console.log(`[SpotifyService] Fetching tracks from ${albumIds.length} albums...`);

    for (let i = 0; i < albumIds.length; i++) {
      const albumId = albumIds[i];
      
      onProgress?.({
        current: i + 1,
        total: albumIds.length,
        message: `Fetching tracks from album ${i + 1}/${albumIds.length}...`,
      });

      try {
        let offset = 0;
        const limit = 50;

        while (true) {
          const response = await this.apiCallWithRetry(() =>
            this.api.get(`/albums/${albumId}/tracks`, {
              params: { offset, limit, market: 'US' },
            })
          );

          const tracks = response.data.items;
          
          // Fetch full track details to get preview_url and complete info
          for (const track of tracks) {
            if (track.id) {
              const fullTrack = await this.apiCallWithRetry(() =>
                this.api.get(`/tracks/${track.id}`, {
                  params: { market: 'US' },
                })
              );
              
              allTracks.push({
                id: fullTrack.data.id,
                name: fullTrack.data.name,
                artists: fullTrack.data.artists,
                album: fullTrack.data.album,
                duration_ms: fullTrack.data.duration_ms,
                external_urls: fullTrack.data.external_urls,
                preview_url: fullTrack.data.preview_url,
                uri: fullTrack.data.uri,
              } as SpotifyTrack & { preview_url: string | null; uri: string });
            }
          }

          if (!response.data.next) break;
          offset += limit;
        }
      } catch (error) {
        console.error(`Error fetching tracks for album ${albumId}:`, error);
      }
    }

    console.log(`[SpotifyService] Fetched ${allTracks.length} tracks total`);
    return allTracks;
  }

  async createPlaylistFromTracks(
    playlistName: string,
    trackUris: string[],
    isPublic: boolean,
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<{ playlistUrl: string; playlistId: string; tracksAdded: number }> {
    console.log(`[SpotifyService] Creating playlist "${playlistName}" with ${trackUris.length} tracks...`);

    // Get current user
    onProgress?.({ current: 0, total: 3, message: 'Getting user info...' });
    const userResponse = await this.apiCallWithRetry(() =>
      this.api.get('/me')
    );
    const userId = userResponse.data.id;

    // Create playlist
    onProgress?.({ current: 1, total: 3, message: 'Creating playlist...' });
    const playlistResponse = await this.apiCallWithRetry(() =>
      this.api.post(`/users/${userId}/playlists`, {
        name: playlistName,
        description: `Created by Spotify Release Hub on ${new Date().toLocaleDateString()}`,
        public: isPublic,
      })
    );

    const playlistId = playlistResponse.data.id;
    const playlistUrl = playlistResponse.data.external_urls.spotify;

    // Add tracks in chunks
    onProgress?.({ current: 2, total: 3, message: 'Adding tracks to playlist...' });
    const chunkSize = 100;
    let tracksAdded = 0;

    for (let i = 0; i < trackUris.length; i += chunkSize) {
      const chunk = trackUris.slice(i, i + chunkSize);
      
      await this.apiCallWithRetry(() =>
        this.api.post(`/playlists/${playlistId}/tracks`, {
          uris: chunk,
        })
      );

      tracksAdded += chunk.length;
      
      onProgress?.({
        current: 2,
        total: 3,
        message: `Added ${tracksAdded}/${trackUris.length} tracks...`,
      });
    }

    onProgress?.({ current: 3, total: 3, message: 'Playlist created!' });

    return { playlistUrl, playlistId, tracksAdded };
  }
}
