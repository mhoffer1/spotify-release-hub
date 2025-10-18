const OBFUSCATION_KEY = 73;

const ENCODED_CLIENT_ID: number[] = [45,124,124,122,45,40,123,40,125,124,42,42,125,42,40,42,113,43,113,120,47,113,43,125,123,121,122,112,112,40,43,45];
const ENCODED_CLIENT_SECRET: number[] = [121,120,112,127,125,112,122,127,112,120,126,125,125,120,122,44,113,127,45,123,121,126,122,120,40,121,127,121,45,122,121,120];

function decode(encoded: number[]): string {
  return encoded
    .map((value) => String.fromCharCode(value ^ OBFUSCATION_KEY))
    .join('');
}

export function getSecureSpotifyCredentials() {
  return {
    clientId: decode(ENCODED_CLIENT_ID),
    clientSecret: decode(ENCODED_CLIENT_SECRET),
    redirectUri: 'http://127.0.0.1:8888/callback',
  } as const;
}
