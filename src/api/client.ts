import { clearTokens, getValidTokens } from '../auth/tokens.js';
import { BASE_URL, ENDPOINTS } from './endpoints.js';
import { WhoopError, ExitCode } from '../utils/errors.js';
import type {
  WhoopProfile,
  WhoopBody,
  WhoopSleep,
  WhoopRecovery,
  WhoopWorkout,
  WhoopCycle,
  ApiResponse,
  QueryParams,
  CombinedOutput,
  DataType,
  ActivityIdMappingResponse,
} from '../types/whoop.js';
import { getDateRange, nowISO } from '../utils/date.js';

interface CollectionResult<T> {
  records: T[];
  nextToken?: string;
}

interface FetchOptions {
  limit?: number;
  all?: boolean;
  start?: string;
  end?: string;
  nextToken?: string;
}

async function request<T>(
  endpoint: string,
  params?: QueryParams,
  init?: Omit<RequestInit, 'headers'>
): Promise<T> {
  const tokens = await getValidTokens();

  const url = new URL(BASE_URL + endpoint);
  if (params?.start) url.searchParams.set('start', params.start);
  if (params?.end) url.searchParams.set('end', params.end);
  if (params?.limit) url.searchParams.set('limit', String(params.limit));
  if (params?.nextToken) url.searchParams.set('nextToken', params.nextToken);

  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new WhoopError('Authentication failed', ExitCode.AUTH_ERROR, 401);
    }
    if (response.status === 429) {
      throw new WhoopError('Rate limit exceeded', ExitCode.RATE_LIMIT, 429);
    }
    throw new WhoopError('API request failed', ExitCode.GENERAL_ERROR, response.status);
  }

  return response.json() as Promise<T>;
}

async function requestNoContent(
  endpoint: string,
  init?: Omit<RequestInit, 'headers'>
): Promise<void> {
  const tokens = await getValidTokens();
  const response = await fetch(BASE_URL + endpoint, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new WhoopError('Authentication failed', ExitCode.AUTH_ERROR, 401);
    }
    if (response.status === 429) {
      throw new WhoopError('Rate limit exceeded', ExitCode.RATE_LIMIT, 429);
    }
    throw new WhoopError('API request failed', ExitCode.GENERAL_ERROR, response.status);
  }
}

async function fetchCollection<T>(
  endpoint: string,
  params: QueryParams = {},
  fetchAllPages = false
): Promise<CollectionResult<T>> {
  if (!fetchAllPages) {
    const page = await request<ApiResponse<T>>(endpoint, params);
    return { records: page.records, nextToken: page.next_token };
  }

  const records: T[] = [];
  let nextToken = params.nextToken;

  do {
    const page = await request<ApiResponse<T>>(endpoint, { ...params, nextToken });
    records.push(...page.records);
    nextToken = page.next_token;
  } while (nextToken);

  return { records };
}

export async function getProfile(): Promise<WhoopProfile> {
  return request<WhoopProfile>(ENDPOINTS.profile);
}

export async function getBody(): Promise<WhoopBody> {
  return request<WhoopBody>(ENDPOINTS.body);
}

export async function getSleepCollection(
  params: QueryParams = {},
  all = false
): Promise<CollectionResult<WhoopSleep>> {
  return fetchCollection<WhoopSleep>(ENDPOINTS.sleepCollection, { limit: 25, ...params }, all);
}

export async function getRecoveryCollection(
  params: QueryParams = {},
  all = false
): Promise<CollectionResult<WhoopRecovery>> {
  return fetchCollection<WhoopRecovery>(ENDPOINTS.recoveryCollection, { limit: 25, ...params }, all);
}

export async function getWorkoutCollection(
  params: QueryParams = {},
  all = false
): Promise<CollectionResult<WhoopWorkout>> {
  return fetchCollection<WhoopWorkout>(ENDPOINTS.workoutCollection, { limit: 25, ...params }, all);
}

