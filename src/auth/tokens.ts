import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { TokenData, OAuthTokenResponse } from '../types/whoop.js';
import { WhoopError, ExitCode } from '../utils/errors.js';

const CONFIG_DIR = join(homedir(), '.whoop-cli');
const TOKEN_FILE = join(CONFIG_DIR, 'tokens.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function saveTokens(response: OAuthTokenResponse): void {
  ensureConfigDir();

  const data: TokenData = {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + response.expires_in,
    token_type: response.token_type,
    scope: response.scope,
  };

  writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
  chmodSync(TOKEN_FILE, 0o600);
}

export function loadTokens(): TokenData | null {
  if (!existsSync(TOKEN_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(TOKEN_FILE, 'utf-8');
    return JSON.parse(content) as TokenData;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  if (existsSync(TOKEN_FILE)) {
    writeFileSync(TOKEN_FILE, '');
  }
}

export function isTokenExpired(tokens: TokenData): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= tokens.expires_at - 60;
}

export async function refreshAccessToken(tokens: TokenData): Promise<TokenData> {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new WhoopError('Missing WHOOP_CLIENT_ID or WHOOP_CLIENT_SECRET', ExitCode.AUTH_ERROR);
  }

  const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new WhoopError('Token refresh failed', ExitCode.AUTH_ERROR, response.status);
  }

  const data = (await response.json()) as OAuthTokenResponse;
  saveTokens(data);
  return loadTokens()!;
}

export async function getValidTokens(): Promise<TokenData> {
  let tokens = loadTokens();

  if (!tokens) {
    throw new WhoopError('Not authenticated. Run: whoopskill auth login', ExitCode.AUTH_ERROR);
  }

  if (isTokenExpired(tokens)) {
    tokens = await refreshAccessToken(tokens);
  }

  return tokens;
}

export function getTokenStatus(): { authenticated: boolean; expires_at?: number } {
  const tokens = loadTokens();
  if (!tokens) {
    return { authenticated: false };
  }
  return {
    authenticated: true,
    expires_at: tokens.expires_at,
  };
}
