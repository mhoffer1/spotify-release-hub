import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import type {
  AnalyzePlaylistResponse,
  AuthTokens,
  CreatePlaylistResponse,
  FollowArtistsResponse,
  ProgressUpdate,
  ReleaseWithArtist,
  ScanReleasesResponse,
  SpotifyArtist,
  UnfollowedArtist,
} from '../../shared/types';
import {
  CHUNK_SIZE_FOLLOW,
  CHUNK_SIZE_PLAYLIST_ADD,
  DEFAULT_DELAY_MS,
  MAX_DYNAMIC_DELAY_MS,
  MAX_RATE_LIMIT_WAIT_SECONDS,
  MAX_REQUESTS_PER_INTERVAL,
  RATE_LIMIT_RETRY_DEFAULT,
  REQUEST_INTERVAL_MS,
  SPOTIFY_API_BASE_URL,
} from '../../shared/constants';
import { AuthService } from './AuthService';

const CACHE_TTL_FOLLOWED_ARTISTS_MS = 1000 * 60 * 60 * 4; // 4 hours
const CACHE_TTL_ARTIST_DETAILS_MS = 1000 * 60 * 60 * 6; // 6 hours
const CACHE_TTL_FOLLOW_STATUS_MS = 1000 * 60 * 60 * 2; // 2 hours
const CACHE_TTL_PLAYLIST_ANALYSIS_MS = 1000 * 60 * 10; // 10 minutes
const CACHE_TTL_RELATED_ARTISTS_MS = 1000 * 60 * 60 * 3; // 3 hours

type AlbumTracksSummary = {
  items: Array<{ id: string | null }>;
  next?: string | null;
  total: number;
};

type AlbumWithTracks = {
  id: string;
  name?: string;
  tracks?: AlbumTracksSummary;
};

export class SpotifyService {
  private api: AxiosInstance;

  private tokens: AuthTokens;

  private tokenRefreshPromise: Promise<AuthTokens | null> | null = null;

  private authService: AuthService;

  private requestTimestamps: number[] = [];

  private currentDelayMs = DEFAULT_DELAY_MS;

  private albumTrackCache = new Map<string, string[]>();

  private followedArtistsCache: { timestamp: number; artists: SpotifyArtist[] } | null = null;

  private followedArtistsCacheByLimit = new Map<
    number,
    { timestamp: number; artists: SpotifyArtist[] }
  >();

  private artistDetailsCache = new Map<string, { artist: SpotifyArtist; timestamp: number }>();

  private followStatusCache = new Map<string, { isFollowed: boolean; timestamp: number }>();

  private relatedArtistsCache = new Map<string, { artists: SpotifyArtist[]; timestamp: number }>();

  private playlistAnalysisCache = new Map<
    string,
    { response: AnalyzePlaylistResponse; timestamp: number }
  >();

