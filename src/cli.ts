import { Command } from 'commander';
import { login, logout, status as authStatus, refresh as authRefresh } from './auth/oauth.js';
import {
  fetchData,
  fetchAllTypes,
  getActivityMapping,
  getCycle,
  getCycleById,
  getRecovery,
  getRecoveryForCycle,
  getSleep,
  getSleepById,
  getSleepForCycle,
  getWorkout,
  getWorkoutById,
  revokeUserAccess,
} from './api/client.js';
import { getWhoopDay, validateISODate, getDaysAgo, nowISO } from './utils/date.js';
import { handleError, WhoopError, ExitCode } from './utils/errors.js';
import { formatPretty, formatSummary, formatSummaryColor } from './utils/format.js';
import { analyzeTrends, generateInsights, formatTrends, formatInsights } from './utils/analysis.js';
import type { DataType, WhoopData, WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout } from './types/whoop.js';

export const program = new Command();
program.enablePositionalOptions();

interface PrettyOption {
  pretty?: boolean;
}

interface BaseDateOption extends PrettyOption {
  date?: string;
}

interface RootOptions extends BaseDateOption {
  limit: string;
  all?: boolean;
  start?: string;
  end?: string;
  nextToken?: string;
  sleep?: boolean;
  recovery?: boolean;
  workout?: boolean;
  cycle?: boolean;
  profile?: boolean;
  body?: boolean;
}

interface CollectionOptions extends BaseDateOption {
  start?: string;
  end?: string;
  limit: string;
  all?: boolean;
  nextToken?: string;
  id?: string;
  cycleId?: string;
}

interface SummaryOptions {
  date?: string;
  color?: boolean;
}

interface TrendsOptions {
  days: string;
  json?: boolean;
  pretty?: boolean;
}

interface InsightsOptions {
  date?: string;
  json?: boolean;
  pretty?: boolean;
}

type SingleRecord = WhoopSleep | WhoopRecovery | WhoopWorkout | WhoopCycle;
type SingleRecordKey = 'sleep' | 'recovery' | 'workout' | 'cycle';

interface CollectionConfig {
  name: SingleRecordKey;
  description: string;
  supportsId?: boolean;
  supportsCycleId?: boolean;
}

function output(data: WhoopData, pretty: boolean): void {
  console.log(pretty ? formatPretty(data) : JSON.stringify(data, null, 2));
}

function validateDateOption(date?: string): void {
  if (date && !validateISODate(date)) {
    throw new WhoopError('Invalid date format. Use YYYY-MM-DD', ExitCode.GENERAL_ERROR);
  }
}

function validateDateTimeOption(value: string | undefined, flag: '--start' | '--end'): void {
  if (!value) return;
  if (Number.isNaN(Date.parse(value))) {
    throw new WhoopError(`Invalid ${flag} datetime. Use ISO format like 2026-02-24T04:00:00.000Z`, ExitCode.GENERAL_ERROR);
  }
}

function parseLimit(limit: string): number {
  if (!/^\d+$/.test(limit)) {
    throw new WhoopError('Limit must be an integer between 1 and 25', ExitCode.GENERAL_ERROR);
  }
  const parsed = Number(limit);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 25) {
    throw new WhoopError('Limit must be an integer between 1 and 25', ExitCode.GENERAL_ERROR);
  }
  return parsed;
}

function parsePositiveInteger(value: string, fieldName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new WhoopError(`${fieldName} must be a positive integer`, ExitCode.GENERAL_ERROR);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new WhoopError(`${fieldName} must be a positive integer`, ExitCode.GENERAL_ERROR);
  }
  return parsed;
}

function parseCycleId(value: string): number {
  return parsePositiveInteger(value, 'cycle_id');
}

function wrapSingleRecord(key: SingleRecordKey, date: string, item: SingleRecord): WhoopData {
  return {
    date,
    fetched_at: nowISO(),
    [key]: [item],
  } as WhoopData;
}

async function resolveByIdOrCycle(
  type: SingleRecordKey,
  options: CollectionOptions,
  date: string
): Promise<WhoopData | null> {
  if (options.id && options.cycleId) {
    throw new WhoopError('Use either --id or --cycle-id, not both', ExitCode.GENERAL_ERROR);
  }

  if (options.id) {
    if (type === 'sleep') return wrapSingleRecord('sleep', date, await getSleepById(options.id));
    if (type === 'workout') return wrapSingleRecord('workout', date, await getWorkoutById(options.id));
    if (type === 'cycle') return wrapSingleRecord('cycle', date, await getCycleById(parseCycleId(options.id)));
    throw new WhoopError(`--id is not supported for ${type}`, ExitCode.GENERAL_ERROR);
  }

  if (options.cycleId) {
    const cycleId = parseCycleId(options.cycleId);
    if (type === 'sleep') return wrapSingleRecord('sleep', date, await getSleepForCycle(cycleId));
    if (type === 'recovery') return wrapSingleRecord('recovery', date, await getRecoveryForCycle(cycleId));
    throw new WhoopError(`--cycle-id is not supported for ${type}`, ExitCode.GENERAL_ERROR);
  }

  return null;
}

