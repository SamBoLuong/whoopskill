export const BASE_URL = 'https://api.prod.whoop.com/developer';

export const ENDPOINTS = {
  profile: '/v2/user/profile/basic',
  body: '/v2/user/measurement/body',
  workoutCollection: '/v2/activity/workout',
  workoutById: (workoutId: string) => `/v2/activity/workout/${workoutId}`,
  sleepCollection: '/v2/activity/sleep',
  sleepById: (sleepId: string) => `/v2/activity/sleep/${sleepId}`,
  recoveryCollection: '/v2/recovery',
  recoveryByCycleId: (cycleId: number) => `/v2/cycle/${cycleId}/recovery`,
  cycleCollection: '/v2/cycle',
  cycleById: (cycleId: number) => `/v2/cycle/${cycleId}`,
  sleepByCycleId: (cycleId: number) => `/v2/cycle/${cycleId}/sleep`,
  activityMappingV1: (activityV1Id: number) => `/v1/activity-mapping/${activityV1Id}`,
  userAccess: '/v2/user/access',
} as const;