  constructor(tokens: AuthTokens, authService: AuthService) {
    this.tokens = tokens;
    this.authService = authService;
    this.api = axios.create({
      baseURL: SPOTIFY_API_BASE_URL,
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
      timeout: 60000,
    });

    this.api.interceptors.request.use((config) => this.injectAuthorization(config));
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => this.handleUnauthorized(error)
    );
  }

  private injectAuthorization(
    config: InternalAxiosRequestConfig
  ): InternalAxiosRequestConfig {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${this.tokens.access_token}`;
    return config;
  }

  private async handleUnauthorized(error: unknown): Promise<AxiosResponse | never> {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      throw error;
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    if (originalRequest._retry) {
      throw error;
    }
    originalRequest._retry = true;

    const refreshed = await this.refreshAccessToken();
    if (!refreshed) {
      throw error;
    }

    originalRequest.headers = originalRequest.headers ?? {};
    originalRequest.headers.Authorization = `Bearer ${refreshed.access_token}`;

    return this.api(originalRequest);
  }

  private async refreshAccessToken(): Promise<AuthTokens | null> {
    if (!this.tokens.refresh_token) {
      return null;
    }

    if (!this.tokenRefreshPromise) {
      this.tokenRefreshPromise = this.authService
        .refreshAccessToken(this.tokens.refresh_token)
        .then((newTokens) => {
          this.setTokens(newTokens);
          this.authService.storeTokens(newTokens);
          return newTokens;
        })
        .catch((refreshError) => {
          console.error('[auth] Failed to refresh access token:', refreshError);
          return null;
        })
        .finally(() => {
          this.tokenRefreshPromise = null;
        });
    }

    return this.tokenRefreshPromise;
  }

  setTokens(tokens: AuthTokens) {
    this.tokens = tokens;
    this.api.defaults.headers.common.Authorization = `Bearer ${tokens.access_token}`;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isCacheEntryValid(timestamp: number, ttlMs: number): boolean {
    return Date.now() - timestamp < ttlMs;
  }

  private cloneArtist(artist: SpotifyArtist): SpotifyArtist {
    return {
      ...artist,
      images: artist.images?.map((image) => ({ ...image })),
      external_urls: artist.external_urls ? { ...artist.external_urls } : undefined,
    };
  }

  private getCachedArtistDetails(artistId: string): SpotifyArtist | null {
    const cached = this.artistDetailsCache.get(artistId);
    if (!cached) {
      return null;
    }

    if (!this.isCacheEntryValid(cached.timestamp, CACHE_TTL_ARTIST_DETAILS_MS)) {
      this.artistDetailsCache.delete(artistId);
      return null;
    }

    return this.cloneArtist(cached.artist);
  }

  private setArtistDetailsCache(artist: SpotifyArtist): void {
    this.artistDetailsCache.set(artist.id, {
      artist: this.cloneArtist(artist),
      timestamp: Date.now(),
    });
  }

  private getCachedRelatedArtists(artistId: string): SpotifyArtist[] | null {
    const cached = this.relatedArtistsCache.get(artistId);
    if (!cached) {
      return null;
    }

    if (!this.isCacheEntryValid(cached.timestamp, CACHE_TTL_RELATED_ARTISTS_MS)) {
      this.relatedArtistsCache.delete(artistId);
      return null;
    }

    return cached.artists.map((artist) => this.cloneArtist(artist));
  }

  private setRelatedArtistsCache(artistId: string, artists: SpotifyArtist[]): void {
    this.relatedArtistsCache.set(artistId, {
      artists: artists.map((artist) => this.cloneArtist(artist)),
      timestamp: Date.now(),
    });
  }

  private getCachedPlaylistAnalysis(
    playlistId: string
  ): AnalyzePlaylistResponse | null {
    const cached = this.playlistAnalysisCache.get(playlistId);
    if (!cached) {
      return null;
    }

    if (!this.isCacheEntryValid(cached.timestamp, CACHE_TTL_PLAYLIST_ANALYSIS_MS)) {
      this.playlistAnalysisCache.delete(playlistId);
      return null;
    }

    return {
      ...cached.response,
      unfollowedArtists: cached.response.unfollowedArtists.map((artist) => ({
        ...artist,
        images: artist.images?.map((image) => ({ ...image })),
        external_urls: artist.external_urls ? { ...artist.external_urls } : undefined,
      })),
    };
  }

  private setPlaylistAnalysisCache(
    playlistId: string,
    response: AnalyzePlaylistResponse
  ): void {
    this.playlistAnalysisCache.set(playlistId, {
      response: {
        ...response,
        unfollowedArtists: response.unfollowedArtists.map((artist) => ({
          ...artist,
          images: artist.images?.map((image) => ({ ...image })),
          external_urls: artist.external_urls ? { ...artist.external_urls } : undefined,
        })),
      },
      timestamp: Date.now(),
    });
  }

  private async throttleRequests(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(
        (timestamp) => now - timestamp < REQUEST_INTERVAL_MS
      );

      if (this.requestTimestamps.length < MAX_REQUESTS_PER_INTERVAL) {
        this.requestTimestamps.push(now);
        return;
      }

      const earliest = this.requestTimestamps[0];
      const waitTime = REQUEST_INTERVAL_MS - (now - earliest) + 25;
      await this.delay(waitTime);
    }
  }

  private async handleRateLimit(error: AxiosError): Promise<number> {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      let requestedWait = retryAfter ? parseInt(retryAfter, 10) : RATE_LIMIT_RETRY_DEFAULT;
      if (Number.isNaN(requestedWait)) {
        requestedWait = RATE_LIMIT_RETRY_DEFAULT;
      }

      if (requestedWait > MAX_RATE_LIMIT_WAIT_SECONDS) {
        throw new Error(
          `Spotify rate limit exceeded. Please try again in approximately ${Math.ceil(
            requestedWait / 60
          )} minutes.`
        );
      }

      const waitTime = Math.min(requestedWait, MAX_RATE_LIMIT_WAIT_SECONDS);
      console.log(`Rate limited. Waiting ${waitTime} seconds...`);
      await this.delay((waitTime + 1) * 1000);
      this.currentDelayMs = Math.min(this.currentDelayMs * 1.5, MAX_DYNAMIC_DELAY_MS);
      return waitTime;
    }

    throw error;
  }

  private async apiCallWithRetry<T>(apiCall: () => Promise<T>, maxRetries = 5): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.throttleRequests();
        const jitter = Math.random() * this.currentDelayMs * 0.3;
        await this.delay(this.currentDelayMs + jitter);
        const result = await apiCall();
        this.currentDelayMs = Math.max(DEFAULT_DELAY_MS, Math.floor(this.currentDelayMs * 0.9));
        return result;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 429) {
            await this.handleRateLimit(error);
            continue;
          }

          if (
            error.code === 'ECONNRESET' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNABORTED'
          ) {
            if (attempt === maxRetries - 1) {
              throw new Error(`Network error after ${maxRetries} attempts: ${error.message}`);
            }
            const waitTime = Math.pow(2, attempt) * 2000;
            console.log(
              `Network error (${error.code}), retrying in ${waitTime}ms... (attempt ${
                attempt + 1
              }/${maxRetries})`
            );
            await this.delay(waitTime);
            continue;
          }
        }

        if (attempt === maxRetries - 1) {
          throw error;
        }

        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`API call failed, retrying in ${waitTime}ms...`);
        await this.delay(waitTime);
      }
    }

    throw new Error('Max retries exceeded');
  }

  private extractPlaylistId(playlistUrl: string): string {
    const match = playlistUrl.match(/playlist[\/:]([a-zA-Z0-9]+)/);
    if (match && match[1]) {
      return match[1];
    }

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

    const cachedAnalysis = this.getCachedPlaylistAnalysis(playlistId);
    if (cachedAnalysis) {
      onProgress?.({
        current: 4,
        total: 4,
        message: 'Using cached playlist analysis.',
      });
      return cachedAnalysis;
    }

    onProgress?.({ current: 0, total: 4, message: 'Fetching playlist info...' });
    const playlistInfo = await this.apiCallWithRetry(() =>
      this.api.get(`/playlists/${playlistId}`, {
        params: { fields: 'name,owner(display_name)' },
      })
    );

    const playlistName = playlistInfo.data.name;
    const playlistOwner = playlistInfo.data.owner.display_name;

    onProgress?.({ current: 1, total: 4, message: 'Fetching data...' });
    const { artists: playlistArtists, frequency: artistFrequency } =
      await this.getPlaylistArtistData(playlistId);
    const followedArtistIds = await this.getFollowStatusForArtists(Object.keys(playlistArtists));

    onProgress?.({ current: 3, total: 4, message: 'Analyzing artists...' });

    const unfollowedArtists: UnfollowedArtist[] = [];
    for (const [artistId, artist] of Object.entries(playlistArtists)) {
      if (!followedArtistIds.has(artistId)) {
        unfollowedArtists.push({
          ...artist,
          frequency: artistFrequency[artistId] || 0,
        });
      }
    }

    unfollowedArtists.sort((a, b) => {
      if (b.frequency !== a.frequency) {
        return b.frequency - a.frequency;
      }
      return a.name.localeCompare(b.name);
    });

    onProgress?.({ current: 4, total: 4, message: 'Analysis complete!' });

    const response: AnalyzePlaylistResponse = {
      playlistName,
      playlistOwner,
      unfollowedArtists,
    };

    this.setPlaylistAnalysisCache(playlistId, response);

    return response;
  }

  private async getPlaylistArtistData(
    playlistId: string
  ): Promise<{ artists: Record<string, SpotifyArtist>; frequency: Record<string, number> }> {
    const artists: Record<string, SpotifyArtist> = {};
    const frequency: Record<string, number> = {};
    const artistIdsToHydrate = new Set<string>();
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await this.apiCallWithRetry(() =>
        this.api.get(`/playlists/${playlistId}/tracks`, {
          params: {
            offset,
            limit,
            fields: 'items(track(artists(id,name,external_urls))),next',
          },
        })
      );

      const items = response.data.items ?? [];
      for (const item of items) {
        if (!item.track?.artists) {
          continue;
        }

        for (const artist of item.track.artists) {
          if (!artist?.id) {
            continue;
          }

          frequency[artist.id] = (frequency[artist.id] || 0) + 1;

          if (artists[artist.id]) {
            continue;
          }

          const cachedArtist = this.getCachedArtistDetails(artist.id);
          if (cachedArtist) {
            artists[artist.id] = cachedArtist;
            continue;
          }

          artists[artist.id] = {
            id: artist.id,
            name: artist.name,
            external_urls: artist.external_urls,
          } as SpotifyArtist;
          artistIdsToHydrate.add(artist.id);
        }
      }

      if (!response.data.next) {
        break;
      }

      offset += limit;
    }

    if (artistIdsToHydrate.size > 0) {
      const ids = Array.from(artistIdsToHydrate);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const response = await this.apiCallWithRetry(() =>
          this.api.get('/artists', {
            params: { ids: batch.join(',') },
          })
        );

        for (const fullArtist of response.data.artists ?? []) {
          if (!fullArtist?.id || !artists[fullArtist.id]) {
            continue;
          }

          const enriched = this.cloneArtist(fullArtist as SpotifyArtist);
          artists[fullArtist.id] = enriched;
          this.setArtistDetailsCache(enriched);
        }
      }
    }

    return { artists, frequency };
  }

  private async getFollowStatusForArtists(artistIds: string[]): Promise<Set<string>> {
    const followedIds = new Set<string>();
    const idsToFetch: string[] = [];

    for (const artistId of artistIds) {
      const cached = this.followStatusCache.get(artistId);
      if (cached && this.isCacheEntryValid(cached.timestamp, CACHE_TTL_FOLLOW_STATUS_MS)) {
        if (cached.isFollowed) {
          followedIds.add(artistId);
        }
        continue;
      }

      if (cached) {
        this.followStatusCache.delete(artistId);
      }

      idsToFetch.push(artistId);
    }

    for (let i = 0; i < idsToFetch.length; i += 50) {
      const chunk = idsToFetch.slice(i, i + 50);

      if (!chunk.length) {
        continue;
      }

      const response = await this.apiCallWithRetry(() =>
        this.api.get('/me/following/contains', {
          params: { type: 'artist', ids: chunk.join(',') },
        })
      );

      const statuses: boolean[] = response.data;
      statuses.forEach((isFollowed, index) => {
        const artistId = chunk[index];
        this.followStatusCache.set(artistId, {
          isFollowed,
          timestamp: Date.now(),
        });

        if (isFollowed) {
          followedIds.add(artistId);
        }
      });
    }

    return followedIds;
  }

  async getRelatedArtists(artistIds: string[]): Promise<SpotifyArtist[]> {
    const uniqueIds = Array.from(new Set(artistIds.filter((id) => Boolean(id))));
    if (!uniqueIds.length) {
      return [];
    }

    const seedSet = new Set(uniqueIds);
    const relatedMap = new Map<string, SpotifyArtist>();

    for (const artistId of uniqueIds) {
      let related = this.getCachedRelatedArtists(artistId);

      if (!related) {
        const response = await this.apiCallWithRetry(() =>
          this.api.get(`/artists/${artistId}/related-artists`)
        );

        const fetched: SpotifyArtist[] = (response.data?.artists ?? [])
          .filter((artist: SpotifyArtist | null | undefined) => Boolean(artist?.id))
          .map((artist: SpotifyArtist) => {
            const cloned = this.cloneArtist(artist);
            this.setArtistDetailsCache(cloned);
            return cloned;
          });

        this.setRelatedArtistsCache(artistId, fetched);
        related = fetched;
      }

      for (const artist of related) {
        if (!artist?.id || relatedMap.has(artist.id) || seedSet.has(artist.id)) {
          continue;
        }

        relatedMap.set(artist.id, this.cloneArtist(artist));
      }
    }

    if (!relatedMap.size) {
      return [];
    }

    const candidateArtists = Array.from(relatedMap.values());
    const followedIds = await this.getFollowStatusForArtists(
      candidateArtists.map((artist) => artist.id)
    );

    return candidateArtists
      .filter((artist) => !followedIds.has(artist.id))
      .sort((a, b) => {
        const popularityDiff = (b.popularity ?? 0) - (a.popularity ?? 0);
        if (popularityDiff !== 0) {
          return popularityDiff;
        }
        return a.name.localeCompare(b.name);
      })
      .map((artist) => this.cloneArtist(artist));
  }

  private async getFollowedArtists(limit?: number): Promise<SpotifyArtist[]> {
    if (!limit) {
      if (
        this.followedArtistsCache &&
        this.isCacheEntryValid(this.followedArtistsCache.timestamp, CACHE_TTL_FOLLOWED_ARTISTS_MS)
      ) {
        return this.followedArtistsCache.artists.map((artist) => this.cloneArtist(artist));
      }
    } else {
      if (this.followedArtistsCache) {
        const cachedAll = this.followedArtistsCache;
        if (this.isCacheEntryValid(cachedAll.timestamp, CACHE_TTL_FOLLOWED_ARTISTS_MS)) {
          if (cachedAll.artists.length >= limit) {
            return cachedAll.artists.slice(0, limit).map((artist) => this.cloneArtist(artist));
          }
        }
      }

      const cachedLimit = this.followedArtistsCacheByLimit.get(limit);
      if (
        cachedLimit &&
        this.isCacheEntryValid(cachedLimit.timestamp, CACHE_TTL_FOLLOWED_ARTISTS_MS)
      ) {
        return cachedLimit.artists.map((artist) => this.cloneArtist(artist));
      }
    }

    const artists: SpotifyArtist[] = [];
    let after: string | undefined;

    while (true) {
      const response = await this.apiCallWithRetry(() =>
        this.api.get('/me/following', {
          params: { type: 'artist', limit: 50, after },
        })
      );

      artists.push(...(response.data.artists?.items ?? []));

      if (limit && artists.length >= limit) {
        const sliced = artists.slice(0, limit);
        this.followedArtistsCacheByLimit.set(limit, {
          artists: sliced.map((artist) => this.cloneArtist(artist)),
          timestamp: Date.now(),
        });
        return sliced.map((artist) => this.cloneArtist(artist));
      }

      if (!response.data.artists?.next) {
        break;
      }

      after = response.data.artists.cursors?.after;
    }

    this.followedArtistsCache = {
      artists: artists.map((artist) => this.cloneArtist(artist)),
      timestamp: Date.now(),
    };

    return artists.map((artist) => this.cloneArtist(artist));
  }

  async followArtistsBulk(
    artistIds: string[],
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<FollowArtistsResponse> {
    let followedCount = 0;
    const failedArtists: string[] = [];
    const succeededIds: string[] = [];
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
        succeededIds.push(...chunk);
      } catch (error) {
        failedArtists.push(...chunk);
        console.error('Failed to follow chunk:', error);
      }

      if (i + CHUNK_SIZE_FOLLOW < artistIds.length) {
        await this.delay(2000);
      }
    }

    if (succeededIds.length) {
      const timestamp = Date.now();
      for (const artistId of succeededIds) {
        this.followStatusCache.set(artistId, { isFollowed: true, timestamp });
      }
      this.followedArtistsCache = null;
      this.followedArtistsCacheByLimit.clear();
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
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    onProgress?.({ current: 0, total: 1, message: 'Fetching followed artists...' });
    const artists = await this.getFollowedArtists(maxArtists);

    const artistsToCheck = maxArtists && maxArtists > 0 ? artists.slice(0, maxArtists) : artists;

    const releases: ReleaseWithArtist[] = [];
    const seenAlbumIds = new Set<string>();
    const startTime = Date.now();
    const batchSize = 5;

    for (let batchStart = 0; batchStart < artistsToCheck.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, artistsToCheck.length);
      const batch = artistsToCheck.slice(batchStart, batchEnd);

      const progress = batchEnd;
      const elapsed = Date.now() - startTime;
      const avgTimePerArtist = elapsed / Math.max(1, batchEnd);
      const remaining = artistsToCheck.length - progress;
      const etaMinutes = (remaining * avgTimePerArtist) / 60000;

      onProgress?.({
        current: progress,
        total: artistsToCheck.length,
        message: `Checking ${batch.map((a) => a.name).join(', ')}... (ETA: ${etaMinutes.toFixed(1)}m)`,
      });

      const batchResults = await Promise.allSettled(
        batch.map((artist) => this.getRecentReleasesForArtist(artist.id, artist.name, sinceDate))
      );

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
    const albumTypes: Array<'album' | 'single'> = ['album', 'single'];

    for (const albumType of albumTypes) {
      let offset = 0;
      const limit = 20;
      let shouldContinue = true;

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
            } as ReleaseWithArtist);
          }

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
      return null;
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
    onProgress?.({ current: 0, total: 3, message: 'Getting user info...' });
    const userResponse = await this.apiCallWithRetry(() => this.api.get('/me'));
    const userId = userResponse.data.id;

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

    const albumIds = releases.map((release) => release.id);
    const albumTrackMap = await this.getAlbumTrackMap(albumIds, (progress) => {
      onProgress?.({
        current: 2,
        total: 3,
        message: `Collecting tracks (${progress.current}/${progress.total})...`,
      });
    });

    const trackIds: string[] = [];
    for (const ids of albumTrackMap.values()) {
      trackIds.push(...ids);
    }

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

  private async getAlbumTrackMap(
    albumIds: string[],
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<Map<string, string[]>> {
    const uniqueAlbumIds = Array.from(new Set(albumIds));
    const albumTrackMap = new Map<string, string[]>();

    if (uniqueAlbumIds.length === 0) {
      return albumTrackMap;
    }

    const totalAlbums = uniqueAlbumIds.length;
    let processedAlbums = 0;

    for (let i = 0; i < uniqueAlbumIds.length; i += 20) {
      const batch = uniqueAlbumIds.slice(i, i + 20);

      const response = await this.apiCallWithRetry(() =>
        this.api.get('/albums', {
          params: {
            ids: batch.join(','),
            market: 'US',
          },
        })
      );

      const albums = (response.data.albums ?? []) as AlbumWithTracks[];
      for (const album of albums) {
        if (!album?.id) {
          continue;
        }

        const trackIds = await this.collectAllTrackIdsFromAlbum(album);
        albumTrackMap.set(album.id, trackIds);
        processedAlbums += 1;

        onProgress?.({
          current: processedAlbums,
          total: totalAlbums,
          message: `Loaded ${processedAlbums}/${totalAlbums} albums...`,
        });
      }
    }

    return albumTrackMap;
  }

  private async collectAllTrackIdsFromAlbum(album: AlbumWithTracks): Promise<string[]> {
    const cached = this.albumTrackCache.get(album.id);
    if (cached) {
      return [...cached];
    }

    const trackIds: string[] = [];
    const summary = album.tracks;
    if (summary?.items?.length) {
      for (const track of summary.items) {
        if (track?.id) {
          trackIds.push(track.id);
        }
      }
    }

    let nextUrl = summary?.next ?? null;
    while (nextUrl) {
      const url = nextUrl;
      const nextResponse = await this.apiCallWithRetry(() =>
        this.api.get(this.stripBaseUrl(url))
      );

      const nextData = nextResponse.data as AlbumTracksSummary;
      if (Array.isArray(nextData.items)) {
        for (const track of nextData.items) {
          if (track?.id) {
            trackIds.push(track.id);
          }
        }
      }

      nextUrl = nextData.next ?? null;
    }

    this.albumTrackCache.set(album.id, trackIds);
    return [...trackIds];
  }

  private stripBaseUrl(url: string): string {
    if (url.startsWith(SPOTIFY_API_BASE_URL)) {
      return url.slice(SPOTIFY_API_BASE_URL.length);
    }
    return url;
  }

}