function addCollectionCommand(config: CollectionConfig): void {
  const command = program
    .command(config.name)
    .description(config.description)
    .option('-d, --date <date>', 'Date in ISO format (YYYY-MM-DD)')
    .option('-s, --start <date-time>', 'Start datetime for range query (ISO 8601)')
    .option('-e, --end <date-time>', 'End datetime for range query (ISO 8601)')
    .option('-l, --limit <number>', 'Max results per page', '25')
    .option('-a, --all', 'Fetch all pages')
    .option('--next-token <token>', 'Fetch page from the provided next_token')
    .option('-p, --pretty', 'Human-readable output');

  if (config.supportsId) {
    command.option('--id <id>', 'Query resource by id');
  }
  if (config.supportsCycleId) {
    command.option('--cycle-id <cycleId>', 'Query resource via cycle id');
  }

  command.action(async (options: CollectionOptions) => {
    try {
      const date = options.date || getWhoopDay();
      validateDateOption(options.date);
      validateDateTimeOption(options.start, '--start');
      validateDateTimeOption(options.end, '--end');

      const idResult = await resolveByIdOrCycle(config.name, options, date);
      if (idResult) {
        output(idResult, Boolean(options.pretty));
        return;
      }

      const result = await fetchData([config.name], date, {
        limit: parseLimit(options.limit),
        all: options.all,
        start: options.start,
        end: options.end,
        nextToken: options.nextToken,
      });
      output(result, Boolean(options.pretty));
    } catch (error) {
      handleError(error);
    }
  });
}

program
  .name('whoopskill')
  .description('CLI for fetching WHOOP health data')
  .version('1.2.0');

