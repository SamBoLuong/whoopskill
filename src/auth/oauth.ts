import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import open from 'open';
import { saveTokens, clearTokens, getTokenStatus } from './tokens.js';
import { WhoopError, ExitCode } from '../utils/errors.js';
import type { OAuthTokenResponse } from '../types/whoop.js';

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const SCOPES = 'read:profile read:body_measurement read:workout read:recovery read:sleep read:cycles offline';

function getCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new WhoopError(
      'Missing WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, or WHOOP_REDIRECT_URI in environment',
      ExitCode.AUTH_ERROR
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function login(): Promise<void> {
  const { clientId, clientSecret, redirectUri } = getCredentials();
  const state = randomBytes(16).toString('hex');

  const authUrl = new URL(WHOOP_AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);

  console.log('Opening browser for authorization...');
  await open(authUrl.toString());

  const callbackUrl = await prompt('\nPaste the callback URL here: ');

  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (!code) {
    throw new WhoopError('No authorization code in callback URL', ExitCode.AUTH_ERROR);
  }

  if (returnedState !== state) {
    throw new WhoopError('OAuth state mismatch', ExitCode.AUTH_ERROR);
  }

  const tokenResponse = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    throw new WhoopError(`Token exchange failed: ${text}`, ExitCode.AUTH_ERROR, tokenResponse.status);
  }

  const tokens = (await tokenResponse.json()) as OAuthTokenResponse;
  saveTokens(tokens);
  console.log('Authentication successful');
}

export function logout(): void {
  clearTokens();
  console.log('Logged out');
}

export function status(): void {
  const tokenStatus = getTokenStatus();
  console.log(JSON.stringify(tokenStatus, null, 2));
}
