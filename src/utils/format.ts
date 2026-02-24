import type { WhoopData, WhoopCycle, WhoopRecovery, WhoopSleep } from '../types/whoop.js';

function getRecovery(data: WhoopData): WhoopRecovery | undefined {
  return data.recovery?.find((r) => r.score_state === 'SCORED' && r.score) ?? data.recovery?.[0];
}

function getSleep(data: WhoopData): WhoopSleep | undefined {
  return data.sleep?.find((s) => !s.nap && s.score_state === 'SCORED' && s.score) ?? data.sleep?.[0];
}

function getCycle(data: WhoopData): WhoopCycle | undefined {
  return data.cycle?.find((c) => c.score_state === 'SCORED' && c.score) ?? data.cycle?.[0];
}

function sleepHours(sleep: WhoopSleep): number | null {
  const inBed = sleep.score?.stage_summary?.total_in_bed_time_milli;
  if (inBed == null) return null;
  return inBed / 3600000;
}

export function formatPretty(data: WhoopData): string {
  const lines: string[] = [];
  lines.push(`📅 ${data.date}`);
  lines.push('');

  if (data.profile) {
    lines.push(`👤 ${data.profile.first_name} ${data.profile.last_name}`);
  }

  if (data.body) {
    const b = data.body;
    lines.push(`📏 ${b.height_meter}m | ${b.weight_kilogram}kg | Max HR: ${b.max_heart_rate}`);
  }

  const recovery = getRecovery(data);
  if (recovery?.score) {
    const r = recovery.score;
    lines.push(`💚 Recovery: ${r.recovery_score.toFixed(0)}% | HRV: ${r.hrv_rmssd_milli.toFixed(1)}ms | RHR: ${r.resting_heart_rate.toFixed(0)}bpm`);
    if (r.spo2_percentage != null) {
      const skin = r.skin_temp_celsius != null ? r.skin_temp_celsius.toFixed(1) : 'n/a';
      lines.push(`   SpO2: ${r.spo2_percentage.toFixed(1)}% | Skin temp: ${skin}°C`);
    }
  } else if (recovery) {
    lines.push(`💚 Recovery: ${recovery.score_state}`);
  }

  const sleep = getSleep(data);
  if (sleep?.score) {
    const s = sleep.score;
    const hours = sleepHours(sleep);
    const perf = s.sleep_performance_percentage != null ? s.sleep_performance_percentage.toFixed(0) : 'n/a';
    const efficiency = s.sleep_efficiency_percentage != null ? s.sleep_efficiency_percentage.toFixed(0) : 'n/a';
    lines.push(`😴 Sleep: ${perf}% | ${hours != null ? hours.toFixed(1) : 'n/a'}h | Efficiency: ${efficiency}%`);
    lines.push(
      `   REM: ${(s.stage_summary.total_rem_sleep_time_milli / 60000).toFixed(0)}min | Deep: ${(s.stage_summary.total_slow_wave_sleep_time_milli / 60000).toFixed(0)}min`
    );
  } else if (sleep) {
    lines.push(`😴 Sleep: ${sleep.score_state}`);
  }

  if (data.workout?.length) {
    lines.push('🏋️ Workouts:');
    for (const w of data.workout) {
      if (w.score) {
        const sc = w.score;
        lines.push(
          `   ${w.sport_name}: Strain ${sc.strain.toFixed(1)} | Avg HR: ${sc.average_heart_rate} | ${(sc.kilojoule / 4.184).toFixed(0)} cal`
        );
      } else {
        lines.push(`   ${w.sport_name}: ${w.score_state}`);
      }
    }
  }

  const cycle = getCycle(data);
  if (cycle?.score) {
    const c = cycle.score;
    lines.push(`🔄 Day strain: ${c.strain.toFixed(1)} | ${(c.kilojoule / 4.184).toFixed(0)} cal | Avg HR: ${c.average_heart_rate}`);
  } else if (cycle) {
    lines.push(`🔄 Cycle: ${cycle.score_state}`);
  }

  if (data.pagination && Object.keys(data.pagination).length > 0) {
    lines.push('');
    lines.push('📄 More pages available:');
    for (const [metric, token] of Object.entries(data.pagination)) {
      lines.push(`   ${metric}: ${token}`);
    }
  }

  return lines.join('\n');
}

