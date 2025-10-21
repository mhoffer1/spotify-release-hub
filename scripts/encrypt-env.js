#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const HEADER = Buffer.from('SRH01', 'utf8');
const OUTPUT_FILENAME = 'credentials.enc';

const KEY_SEGMENTS = [
  [81, 214, 12, 47, 199, 33, 158, 244, 108, 11, 162, 5, 96, 179, 58, 144],
  [201, 77, 24, 222, 53, 99, 172, 208, 142, 41, 117, 38, 188, 64, 133, 201],
];

function getKey() {
  return Buffer.from(KEY_SEGMENTS.flat());
}

function loadEnvironmentVariables() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.warn('[encrypt-env] Failed to parse .env at', envPath, result.error);
    } else {
      console.log('[encrypt-env] Loaded .env from', envPath);
    }
  } else {
    dotenv.config();
  }
}

function ensureValue(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function producePayload() {
  const clientId = ensureValue('SPOTIFY_CLIENT_ID');
  const clientSecret = ensureValue('SPOTIFY_CLIENT_SECRET');
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';

  return JSON.stringify({ clientId, clientSecret, redirectUri });
}

function encrypt(payload) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([HEADER, iv, authTag, encrypted]);
}

function writeOutput(buffer) {
  const outputDir = path.resolve(process.cwd(), 'config');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, OUTPUT_FILENAME);
  fs.writeFileSync(outputPath, buffer);
  console.log('[encrypt-env] Wrote encrypted credentials to', outputPath);
}

function main() {
  try {
    loadEnvironmentVariables();
    const payload = producePayload();
    const encrypted = encrypt(payload);
    writeOutput(encrypted);
    console.log('[encrypt-env] Done. Remember to keep your .env file out of version control.');
  } catch (error) {
    console.error('[encrypt-env] Failed to create encrypted credentials:', error.message);
    process.exitCode = 1;
  }
}

main();
