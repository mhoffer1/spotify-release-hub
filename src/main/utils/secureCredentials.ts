import fs from 'fs';
import path from 'path';
import { createDecipheriv } from 'crypto';

type CredentialSet = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

const FILE_HEADER = Buffer.from('SRH01', 'utf8');
const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:8888/callback';

const KEY_SEGMENTS: number[][] = [
  [81, 214, 12, 47, 199, 33, 158, 244, 108, 11, 162, 5, 96, 179, 58, 144],
  [201, 77, 24, 222, 53, 99, 172, 208, 142, 41, 117, 38, 188, 64, 133, 201],
];

function getKey(): Buffer {
  return Buffer.from(KEY_SEGMENTS.flat());
}

function loadFromEnvironment(): CredentialSet | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || DEFAULT_REDIRECT_URI,
  };
}

function candidatePaths(): string[] {
  const candidates = new Set<string>();

  if (process.env.SRH_CREDENTIALS_FILE) {
    candidates.add(process.env.SRH_CREDENTIALS_FILE);
  }

  candidates.add(path.resolve(process.cwd(), 'config/credentials.enc'));
  candidates.add(path.resolve(__dirname, '../../config/credentials.enc'));

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    candidates.add(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'config/credentials.enc'));
  }

  if (process.resourcesPath) {
    candidates.add(path.join(process.resourcesPath, 'config/credentials.enc'));
  }

  return Array.from(candidates);
}

function resolveCredentialsFile(): string | null {
  for (const candidate of candidatePaths()) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (error) {
      console.warn('[secureCredentials] Failed to check credentials file', candidate, error);
    }
  }

  return null;
}

function decryptCredentials(buffer: Buffer): CredentialSet {
  if (buffer.length < FILE_HEADER.length + 12 + 16) {
    throw new Error('Encrypted credentials payload is too small');
  }

  const header = buffer.subarray(0, FILE_HEADER.length);
  if (!header.equals(FILE_HEADER)) {
    throw new Error('Invalid encrypted credentials header');
  }

  const ivOffset = FILE_HEADER.length;
  const tagOffset = ivOffset + 12;
  const dataOffset = tagOffset + 16;

  const iv = buffer.subarray(ivOffset, tagOffset);
  const authTag = buffer.subarray(tagOffset, dataOffset);
  const encrypted = buffer.subarray(dataOffset);

  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');

  const parsed = JSON.parse(decrypted) as CredentialSet;
  if (!parsed.clientId || !parsed.clientSecret) {
    throw new Error('Decrypted credentials are missing required values');
  }

  return {
    clientId: parsed.clientId,
    clientSecret: parsed.clientSecret,
    redirectUri: parsed.redirectUri || DEFAULT_REDIRECT_URI,
  };
}

export function getSecureSpotifyCredentials(): CredentialSet {
  const envCredentials = loadFromEnvironment();
  if (envCredentials) {
    return envCredentials;
  }

  const credentialsPath = resolveCredentialsFile();
  if (!credentialsPath) {
    console.warn('[secureCredentials] No encrypted credentials file found.');
    return {
      clientId: '',
      clientSecret: '',
      redirectUri: DEFAULT_REDIRECT_URI,
    };
  }

  try {
    const buffer = fs.readFileSync(credentialsPath);
    return decryptCredentials(buffer);
  } catch (error) {
    console.error('[secureCredentials] Failed to load encrypted credentials:', error);
    return {
      clientId: '',
      clientSecret: '',
      redirectUri: DEFAULT_REDIRECT_URI,
    };
  }
}
