# whoopskill CLI Specification

## Overview

A Node.js CLI application that connects to the WHOOP API to retrieve user health data. By default fetches all available health data for the current WHOOP day, with optional date selection for historical queries.

## Technical Stack

| Component | Choice |
|-----------|--------|
| Runtime | Node.js 22+ |
| Language | TypeScript |
| Build | tsx (dev), tsc (build) |
| Package | npm-publishable as `whoopskill` |

## Authentication

### OAuth 2.0 Flow
- User registers their own WHOOP application at developer.whoop.com
- Client credentials stored in `.env` file:
  ```
  WHOOP_CLIENT_ID=your_client_id
  WHOOP_CLIENT_SECRET=your_client_secret
  ```
- Browser-based OAuth flow for user authorization
- Local HTTP server captures callback (auto-finds available port starting from 3000)
- Tokens persisted to `~/.whoop-cli/tokens.json`
- Silent auto-refresh when access token expires using refresh_token

### OAuth Scopes
Request all read scopes:
- `read:profile`
- `read:workout`
- `read:recovery`
- `read:sleep`
- `read:cycles`
- `offline` (for refresh token)

## CLI Interface

### Commands

```bash
# Default: fetch all today's data (combined JSON output)
whoopskill

# Specific data types
whoopskill sleep
whoopskill recovery
whoopskill workout
whoopskill cycle
whoopskill profile

# Multiple types combined
whoopskill --sleep --recovery    # or -s -r
whoopskill sleep recovery        # alternative syntax

# Authentication
whoopskill auth login            # Start OAuth flow
whoopskill auth status           # Check token status
whoopskill auth logout           # Clear stored tokens
```

### Date Selection

```bash
# ISO date format only
whoopskill --date 2025-01-03
whoopskill sleep --date 2025-01-03

# Date ranges
whoopskill --start 2025-01-01 --end 2025-01-07
```

### Pagination

```bash
# Default: first page of results
whoopskill workout

# Control pagination
whoopskill workout --limit 50    # Max results per page
whoopskill workout --all         # Fetch all pages
```

## Output Format

- **JSON output only** (no pretty tables)
- Combined queries merge into single JSON object:
  ```json
  {
    "sleep": [...],
    "recovery": [...],
    "date": "2025-01-05",
    "fetched_at": "2025-01-05T14:30:00Z"
  }
  ```

## Day Boundary

Uses WHOOP's day boundary (4am cutoff):
- Sleep ending after 4am belongs to that day's data
- Aligns with how WHOOP app presents daily summaries

## Data Types

### Profile
```typescript
interface WhoopProfile {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}
```

### Sleep
```typescript
interface WhoopSleep {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: {
      baseline_milli: number;
      need_from_sleep_debt_milli: number;
      need_from_recent_strain_milli: number;
    };
    respiratory_rate: number;
    sleep_performance_percentage: number;
    sleep_consistency_percentage: number;
    sleep_efficiency_percentage: number;
  };
}
```

### Recovery
```typescript
interface WhoopRecovery {
  cycle_id: number;
  sleep_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  score: number;
  recovery_score: number;
  resting_heart_rate: number;
  hrv_rmssd_milli: number;
  spo2_percentage: number;
  skin_temp_celsius: number;
}
```

### Workout
```typescript
interface WhoopWorkout {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_id: number;
  strain: number;
  average_heart_rate: number;
  max_heart_rate: number;
  kilojoule: number;
}
```

### Cycle (Daily Summary)
```typescript
interface WhoopCycle {
  id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  score: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  };
  recovery: {
    id: number;
    score: number;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage: number;
    skin_temp_celsius: number;
  };
}
```

## API Endpoints

Base URL: `https://api.prod.whoop.com/developer/v1`

| Endpoint | Path |
|----------|------|
| Profile | `GET /user/profile/basic` |
| Workouts | `GET /activity/workout` |
| Sleep | `GET /activity/sleep` |
| Recovery | `GET /recovery` |
| Cycles | `GET /cycle` |

Query parameters: `start`, `end`, `limit`, `nextToken`

## Error Handling

- **Minimal output**: Error code + message only
- **Fail fast on rate limits**: Exit immediately with clear error
- **No caching**: Always fetch fresh data
- **Exit codes**:
  - `0`: Success
  - `1`: General error
  - `2`: Authentication error
  - `3`: Rate limit exceeded
  - `4`: Network error

Example error output:
```
Error: Rate limit exceeded (429)
```

## File Structure

```
whoopskill/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── cli.ts             # Argument parsing
│   ├── auth/
│   │   ├── oauth.ts       # OAuth flow
│   │   ├── tokens.ts      # Token storage/refresh
│   │   └── server.ts      # Callback HTTP server
│   ├── api/
│   │   ├── client.ts      # WHOOP API client
│   │   └── endpoints.ts   # API endpoint definitions
│   ├── types/
│   │   └── whoop.ts       # Type definitions
│   └── utils/
│       ├── date.ts        # Date utilities
│       └── errors.ts      # Error handling
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## package.json

```json
{
  "name": "whoopskill",
  "version": "1.0.0",
  "description": "CLI for fetching WHOOP health data",
  "type": "module",
  "bin": {
    "whoopskill": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

## .env.example

```bash
# Required: Register at developer.whoop.com
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=

# Optional: Override redirect URI (default: auto-detected)
# WHOOP_REDIRECT_URI=http://localhost:3000/callback
```

## Token Storage

Location: `~/.whoop-cli/tokens.json`

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": 1704499200,
  "token_type": "Bearer",
  "scope": "read:profile read:workout read:recovery read:sleep read:cycles offline"
}
```

File permissions: `600` (owner read/write only)

## Dependencies

### Runtime
- No external HTTP client (use native fetch)
- `commander` or `yargs` for CLI parsing
- `open` for launching browser during OAuth

### Dev
- `typescript`
- `tsx`
- `@types/node`

## Non-Goals

- No pretty table output (JSON only)
- No caching
- No interactive mode
- No stdin piping
- No natural language date parsing
- No third-party OAuth proxy (user registers own app)