export function formatSummary(data: WhoopData): string {
  const parts: string[] = [];

  const recovery = getRecovery(data);
  if (recovery?.score) {
    const r = recovery.score;
    parts.push(`Recovery: ${r.recovery_score.toFixed(0)}%`);
    parts.push(`HRV: ${r.hrv_rmssd_milli.toFixed(0)}ms`);
    parts.push(`RHR: ${r.resting_heart_rate.toFixed(0)}`);
  } else if (recovery) {
    parts.push(`Recovery: ${recovery.score_state}`);
  }

  const sleep = getSleep(data);
  if (sleep?.score?.sleep_performance_percentage != null) {
    parts.push(`Sleep: ${sleep.score.sleep_performance_percentage.toFixed(0)}%`);
  } else if (sleep) {
    parts.push(`Sleep: ${sleep.score_state}`);
  }

  const cycle = getCycle(data);
  if (cycle?.score) {
    parts.push(`Strain: ${cycle.score.strain.toFixed(1)}`);
  } else if (cycle) {
    parts.push(`Strain: ${cycle.score_state}`);
  }

  if (data.workout?.length) {
    parts.push(`Workouts: ${data.workout.length}`);
  }

  return parts.length ? `${data.date} | ${parts.join(' | ')}` : `${data.date} | No data`;
}

function statusIcon(value: number, green: number, yellow: number, invert = false): string {
  if (invert) {
    return value <= green ? '🟢' : value <= yellow ? '🟡' : '🔴';
  }
  return value >= green ? '🟢' : value >= yellow ? '🟡' : '🔴';
}

export function formatSummaryColor(data: WhoopData): string {
  const lines: string[] = [`📅 ${data.date}`];

  const recovery = getRecovery(data);
  if (recovery?.score) {
    const r = recovery.score;
    const icon = statusIcon(r.recovery_score, 67, 34);
    lines.push(`${icon} Recovery: ${r.recovery_score.toFixed(0)}% | HRV: ${r.hrv_rmssd_milli.toFixed(0)}ms | RHR: ${r.resting_heart_rate.toFixed(0)}bpm`);
  } else if (recovery) {
    lines.push(`🟡 Recovery: ${recovery.score_state}`);
  }

  const sleep = getSleep(data);
  if (sleep?.score?.sleep_performance_percentage != null) {
    const score = sleep.score.sleep_performance_percentage;
    const icon = statusIcon(score, 85, 70);
    const hours = sleepHours(sleep);
    const efficiency = sleep.score.sleep_efficiency_percentage != null
      ? sleep.score.sleep_efficiency_percentage.toFixed(0)
      : 'n/a';
    lines.push(`${icon} Sleep: ${score.toFixed(0)}% | ${hours != null ? hours.toFixed(1) : 'n/a'}h | Efficiency: ${efficiency}%`);
  } else if (sleep) {
    lines.push(`🟡 Sleep: ${sleep.score_state}`);
  }

  const cycle = getCycle(data);
  if (cycle?.score) {
    const c = cycle.score;
    const recoveryScore = recovery?.score?.recovery_score ?? 50;
    const optimal = recoveryScore >= 67 ? 14 : recoveryScore >= 34 ? 10 : 6;
    const diff = Math.abs(c.strain - optimal);
    const icon = diff <= 2 ? '🟢' : diff <= 4 ? '🟡' : '🔴';
    lines.push(`${icon} Strain: ${c.strain.toFixed(1)} (optimal: ~${optimal}) | ${(c.kilojoule / 4.184).toFixed(0)} cal`);
  } else if (cycle) {
    lines.push(`🟡 Strain: ${cycle.score_state}`);
  }

  if (data.workout?.length) {
    lines.push(`🏋️ Workouts: ${data.workout.length} | ${data.workout.map((w) => w.sport_name).join(', ')}`);
  }

  return lines.join('\n');
}