export async function getCycleCollection(
  params: QueryParams = {},
  all = false
): Promise<CollectionResult<WhoopCycle>> {
  return fetchCollection<WhoopCycle>(ENDPOINTS.cycleCollection, { limit: 25, ...params }, all);
}

export async function getSleep(params: QueryParams = {}, all = false): Promise<WhoopSleep[]> {
  const { records } = await getSleepCollection(params, all);
  return records;
}

export async function getRecovery(params: QueryParams = {}, all = false): Promise<WhoopRecovery[]> {
  const { records } = await getRecoveryCollection(params, all);
  return records;
}

export async function getWorkout(params: QueryParams = {}, all = false): Promise<WhoopWorkout[]> {
  const { records } = await getWorkoutCollection(params, all);
  return records;
}

export async function getCycle(params: QueryParams = {}, all = false): Promise<WhoopCycle[]> {
  const { records } = await getCycleCollection(params, all);
  return records;
}

export async function getSleepById(sleepId: string): Promise<WhoopSleep> {
  return request<WhoopSleep>(ENDPOINTS.sleepById(sleepId));
}

export async function getWorkoutById(workoutId: string): Promise<WhoopWorkout> {
  return request<WhoopWorkout>(ENDPOINTS.workoutById(workoutId));
}

export async function getCycleById(cycleId: number): Promise<WhoopCycle> {
  return request<WhoopCycle>(ENDPOINTS.cycleById(cycleId));
}

export async function getSleepForCycle(cycleId: number): Promise<WhoopSleep> {
  return request<WhoopSleep>(ENDPOINTS.sleepByCycleId(cycleId));
}

export async function getRecoveryForCycle(cycleId: number): Promise<WhoopRecovery> {
  return request<WhoopRecovery>(ENDPOINTS.recoveryByCycleId(cycleId));
}

export async function getActivityMapping(activityV1Id: number): Promise<ActivityIdMappingResponse> {
  return request<ActivityIdMappingResponse>(ENDPOINTS.activityMappingV1(activityV1Id));
}

export async function revokeUserAccess(): Promise<{ revoked: true }> {
  await requestNoContent(ENDPOINTS.userAccess, { method: 'DELETE' });
  clearTokens();
  return { revoked: true as const };
}

export async function fetchData(
  types: DataType[],
  date: string,
  options: FetchOptions = {}
): Promise<CombinedOutput> {
  const range = options.start || options.end ? { start: options.start, end: options.end } : getDateRange(date);
  const params: QueryParams = {
    start: range.start,
    end: range.end,
    limit: options.limit,
    nextToken: options.nextToken,
  };

  const output: CombinedOutput = {
    date,
    fetched_at: nowISO(),
  };
  const pagination: Partial<Record<DataType, string>> = {};

  const fetchers: Record<DataType, () => Promise<void>> = {
    profile: async () => {
      output.profile = await getProfile();
    },
    body: async () => {
      output.body = await getBody();
    },
    sleep: async () => {
      const page = await getSleepCollection(params, options.all);
      output.sleep = page.records;
      if (page.nextToken) pagination.sleep = page.nextToken;
    },
    recovery: async () => {
      const page = await getRecoveryCollection(params, options.all);
      output.recovery = page.records;
      if (page.nextToken) pagination.recovery = page.nextToken;
    },
    workout: async () => {
      const page = await getWorkoutCollection(params, options.all);
      output.workout = page.records;
      if (page.nextToken) pagination.workout = page.nextToken;
    },
    cycle: async () => {
      const page = await getCycleCollection(params, options.all);
      output.cycle = page.records;
      if (page.nextToken) pagination.cycle = page.nextToken;
    },
  };

  await Promise.all(types.map((type) => fetchers[type]()));

  if (Object.keys(pagination).length > 0) {
    output.pagination = pagination;
  }

  return output;
}

export async function fetchAllTypes(
  date: string,
  options: FetchOptions = {}
): Promise<CombinedOutput> {
  return fetchData(['profile', 'body', 'sleep', 'recovery', 'workout', 'cycle'], date, options);
}