program
  .command('auth')
  .description('Manage authentication')
  .argument('<action>', 'login, logout, status, or refresh')
  .action(async (action: string) => {
    try {
      switch (action) {
        case 'login':
          await login();
          break;
        case 'logout':
          logout();
          break;
        case 'status':
          authStatus();
          break;
        case 'refresh':
          await authRefresh();
          break;
        default:
          throw new WhoopError('Unknown auth action. Use: login, logout, status, or refresh', ExitCode.GENERAL_ERROR);
      }
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('access')
  .description('Manage WHOOP app access lifecycle')
  .argument('<action>', 'revoke')
  .action(async (action: string) => {
    try {
      if (action !== 'revoke') {
        throw new WhoopError('Unknown access action. Use: revoke', ExitCode.GENERAL_ERROR);
      }
      const result = await revokeUserAccess();
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('mapping')
  .description('Lookup v2 UUID using a v1 activity id')
  .argument('<activityV1Id>', 'v1 activity id (integer)')
  .action(async (activityV1Id: string) => {
    try {
      const id = parsePositiveInteger(activityV1Id, 'activityV1Id');
      const result = await getActivityMapping(id);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      handleError(error);
    }
  });

addCollectionCommand({
  name: 'sleep',
  description: 'Get sleep data',
  supportsId: true,
  supportsCycleId: true,
});
addCollectionCommand({
  name: 'recovery',
  description: 'Get recovery data',
  supportsCycleId: true,
});
addCollectionCommand({
  name: 'workout',
  description: 'Get workout data',
  supportsId: true,
});
addCollectionCommand({
  name: 'cycle',
  description: 'Get cycle data',
  supportsId: true,
});

program
  .command('profile')
  .description('Get profile data')
  .option('-p, --pretty', 'Human-readable output')
  .action(async (options: PrettyOption) => {
    try {
      const result = await fetchData(['profile'], getWhoopDay());
      output(result, Boolean(options.pretty));
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('body')
  .description('Get body measurements')
  .option('-p, --pretty', 'Human-readable output')
  .action(async (options: PrettyOption) => {
    try {
      const result = await fetchData(['body'], getWhoopDay());
      output(result, Boolean(options.pretty));
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('summary')
  .description('One-liner health snapshot')
  .option('-d, --date <date>', 'Date in ISO format (YYYY-MM-DD)')
  .option('-c, --color', 'Color-coded output with status indicators')
  .action(async (options: SummaryOptions) => {
    try {
      const date = options.date || getWhoopDay();
      validateDateOption(options.date);

      const result = await fetchData(['recovery', 'sleep', 'cycle', 'workout'], date, { limit: 25 });
      console.log(options.color ? formatSummaryColor(result) : formatSummary(result));
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('trends')
  .description('Show trends over time (7/14/30 days)')
  .option('-n, --days <number>', 'Number of days to analyze', '7')
  .option('--json', 'Output raw JSON instead of formatted text')
  .option('-p, --pretty', 'Human-readable output')
  .action(async (options: TrendsOptions) => {
    try {
      const days = Number.parseInt(options.days, 10);
      if (![7, 14, 30].includes(days)) {
        throw new WhoopError('Days must be 7, 14, or 30', ExitCode.GENERAL_ERROR);
      }

      const endDate = getWhoopDay();
      const startDate = getDaysAgo(days);
      const params = { start: startDate + 'T00:00:00.000Z', end: endDate + 'T23:59:59.999Z', limit: days + 5 };

      const [recovery, sleep, cycle] = await Promise.all([
        getRecovery(params, true),
        getSleep(params, true),
        getCycle(params, true),
      ]);

      const trends = analyzeTrends(recovery, sleep, cycle, days);
      console.log(formatTrends(trends, !options.json));
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('insights')
  .description('AI-style health insights and recommendations')
  .option('-d, --date <date>', 'Date in ISO format (YYYY-MM-DD)')
  .option('--json', 'Output raw JSON instead of formatted text')
  .option('-p, --pretty', 'Human-readable output')
  .action(async (options: InsightsOptions) => {
    try {
      const date = options.date || getWhoopDay();
      validateDateOption(options.date);

      const startDate = getDaysAgo(7);
      const params = { start: startDate + 'T00:00:00.000Z', end: date + 'T23:59:59.999Z' };

      const [recovery, sleep, cycle, workout] = await Promise.all([
        getRecovery(params, true),
        getSleep(params, true),
        getCycle(params, true),
        getWorkout({ start: date + 'T00:00:00.000Z', end: date + 'T23:59:59.999Z' }, true),
      ]);

      const insights = generateInsights(recovery, sleep, cycle, workout);
      console.log(formatInsights(insights, !options.json));
    } catch (error) {
      handleError(error);
    }
  });

program
  .option('-d, --date <date>', 'Date in ISO format (YYYY-MM-DD)')
  .option('-s, --start <date-time>', 'Start datetime for range query (ISO 8601)')
  .option('-e, --end <date-time>', 'End datetime for range query (ISO 8601)')
  .option('-l, --limit <number>', 'Max results per page', '25')
  .option('-a, --all', 'Fetch all pages')
  .option('--next-token <token>', 'Fetch page from the provided next_token')
  .option('-p, --pretty', 'Human-readable output')
  .option('--sleep', 'Include sleep data')
  .option('--recovery', 'Include recovery data')
  .option('--workout', 'Include workout data')
  .option('--cycle', 'Include cycle data')
  .option('--profile', 'Include profile data')
  .option('--body', 'Include body measurements')
  .action(async (options: RootOptions) => {
    try {
      const date = options.date || getWhoopDay();
      validateDateOption(options.date);
      validateDateTimeOption(options.start, '--start');
      validateDateTimeOption(options.end, '--end');

      const types: DataType[] = [];
      if (options.sleep) types.push('sleep');
      if (options.recovery) types.push('recovery');
      if (options.workout) types.push('workout');
      if (options.cycle) types.push('cycle');
      if (options.profile) types.push('profile');
      if (options.body) types.push('body');

      if (options.nextToken) {
        const collectionTypes = types.filter(
          (type): type is SingleRecordKey => ['sleep', 'recovery', 'workout', 'cycle'].includes(type)
        );
        if (types.length !== 1 || collectionTypes.length !== 1) {
          throw new WhoopError(
            '--next-token can only be used with exactly one collection type: --sleep, --recovery, --workout, or --cycle',
            ExitCode.GENERAL_ERROR
          );
        }
      }

      const fetchOptions = {
        limit: parseLimit(options.limit),
        all: options.all,
        start: options.start,
        end: options.end,
        nextToken: options.nextToken,
      };

      const result = types.length === 0
        ? await fetchAllTypes(date, fetchOptions)
        : await fetchData(types, date, fetchOptions);

      output(result, Boolean(options.pretty));
    } catch (error) {
      handleError(error);
    }
  });
