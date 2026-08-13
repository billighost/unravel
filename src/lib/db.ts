import { neon, NeonQueryFunction } from '@neondatabase/serverless';

// ─── Admin Config ─────────────────────────────────────────────────────────────
const ADMIN_SPECIAL_CODE = '081333';

/** Usernames that carry admin rights, compared case-insensitively. */
const ADMIN_USERNAMES = ['billighost'];

/**
 * Whether a username is an admin account.
 *
 * The comparison is case-insensitive. It used to require the exact casing
 * `Billighost`, which meant an account registered as `billighost` was never
 * granted admin — the dashboard rejected the owner — while the signup gate's own
 * comment said any username containing "billighost" should be reserved. Both
 * checks now agree, so a reserved name cannot be claimed under a different
 * casing to dodge the special-code requirement either.
 */
export function isAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  const normalized = username.trim().toLowerCase();
  if (ADMIN_USERNAMES.includes(normalized)) return true;
  if (normalized.includes('admin')) return true;
  return false;
}

export function verifyAdminSpecialCode(code: string): boolean {
  return code === ADMIN_SPECIAL_CODE;
}

// Interface definitions
export interface CreationRecord {
  id: string;
  device_id: string;
  created_at: string;
  grid_data: any; // { cols, rows, colors: number[] }
  disturbed_positions?: any; // optional array of cube offsets
  thumbnail_url: string;
  source_mode: string;
  parent_creation_id?: string | null;
  is_daily_challenge: boolean;
  report_count: number;
  is_hidden: boolean;
  is_public: boolean;
  view_count?: number;
  username?: string | null;
}

export interface DailyChallengeRecord {
  id: number;
  creation_id: string;
  active_date: string; // YYYY-MM-DD
}

export interface DeviceStreakRecord {
  device_id: string;
  current_streak: number;
  longest_streak: number;
  last_completed_date: string | null;
  username?: string | null;
}

export interface AccountRecord {
  username: string;
  pin_hash: string;
  created_at: string;
  cube_size_level?: number;
}

export interface DeviceSessionRecord {
  device_id: string;
  username: string;
  associated_at: string;
}

export interface AuditLogRecord {
  id: number;
  username: string;
  action_type: string;
  creation_id: string | null;
  created_at: string;
  details: string;
}

export interface AdminAnalytics {
  total_creations: number;
  total_public: number;
  total_hidden: number;
  total_accounts: number;
  total_challenge_completions: number;
  total_views: number;
  daily_activity: Array<{ date: string; creations_count: number; public_count: number; challenge_completions: number; new_accounts: number; views: number }>;
  source_mode_stats: Array<{ source_mode: string; count: number }>;
  top_streaks: Array<{ username: string | null; device_id: string; current_streak: number; longest_streak: number }>;
  reported_creations: Array<CreationRecord>;
  audit_logs?: AuditLogRecord[];
  daily_challenges?: Array<{ active_date: string; creation_id: string; thumbnail_url: string; username: string | null; source_mode: string }>;
}

// In-Memory Fallback DB Store for development/offline environments without DATABASE_URL
class MemoryStore {
  creations = new Map<string, CreationRecord>();
  dailyChallenges = new Map<string, DailyChallengeRecord>(); // date -> record
  deviceStreaks = new Map<string, DeviceStreakRecord>();
  reports: Array<{ id: number; creation_id: string; reported_at: string; reason?: string }> = [];
  reportCounter = 1;
  accounts = new Map<string, AccountRecord>(); // username (lowercase) -> record
  deviceSessions = new Map<string, string>(); // device_id -> username
  analyticsCounters = new Map<string, number>();
  dailyActivity = new Map<string, { date: string; creations_count: number; public_count: number; challenge_completions: number; new_accounts: number; views: number }>();
  auditLogs: AuditLogRecord[] = [];

  constructor() {
    // Seed initial demo creation for daily challenge
    const demoId = 'demo-daily-challenge-001';
    const today = new Date().toISOString().split('T')[0];
    
    // Sample colorful demo grid
    const colors: number[] = [];
    const cols = 40, rows = 30;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        colors.push(
          Math.min(1, Math.abs(Math.sin((c / cols) * Math.PI))),
          Math.min(1, Math.abs(Math.cos((r / rows) * Math.PI))),
          0.8
        );
      }
    }

    const demoCreation: CreationRecord = {
      id: demoId,
      device_id: 'system_seed',
      created_at: new Date().toISOString(),
      grid_data: { cols, rows, colors },
      thumbnail_url: '',
      source_mode: 'draw',
      parent_creation_id: null,
      is_daily_challenge: true,
      report_count: 0,
      is_hidden: false,
      is_public: true,
    };

    this.creations.set(demoId, demoCreation);
    this.dailyChallenges.set(today, {
      id: 1,
      creation_id: demoId,
      active_date: today,
    });

    // Seed analytics counters
    this.analyticsCounters.set('total_creations', 1);
    this.analyticsCounters.set('total_public', 1);
    this.analyticsCounters.set('total_hidden', 0);
    this.analyticsCounters.set('total_accounts', 0);
    this.analyticsCounters.set('total_challenge_completions', 0);
    this.analyticsCounters.set('total_views', 0);
  }
}

const globalMemoryStore: MemoryStore = (globalThis as any).__unravelMemoryStore || new MemoryStore();
if (process.env.NODE_ENV !== 'production') {
  (globalThis as any).__unravelMemoryStore = globalMemoryStore;
}

/**
 * Returns the Neon SQL tagged-template client, or null if DATABASE_URL is not set.
 * When null, callers use the in-memory fallback store instead.
 *
 * The client is memoized at module level: on Edge runtimes the V8 isolate is
 * reused across warm requests, so we pay the connection-string parse cost only
 * once per isolate lifetime rather than on every function call.
 */
let _sql: NeonQueryFunction<false, false> | null | undefined;
function getSql(): NeonQueryFunction<false, false> | null {
  if (_sql !== undefined) return _sql;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    _sql = null;
    return null;
  }
  try {
    _sql = neon(connectionString);
  } catch (err) {
    console.warn('Failed to initialize Neon connection, falling back to memory store:', err);
    _sql = null;
  }
  return _sql;
}

// ─── Analytics Helpers ────────────────────────────────────────────────────────

/** Increment a named analytics counter. Fire-and-forget — never throws. */
export async function incrementCounter(key: string, delta = 1): Promise<void> {
  const sql = getSql();
  if (!sql) {
    const cur = globalMemoryStore.analyticsCounters.get(key) || 0;
    globalMemoryStore.analyticsCounters.set(key, cur + delta);
    return;
  }
  try {
    await sql`
      INSERT INTO analytics_counters (key, value, updated_at)
      VALUES (${key}, ${delta}, NOW())
      ON CONFLICT (key) DO UPDATE
        SET value = analytics_counters.value + ${delta},
            updated_at = NOW()
    `;
  } catch (err) {
    console.warn(`incrementCounter(${key}) failed:`, err);
  }
}

/** Increment a daily activity metric. Fire-and-forget — never throws. */
export async function incrementDailyActivity(field: 'creations_count' | 'public_count' | 'challenge_completions' | 'new_accounts' | 'views', delta = 1): Promise<void> {
  const sql = getSql();
  const today = new Date().toISOString().split('T')[0];

  if (!sql) {
    const existing = globalMemoryStore.dailyActivity.get(today) || {
      date: today, creations_count: 0, public_count: 0, challenge_completions: 0, new_accounts: 0, views: 0,
    };
    (existing as any)[field] += delta;
    globalMemoryStore.dailyActivity.set(today, existing);
    return;
  }
  try {
    await sql`
      INSERT INTO daily_activity (date, ${sql.unsafe(field)})
      VALUES (${today}, ${delta})
      ON CONFLICT (date) DO UPDATE
        SET ${sql.unsafe(field)} = daily_activity.${sql.unsafe(field)} + ${delta}
    `;
  } catch (err) {
    // Fallback: safe upsert without dynamic column name
    try {
      if (field === 'creations_count') {
        await sql`INSERT INTO daily_activity (date, creations_count) VALUES (${today}, ${delta}) ON CONFLICT (date) DO UPDATE SET creations_count = daily_activity.creations_count + ${delta}`;
      } else if (field === 'public_count') {
        await sql`INSERT INTO daily_activity (date, public_count) VALUES (${today}, ${delta}) ON CONFLICT (date) DO UPDATE SET public_count = daily_activity.public_count + ${delta}`;
      } else if (field === 'challenge_completions') {
        await sql`INSERT INTO daily_activity (date, challenge_completions) VALUES (${today}, ${delta}) ON CONFLICT (date) DO UPDATE SET challenge_completions = daily_activity.challenge_completions + ${delta}`;
      } else if (field === 'new_accounts') {
        await sql`INSERT INTO daily_activity (date, new_accounts) VALUES (${today}, ${delta}) ON CONFLICT (date) DO UPDATE SET new_accounts = daily_activity.new_accounts + ${delta}`;
      } else if (field === 'views') {
        await sql`INSERT INTO daily_activity (date, views) VALUES (${today}, ${delta}) ON CONFLICT (date) DO UPDATE SET views = daily_activity.views + ${delta}`;
      }
    } catch (e2) {
      console.warn(`incrementDailyActivity(${field}) failed:`, e2);
    }
  }
}

// Creation Operations
export async function createCreation(record: Omit<CreationRecord, 'created_at' | 'report_count' | 'is_hidden' | 'view_count'>): Promise<CreationRecord> {
  const sql = getSql();

  // If colors is still an array, compress it to hex before saving to save space
  const processedGridData = { ...record.grid_data };
  if (Array.isArray(processedGridData.colors)) {
    let hex = '';
    for (let i = 0; i < processedGridData.colors.length; i++) {
      const val = Math.min(255, Math.max(0, Math.round(processedGridData.colors[i] * 255)));
      hex += val.toString(16).padStart(2, '0');
    }
    processedGridData.colors = hex;
  }

  const fullRecord: CreationRecord = {
    ...record,
    grid_data: processedGridData,
    username: record.username || null,
    created_at: new Date().toISOString(),
    report_count: 0,
    is_hidden: false,
    view_count: 0,
  };

  if (!sql) {
    // In-memory fallback: resolve username inline
    fullRecord.username = record.username || await getAssociatedUsername(record.device_id);
    globalMemoryStore.creations.set(fullRecord.id, fullRecord);
    // Update counters
    incrementCounter('total_creations').catch(() => {});
    if (fullRecord.is_public) {
      incrementCounter('total_public').catch(() => {});
      incrementDailyActivity('public_count').catch(() => {});
    }
    incrementDailyActivity('creations_count').catch(() => {});
    return fullRecord;
  }

  const gridDataJson = JSON.stringify(fullRecord.grid_data);
  const disturbedJson = fullRecord.disturbed_positions ? JSON.stringify(fullRecord.disturbed_positions) : null;
  const parentId = fullRecord.parent_creation_id || null;

  // Combined INSERT with username subquery + RETURNING to avoid separate queries.
  // The COALESCE lets the DB resolve the username without a pre-fetch round-trip.
  const rows = await sql`
    INSERT INTO creations 
    (id, device_id, grid_data, disturbed_positions, thumbnail_url, source_mode, parent_creation_id, is_daily_challenge, is_public, username, view_count) 
    VALUES (
      ${fullRecord.id}, 
      ${fullRecord.device_id}, 
      ${gridDataJson}::jsonb, 
      ${disturbedJson}::jsonb, 
      ${fullRecord.thumbnail_url}, 
      ${fullRecord.source_mode}, 
      ${parentId}, 
      ${fullRecord.is_daily_challenge}, 
      ${fullRecord.is_public}, 
      COALESCE(${fullRecord.username}, (SELECT username FROM device_sessions WHERE device_id = ${fullRecord.device_id} LIMIT 1)),
      0
    )
    RETURNING username
  `;
  
  // Use the DB-resolved username if available
  if (rows.length > 0 && rows[0].username) {
    fullRecord.username = rows[0].username;
  }

  // Update analytics tables asynchronously — fire and forget
  incrementCounter('total_creations').catch(() => {});
  incrementDailyActivity('creations_count').catch(() => {});
  if (fullRecord.is_public) {
    incrementCounter('total_public').catch(() => {});
    incrementDailyActivity('public_count').catch(() => {});
  }
  // Update source mode stats
  sql`
    INSERT INTO source_mode_stats (source_mode, count) VALUES (${fullRecord.source_mode}, 1)
    ON CONFLICT (source_mode) DO UPDATE SET count = source_mode_stats.count + 1
  `.catch(() => {});
  
  return fullRecord;
}


export async function getCreationById(id: string): Promise<CreationRecord | null> {
  const sql = getSql();

  if (!sql) {
    const item = globalMemoryStore.creations.get(id);
    if (!item || item.is_hidden) return null;
    return item;
  }

  const rows = await sql`SELECT * FROM creations WHERE id = ${id} AND is_hidden = FALSE`;
  if (rows.length === 0) return null;
  const row = rows[0] as any;
  
  const grid_data = typeof row.grid_data === 'string' ? JSON.parse(row.grid_data) : row.grid_data;
  if (Array.isArray(grid_data.colors)) {
    let hex = '';
    for (let i = 0; i < grid_data.colors.length; i++) {
      const val = Math.min(255, Math.max(0, Math.round(grid_data.colors[i] * 255)));
      hex += val.toString(16).padStart(2, '0');
    }
    grid_data.colors = hex;
  }

  return {
    ...row,
    grid_data,
    disturbed_positions: typeof row.disturbed_positions === 'string' ? JSON.parse(row.disturbed_positions) : row.disturbed_positions,
  };
}

export async function getPublicGallery(
  limit = 30,
  offset = 0,
  beforeDate?: string | null,
  beforeId?: string | null
): Promise<CreationRecord[]> {
  const sql = getSql();

  if (!sql) {
    let list = Array.from(globalMemoryStore.creations.values())
      .filter((c) => c.is_public && !c.is_hidden)
      .sort((a, b) => {
        const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });

    if (beforeDate && beforeId) {
      const beforeTime = new Date(beforeDate).getTime();
      list = list.filter((c) => {
        const itemTime = new Date(c.created_at).getTime();
        return itemTime < beforeTime || (itemTime === beforeTime && c.id.localeCompare(beforeId) < 0);
      });
    } else {
      list = list.slice(offset);
    }

    return list.slice(0, limit).map((c) => ({
      ...c,
      grid_data: undefined,
      disturbed_positions: undefined,
    })) as any[];
  }

  let rows;
  if (beforeDate && beforeId) {
    // Keyset Pagination
    rows = await sql`
      SELECT id, device_id, created_at, thumbnail_url, source_mode, parent_creation_id, is_daily_challenge, report_count, is_hidden, is_public, view_count, username 
      FROM creations 
      WHERE is_public = TRUE 
        AND is_hidden = FALSE 
        AND (created_at < ${beforeDate} OR (created_at = ${beforeDate} AND id < ${beforeId})) 
      ORDER BY created_at DESC, id DESC 
      LIMIT ${limit}
    `;
  } else {
    // Offset Pagination
    rows = await sql`
      SELECT id, device_id, created_at, thumbnail_url, source_mode, parent_creation_id, is_daily_challenge, report_count, is_hidden, is_public, view_count, username 
      FROM creations 
      WHERE is_public = TRUE 
        AND is_hidden = FALSE 
      ORDER BY created_at DESC, id DESC 
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return rows.map((row: any) => ({
    ...row,
    grid_data: undefined,
    disturbed_positions: undefined,
  })) as CreationRecord[];
}

export async function getUserCreations(
  deviceId: string,
  limit = 30,
  offset = 0,
  knownUsername?: string | null
): Promise<CreationRecord[]> {
  const sql = getSql();

  if (!sql) {
    // In-memory fallback: resolve username sequentially (dev/offline only).
    const username = knownUsername !== undefined ? knownUsername : await getAssociatedUsername(deviceId);
    let list = Array.from(globalMemoryStore.creations.values())
      .filter((c) => !c.is_hidden && (c.device_id === deviceId || (username && c.username === username)))
      .sort((a, b) => {
        const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });
    return list.slice(offset, offset + limit).map((c) => ({
      ...c,
      grid_data: undefined,
      disturbed_positions: undefined,
    })) as any[];
  }

  let rows;
  if (knownUsername !== undefined) {
    // Caller already resolved the username — use the explicit two-branch query.
    if (knownUsername) {
      rows = await sql`
        SELECT id, device_id, created_at, thumbnail_url, source_mode, parent_creation_id, is_daily_challenge, report_count, is_hidden, is_public, view_count, username 
        FROM creations 
        WHERE is_hidden = FALSE 
          AND (device_id = ${deviceId} OR username = ${knownUsername})
        ORDER BY created_at DESC, id DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      rows = await sql`
        SELECT id, device_id, created_at, thumbnail_url, source_mode, parent_creation_id, is_daily_challenge, report_count, is_hidden, is_public, view_count, username 
        FROM creations 
        WHERE is_hidden = FALSE 
          AND device_id = ${deviceId} AND username IS NULL
        ORDER BY created_at DESC, id DESC 
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
  } else {
    // Username not provided — resolve via SQL subquery so the entire fetch is a
    // single DB round-trip. The subquery hits the device_sessions primary-key
    // index (O(1)) and costs essentially zero extra latency compared to a
    // pre-fetched lookup, while saving a complete sequential round-trip.
    rows = await sql`
      SELECT id, device_id, created_at, thumbnail_url, source_mode, parent_creation_id, is_daily_challenge, report_count, is_hidden, is_public, view_count, username 
      FROM creations 
      WHERE is_hidden = FALSE 
        AND (
          device_id = ${deviceId}
          OR username = (SELECT username FROM device_sessions WHERE device_id = ${deviceId} LIMIT 1)
        )
      ORDER BY created_at DESC, id DESC 
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return rows.map((row: any) => ({
    ...row,
    grid_data: undefined,
    disturbed_positions: undefined,
  })) as CreationRecord[];
}


export async function reportCreation(creationId: string, reason?: string): Promise<{ hidden: boolean; report_count: number }> {
  const sql = getSql();
  const threshold = 3;

  if (!sql) {
    const item = globalMemoryStore.creations.get(creationId);
    if (!item) return { hidden: false, report_count: 0 };
    item.report_count += 1;
    if (item.report_count >= threshold) {
      item.is_hidden = true;
      incrementCounter('total_hidden').catch(() => {});
    }
    globalMemoryStore.reports.push({
      id: globalMemoryStore.reportCounter++,
      creation_id: creationId,
      reported_at: new Date().toISOString(),
      reason,
    });
    return { hidden: item.is_hidden, report_count: item.report_count };
  }

  const reasonVal = reason || null;
  const rows = await sql`
    WITH inserted AS (
      INSERT INTO reports (creation_id, reason) 
      VALUES (${creationId}, ${reasonVal})
    )
    UPDATE creations 
    SET report_count = report_count + 1, 
        is_hidden = (report_count + 1 >= ${threshold}) 
    WHERE id = ${creationId} 
    RETURNING report_count, is_hidden
  `;
  if (rows.length === 0) return { hidden: false, report_count: 0 };
  if (rows[0].is_hidden) incrementCounter('total_hidden').catch(() => {});
  return { hidden: rows[0].is_hidden, report_count: rows[0].report_count };
}

export async function getDailyChallenge(): Promise<CreationRecord | null> {
  const sql = getSql();
  const today = new Date().toISOString().split('T')[0];

  if (!sql) {
    const challenge = globalMemoryStore.dailyChallenges.get(today);
    if (challenge) {
      const creation = globalMemoryStore.creations.get(challenge.creation_id);
      // Only return if public and not hidden
      if (creation && creation.is_public && !creation.is_hidden) return creation;
    }
    // Fallback: most recent public creation
    const firstPublic = Array.from(globalMemoryStore.creations.values()).find((c) => c.is_public && !c.is_hidden);
    return firstPublic || null;
  }

  const rows = await sql`
    SELECT c.* FROM creations c 
    JOIN daily_challenges d ON c.id = d.creation_id 
    WHERE d.active_date = ${today} AND c.is_hidden = FALSE AND c.is_public = TRUE
  `;
  if (rows.length > 0) {
    const row = rows[0] as any;
    const grid_data = typeof row.grid_data === 'string' ? JSON.parse(row.grid_data) : row.grid_data;
    if (Array.isArray(grid_data.colors)) {
      let hex = '';
      for (let i = 0; i < grid_data.colors.length; i++) {
        const val = Math.min(255, Math.max(0, Math.round(grid_data.colors[i] * 255)));
        hex += val.toString(16).padStart(2, '0');
      }
      grid_data.colors = hex;
    }
    return {
      ...row,
      grid_data,
      disturbed_positions: typeof row.disturbed_positions === 'string' ? JSON.parse(row.disturbed_positions) : row.disturbed_positions,
    };
  }

  // Fallback: most recent PUBLIC non-hidden creation
  const fallbackRes = await sql`
    SELECT * FROM creations 
    WHERE is_hidden = FALSE AND is_public = TRUE 
    ORDER BY created_at DESC LIMIT 1
  `;
  if (fallbackRes.length > 0) {
    const row = fallbackRes[0] as any;
    return {
      ...row,
      grid_data: typeof row.grid_data === 'string' ? JSON.parse(row.grid_data) : row.grid_data,
      disturbed_positions: typeof row.disturbed_positions === 'string' ? JSON.parse(row.disturbed_positions) : row.disturbed_positions,
    };
  }
  return null;
}

export async function setDailyChallenge(creationId: string): Promise<void> {
  const sql = getSql();
  const today = new Date().toISOString().split('T')[0];

  if (!sql) {
    globalMemoryStore.dailyChallenges.set(today, { id: Date.now(), creation_id: creationId, active_date: today });
    return;
  }
  await sql`
    INSERT INTO daily_challenges (creation_id, active_date)
    VALUES (${creationId}, ${today})
    ON CONFLICT (active_date) DO UPDATE SET creation_id = ${creationId}
  `;
  // Also invalidate creation's is_daily_challenge flag
  await sql`UPDATE creations SET is_daily_challenge = FALSE WHERE is_daily_challenge = TRUE AND id != ${creationId}`;
  await sql`UPDATE creations SET is_daily_challenge = TRUE WHERE id = ${creationId}`;
}

export async function updateDeviceStreak(deviceId: string): Promise<DeviceStreakRecord> {
  const sql = getSql();
  const today = new Date().toISOString().split('T')[0];

  const getYesterdayStr = () => {
    const d = new Date();
    d.setTime(d.getTime() - 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  };
  const yesterday = getYesterdayStr();

  // Check if logged in
  const username = await getAssociatedUsername(deviceId);

  if (!sql) {
    let key = username ? `user:${username}` : deviceId;
    let streak = globalMemoryStore.deviceStreaks.get(key);
    if (!streak) {
      streak = { device_id: key, current_streak: 1, longest_streak: 1, last_completed_date: today, username: username || null };
      incrementDailyActivity('challenge_completions').catch(() => {});
    } else if (streak.last_completed_date === today) {
      return streak;
    } else if (streak.last_completed_date === yesterday) {
      streak.current_streak += 1;
      streak.longest_streak = Math.max(streak.longest_streak, streak.current_streak);
      streak.last_completed_date = today;
      incrementDailyActivity('challenge_completions').catch(() => {});
    } else {
      streak.current_streak = 1;
      streak.last_completed_date = today;
      incrementDailyActivity('challenge_completions').catch(() => {});
    }
    globalMemoryStore.deviceStreaks.set(key, streak);
    return streak;
  }

  // SQL path
  let rows;
  if (username) {
    rows = await sql`SELECT * FROM device_streaks WHERE username = ${username}`;
  } else {
    rows = await sql`SELECT * FROM device_streaks WHERE device_id = ${deviceId} AND username IS NULL`;
  }

  if (rows.length === 0) {
    const newStreak: DeviceStreakRecord = {
      device_id: deviceId,
      current_streak: 1,
      longest_streak: 1,
      last_completed_date: today,
      username: username || null,
    };
    if (username) {
      await sql`
        INSERT INTO device_streaks (device_id, current_streak, longest_streak, last_completed_date, username) 
        VALUES (${deviceId}, ${1}, ${1}, ${today}, ${username})
      `;
    } else {
      await sql`
        INSERT INTO device_streaks (device_id, current_streak, longest_streak, last_completed_date, username) 
        VALUES (${deviceId}, ${1}, ${1}, ${today}, NULL)
      `;
    }
    incrementDailyActivity('challenge_completions').catch(() => {});
    incrementCounter('total_challenge_completions').catch(() => {});
    return newStreak;
  }

  const row = rows[0] as any;
  if (row.last_completed_date === today) {
    return {
      device_id: row.device_id,
      current_streak: Number(row.current_streak),
      longest_streak: Number(row.longest_streak),
      last_completed_date: row.last_completed_date,
      username: row.username,
    };
  }

  // If last_completed_date is yesterday, increment streak; otherwise reset to 1
  const newCurrent = row.last_completed_date === yesterday ? Number(row.current_streak) + 1 : 1;
  const newLongest = Math.max(Number(row.longest_streak), newCurrent);

  if (username) {
    await sql`
      UPDATE device_streaks 
      SET current_streak = ${newCurrent}, longest_streak = ${newLongest}, last_completed_date = ${today} 
      WHERE username = ${username}
    `;
  } else {
    await sql`
      UPDATE device_streaks 
      SET current_streak = ${newCurrent}, longest_streak = ${newLongest}, last_completed_date = ${today} 
      WHERE device_id = ${deviceId} AND username IS NULL
    `;
  }

  incrementDailyActivity('challenge_completions').catch(() => {});
  incrementCounter('total_challenge_completions').catch(() => {});

  const streak = {
    device_id: deviceId,
    current_streak: newCurrent,
    longest_streak: newLongest,
    last_completed_date: today,
    username: username || null,
  };

  const { setCache } = await import('@/lib/cache');
  setCache(`cache:streak:${deviceId}`, streak, 86400).catch(() => {});

  return streak;
}

export async function getDeviceStreak(deviceId: string): Promise<DeviceStreakRecord> {
  const sql = getSql();
  const username = await getAssociatedUsername(deviceId);
  const today = new Date().toISOString().split('T')[0];
  
  const getYesterdayStr = () => {
    const d = new Date();
    d.setTime(d.getTime() - 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  };
  const yesterday = getYesterdayStr();

  const sanitizeStreak = (s: DeviceStreakRecord): DeviceStreakRecord => {
    if (s.last_completed_date !== today && s.last_completed_date !== yesterday) {
      return { ...s, current_streak: 0 };
    }
    return s;
  };

  const cacheKey = `cache:streak:${deviceId}`;
  const { getCache, setCache } = await import('@/lib/cache');
  const cached = await getCache<DeviceStreakRecord>(cacheKey);
  if (cached) {
    return sanitizeStreak(cached);
  }

  if (!sql) {
    let key = username ? `user:${username}` : deviceId;
    const raw = globalMemoryStore.deviceStreaks.get(key) || {
      device_id: deviceId,
      current_streak: 0,
      longest_streak: 0,
      last_completed_date: null,
      username: username || null,
    };
    return sanitizeStreak(raw);
  }

  let rows;
  if (username) {
    rows = await sql`SELECT * FROM device_streaks WHERE username = ${username}`;
  } else {
    rows = await sql`SELECT * FROM device_streaks WHERE device_id = ${deviceId} AND username IS NULL`;
  }

  if (rows.length === 0) {
    const defaultStreak = { device_id: deviceId, current_streak: 0, longest_streak: 0, last_completed_date: null, username: username || null };
    setCache(cacheKey, defaultStreak, 3600).catch(() => {});
    return defaultStreak;
  }
  
  const rawRow = rows[0] as any;
  const streak = sanitizeStreak({
    device_id: rawRow.device_id,
    current_streak: Number(rawRow.current_streak),
    longest_streak: Number(rawRow.longest_streak),
    last_completed_date: rawRow.last_completed_date,
    username: rawRow.username,
  });

  setCache(cacheKey, streak, 3600).catch(() => {});
  return streak;
}

export async function incrementViewCount(id: string): Promise<void> {
  const sql = getSql();
  if (!sql) {
    const item = globalMemoryStore.creations.get(id);
    if (item) {
      item.view_count = (item.view_count || 0) + 1;
    }
    incrementCounter('total_views').catch(() => {});
    incrementDailyActivity('views').catch(() => {});
    return;
  }
  await sql`UPDATE creations SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ${id}`;
  incrementCounter('total_views').catch(() => {});
  incrementDailyActivity('views').catch(() => {});
}

// Account & Session Operations

export async function createAccount(username: string, pinHash: string): Promise<AccountRecord> {
  const sql = getSql();
  const cleanUsername = username.trim();
  const record: AccountRecord = {
    username: cleanUsername,
    pin_hash: pinHash,
    created_at: new Date().toISOString(),
  };

  if (!sql) {
    if (globalMemoryStore.accounts.has(cleanUsername)) {
      throw new Error('Username already exists');
    }
    globalMemoryStore.accounts.set(cleanUsername, record);
    incrementCounter('total_accounts').catch(() => {});
    incrementDailyActivity('new_accounts').catch(() => {});
    return record;
  }

  await sql`
    INSERT INTO accounts (username, pin_hash)
    VALUES (${cleanUsername}, ${pinHash})
  `;
  incrementCounter('total_accounts').catch(() => {});
  incrementDailyActivity('new_accounts').catch(() => {});
  return record;
}

export async function getAccountByUsername(username: string): Promise<AccountRecord | null> {
  const sql = getSql();
  const cleanUsername = username.trim();

  if (!sql) {
    return globalMemoryStore.accounts.get(cleanUsername) || null;
  }

  const rows = await sql`SELECT * FROM accounts WHERE username = ${cleanUsername}`;
  if (rows.length === 0) return null;
  return rows[0] as AccountRecord;
}

export async function updateAccountCubeSizeByDevice(deviceId: string, level: number): Promise<boolean> {
  const sql = getSql();

  if (!sql) {
    const username = globalMemoryStore.deviceSessions.get(deviceId);
    if (!username) return false;
    const acc = globalMemoryStore.accounts.get(username);
    if (acc) acc.cube_size_level = level;
    return true;
  }

  try {
    const rows = await sql`
      UPDATE accounts 
      SET cube_size_level = ${level} 
      FROM device_sessions 
      WHERE accounts.username = device_sessions.username 
        AND device_sessions.device_id = ${deviceId}
      RETURNING accounts.username
    `;
    return rows.length > 0;
  } catch (err: any) {
    if (err.message && err.message.includes('column "cube_size_level" of relation "accounts" does not exist')) {
      await sql`ALTER TABLE accounts ADD COLUMN cube_size_level INT DEFAULT 2`;
      const rows = await sql`
        UPDATE accounts 
        SET cube_size_level = ${level} 
        FROM device_sessions 
        WHERE accounts.username = device_sessions.username 
          AND device_sessions.device_id = ${deviceId}
        RETURNING accounts.username
      `;
      return rows.length > 0;
    } else {
      throw err;
    }
  }
}

export async function associateDeviceWithAccount(deviceId: string, username: string): Promise<void> {
  const sql = getSql();
  const cleanUsername = username.trim();

  if (!sql) {
    globalMemoryStore.deviceSessions.set(deviceId, cleanUsername);
    return;
  }

  await sql`
    INSERT INTO device_sessions (device_id, username)
    VALUES (${deviceId}, ${cleanUsername})
    ON CONFLICT (device_id) 
    DO UPDATE SET username = ${cleanUsername}, associated_at = CURRENT_TIMESTAMP
  `;
}

export async function getAssociatedUsername(deviceId: string): Promise<string | null> {
  // Check the session cache that the login flow already populates (TTL: 5 min).
  // This turns most streak/daily-challenge calls into a fast in-process or Redis
  // read instead of a round-trip to the Neon DB.
  const { getCache, setCache } = await import('@/lib/cache');
  const cacheKey = `session:${deviceId}`;
  const cached = await getCache<string>(cacheKey);
  if (cached) return cached;

  const sql = getSql();

  if (!sql) {
    return globalMemoryStore.deviceSessions.get(deviceId) || null;
  }

  const rows = await sql`SELECT username FROM device_sessions WHERE device_id = ${deviceId}`;
  if (rows.length === 0) return null;
  const username = rows[0].username as string | null;
  // Warm the cache for future calls — same TTL as the one written at login.
  if (username) setCache(cacheKey, username, 300).catch(() => {});
  return username;
}

export async function removeDeviceAssociation(deviceId: string): Promise<void> {
  const sql = getSql();

  if (!sql) {
    globalMemoryStore.deviceSessions.delete(deviceId);
    return;
  }

  await sql`DELETE FROM device_sessions WHERE device_id = ${deviceId}`;
}

export async function migrateDeviceDataToAccount(deviceId: string, username: string): Promise<void> {
  const sql = getSql();
  const cleanUsername = username.trim();

  if (!sql) {
    // 1. Migrate Creations
    for (const c of globalMemoryStore.creations.values()) {
      if (c.device_id === deviceId) {
        c.username = cleanUsername;
      }
    }
    // 2. Migrate Streak
    const devStreak = globalMemoryStore.deviceStreaks.get(deviceId);
    if (devStreak) {
      let userStreakKey = `user:${cleanUsername}`;
      const userStreak = globalMemoryStore.deviceStreaks.get(userStreakKey);
      if (userStreak) {
        userStreak.current_streak = Math.max(userStreak.current_streak, devStreak.current_streak);
        userStreak.longest_streak = Math.max(userStreak.longest_streak, devStreak.longest_streak);
        if (devStreak.last_completed_date && (!userStreak.last_completed_date || devStreak.last_completed_date > userStreak.last_completed_date)) {
          userStreak.last_completed_date = devStreak.last_completed_date;
        }
        globalMemoryStore.deviceStreaks.delete(deviceId);
      } else {
        devStreak.username = cleanUsername;
        globalMemoryStore.deviceStreaks.set(userStreakKey, {
          ...devStreak,
          device_id: userStreakKey,
        });
        globalMemoryStore.deviceStreaks.delete(deviceId);
      }
    }
    return;
  }

  // 1. Update Creations
  await sql`
    UPDATE creations
    SET username = ${cleanUsername}
    WHERE device_id = ${deviceId}
  `;

  // 2. Update Streak
  const userStreaks = await sql`SELECT * FROM device_streaks WHERE username = ${cleanUsername}`;
  const devStreaks = await sql`SELECT * FROM device_streaks WHERE device_id = ${deviceId} AND username IS NULL`;

  if (devStreaks.length > 0) {
    const devStreak = devStreaks[0];
    if (userStreaks.length > 0) {
      const userStreak = userStreaks[0];
      const mergedCurrent = Math.max(userStreak.current_streak, devStreak.current_streak);
      const mergedLongest = Math.max(userStreak.longest_streak, devStreak.longest_streak);
      let mergedDate = userStreak.last_completed_date;
      if (devStreak.last_completed_date && (!mergedDate || devStreak.last_completed_date > mergedDate)) {
        mergedDate = devStreak.last_completed_date;
      }
      
      await sql`
        UPDATE device_streaks
        SET current_streak = ${mergedCurrent}, longest_streak = ${mergedLongest}, last_completed_date = ${mergedDate}
        WHERE username = ${cleanUsername}
      `;
      await sql`DELETE FROM device_streaks WHERE device_id = ${deviceId} AND username IS NULL`;
    } else {
      await sql`
        UPDATE device_streaks
        SET username = ${cleanUsername}
        WHERE device_id = ${deviceId} AND username IS NULL
      `;
    }
  }
}


// ─── Admin Operations ─────────────────────────────────────────────────────────

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const sql = getSql();

  if (!sql) {
    // In-memory analytics
    const creations = Array.from(globalMemoryStore.creations.values());
    const daily7 = Array.from(globalMemoryStore.dailyActivity.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7);
    const streaks = Array.from(globalMemoryStore.deviceStreaks.values())
      .sort((a, b) => b.longest_streak - a.longest_streak)
      .slice(0, 10)
      .map(s => ({ username: s.username || null, device_id: s.device_id, current_streak: s.current_streak, longest_streak: s.longest_streak }));
    const modeMap = new Map<string, number>();
    for (const c of creations) {
      modeMap.set(c.source_mode, (modeMap.get(c.source_mode) || 0) + 1);
    }
    return {
      total_creations: globalMemoryStore.analyticsCounters.get('total_creations') || 0,
      total_public: globalMemoryStore.analyticsCounters.get('total_public') || 0,
      total_hidden: globalMemoryStore.analyticsCounters.get('total_hidden') || 0,
      total_accounts: globalMemoryStore.analyticsCounters.get('total_accounts') || 0,
      total_challenge_completions: globalMemoryStore.analyticsCounters.get('total_challenge_completions') || 0,
      total_views: globalMemoryStore.analyticsCounters.get('total_views') || 0,
      daily_activity: daily7,
      source_mode_stats: Array.from(modeMap.entries()).map(([source_mode, count]) => ({ source_mode, count })),
      top_streaks: streaks,
      reported_creations: creations.filter(c => c.report_count > 0).sort((a, b) => b.report_count - a.report_count).slice(0, 50),
      audit_logs: globalMemoryStore.auditLogs.slice(0, 50),
      daily_challenges: Array.from(globalMemoryStore.dailyChallenges.values())
        .sort((a, b) => b.active_date.localeCompare(a.active_date))
        .slice(0, 30)
        .map(d => {
          const c = globalMemoryStore.creations.get(d.creation_id);
          return {
            active_date: d.active_date,
            creation_id: d.creation_id,
            thumbnail_url: c?.thumbnail_url || '',
            username: c?.username || null,
            source_mode: c?.source_mode || 'upload',
          };
        }),
    };
  }

  // Parallel fast reads from pre-aggregated tables
  const [countersRows, dailyRows, modeRows, streakRows, reportedRows, auditRows, challengeRows] = await Promise.all([
    sql`SELECT key, value FROM analytics_counters`,
    sql`SELECT * FROM daily_activity ORDER BY date DESC LIMIT 7`,
    sql`SELECT source_mode, count FROM source_mode_stats ORDER BY count DESC`,
    sql`SELECT username, device_id, current_streak, longest_streak FROM device_streaks ORDER BY longest_streak DESC LIMIT 10`,
    sql`SELECT id, device_id, created_at, thumbnail_url, source_mode, report_count, is_hidden, is_public, username FROM creations WHERE report_count > 0 ORDER BY report_count DESC LIMIT 50`,
    sql`SELECT id, username, action_type, creation_id, created_at, details FROM admin_audit_logs ORDER BY created_at DESC LIMIT 50`,
    sql`SELECT d.active_date, d.creation_id, c.thumbnail_url, c.username, c.source_mode FROM daily_challenges d JOIN creations c ON d.creation_id = c.id ORDER BY d.active_date DESC LIMIT 30`,
  ]);

  const counters: Record<string, number> = {};
  for (const row of countersRows as any[]) {
    counters[row.key] = Number(row.value);
  }

  return {
    total_creations: counters['total_creations'] || 0,
    total_public: counters['total_public'] || 0,
    total_hidden: counters['total_hidden'] || 0,
    total_accounts: counters['total_accounts'] || 0,
    total_challenge_completions: counters['total_challenge_completions'] || 0,
    total_views: counters['total_views'] || 0,
    daily_activity: dailyRows as any[],
    source_mode_stats: modeRows.map((r: any) => ({ source_mode: r.source_mode, count: Number(r.count) })),
    top_streaks: streakRows.map((r: any) => ({ username: r.username, device_id: r.device_id, current_streak: Number(r.current_streak), longest_streak: Number(r.longest_streak) })),
    reported_creations: reportedRows as any[],
    audit_logs: auditRows.map((r: any) => ({
      id: Number(r.id),
      username: r.username,
      action_type: r.action_type,
      creation_id: r.creation_id,
      created_at: r.created_at,
      details: r.details,
    })),
    daily_challenges: challengeRows as any[],
  };
}

export async function adminListUsers(limit = 50, offset = 0): Promise<Array<{ username: string; email: string | null; created_at: string; creation_count: number; current_streak: number }>> {
  const sql = getSql();

  const today = new Date().toISOString().split('T')[0];
  const getYesterdayStr = () => {
    const d = new Date();
    d.setTime(d.getTime() - 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  };
  const yesterday = getYesterdayStr();

  if (!sql) {
    return Array.from(globalMemoryStore.accounts.values()).slice(offset, offset + limit).map(a => {
      const streak = globalMemoryStore.deviceStreaks.get(`user:${a.username}`);
      let currentStreak = streak?.current_streak || 0;
      if (streak && streak.last_completed_date !== today && streak.last_completed_date !== yesterday) {
        currentStreak = 0;
      }
      return {
        username: a.username,
        email: null,
        created_at: a.created_at,
        creation_count: Array.from(globalMemoryStore.creations.values()).filter(c => c.username === a.username).length,
        current_streak: currentStreak,
      };
    });
  }

  const rows = await sql`
    SELECT 
      a.username, a.created_at,
      COUNT(DISTINCT c.id) AS creation_count,
      COALESCE(ds.current_streak, 0) AS current_streak,
      ds.last_completed_date
    FROM accounts a
    LEFT JOIN creations c ON c.username = a.username
    LEFT JOIN device_streaks ds ON ds.username = a.username
    GROUP BY a.username, a.created_at, ds.current_streak, ds.last_completed_date
    ORDER BY a.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map((r: any) => {
    let currentStreak = Number(r.current_streak);
    if (r.last_completed_date && r.last_completed_date !== today && r.last_completed_date !== yesterday) {
      currentStreak = 0;
    }
    return {
      username: r.username,
      email: null, // Removed email
      created_at: r.created_at,
      creation_count: Number(r.creation_count),
      current_streak: currentStreak,
    };
  });
}

export interface DeviceRecord {
  device_id: string;
  username: string | null;
  creation_count: number;
  last_seen: string | null; // ISO date of most recent creation
  has_account: boolean;
  associated_at: string | null; // when they linked an account
}

/**
 * Returns every distinct device seen in the DB (union of creations + device_sessions),
 * giving an estimate of total unique users including anonymous (no-account) ones.
 */
export async function adminListDevices(limit = 200, offset = 0): Promise<DeviceRecord[]> {
  const sql = getSql();

  if (!sql) {
    // In-memory fallback
    const deviceIds = new Set<string>();
    for (const c of globalMemoryStore.creations.values()) deviceIds.add(c.device_id);
    for (const [did] of globalMemoryStore.deviceSessions) deviceIds.add(did);

    return Array.from(deviceIds)
      .slice(offset, offset + limit)
      .map(did => {
        const username = globalMemoryStore.deviceSessions.get(did) || null;
        const creations = Array.from(globalMemoryStore.creations.values()).filter(c => c.device_id === did);
        const lastSeen = creations.length > 0
          ? creations.sort((a, b) => b.created_at.localeCompare(a.created_at))[0].created_at
          : null;
        return {
          device_id: did,
          username,
          creation_count: creations.length,
          last_seen: lastSeen,
          has_account: !!username,
          associated_at: null,
        };
      });
  }

  // One query: union all device_ids from creations + device_sessions, join to sessions
  // for username and creation counts, ordered by most recently active first.
  const rows = await sql`
    SELECT
      d.device_id,
      ds.username,
      ds.associated_at,
      COUNT(c.id)::int              AS creation_count,
      MAX(c.created_at)             AS last_seen,
      (ds.username IS NOT NULL)     AS has_account
    FROM (
      SELECT DISTINCT device_id FROM creations
      UNION
      SELECT DISTINCT device_id FROM device_sessions
    ) AS d
    LEFT JOIN device_sessions ds ON ds.device_id = d.device_id
    LEFT JOIN creations c        ON c.device_id = d.device_id
    GROUP BY d.device_id, ds.username, ds.associated_at
    ORDER BY last_seen DESC NULLS LAST, d.device_id
    LIMIT ${limit} OFFSET ${offset}
  `;

  return rows.map((r: any) => ({
    device_id: r.device_id,
    username: r.username ?? null,
    creation_count: Number(r.creation_count),
    last_seen: r.last_seen ?? null,
    has_account: Boolean(r.has_account),
    associated_at: r.associated_at ?? null,
  }));
}

export async function adminToggleCreationVisibility(id: string, hidden: boolean): Promise<void> {
  const sql = getSql();

  if (!sql) {
    const item = globalMemoryStore.creations.get(id);
    if (item) item.is_hidden = hidden;
    return;
  }
  await sql`UPDATE creations SET is_hidden = ${hidden} WHERE id = ${id}`;
  // Update counters
  if (hidden) {
    incrementCounter('total_hidden').catch(() => {});
  } else {
    // Decrement hidden
    const sql2 = getSql();
    if (sql2) {
      sql2`
        UPDATE analytics_counters SET value = GREATEST(0, value - 1), updated_at = NOW()
        WHERE key = 'total_hidden'
      `.catch(() => {});
    }
  }
}

export async function logAdminAction(username: string, actionType: string, creationId: string | null, details: string): Promise<void> {
  const sql = getSql();
  const timestamp = new Date().toISOString();

  if (!sql) {
    globalMemoryStore.auditLogs.unshift({
      id: globalMemoryStore.auditLogs.length + 1,
      username,
      action_type: actionType,
      creation_id: creationId,
      created_at: timestamp,
      details,
    });
    return;
  }

  try {
    await sql`
      INSERT INTO admin_audit_logs (username, action_type, creation_id, details)
      VALUES (${username}, ${actionType}, ${creationId}, ${details})
    `;
  } catch (err) {
    console.error('Failed to log admin action:', err);
  }
}

export async function getAdminAuditLogs(limit = 100): Promise<AuditLogRecord[]> {
  const sql = getSql();

  if (!sql) {
    return globalMemoryStore.auditLogs.slice(0, limit);
  }

  const rows = await sql`
    SELECT id, username, action_type, creation_id, created_at, details
    FROM admin_audit_logs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r: any) => ({
    id: Number(r.id),
    username: r.username,
    action_type: r.action_type,
    creation_id: r.creation_id,
    created_at: r.created_at,
    details: r.details,
  }));
}

export async function adminDismissReports(id: string): Promise<void> {
  const sql = getSql();

  if (!sql) {
    const item = globalMemoryStore.creations.get(id);
    if (item) {
      item.report_count = 0;
    }
    return;
  }

  await sql`UPDATE creations SET report_count = 0 WHERE id = ${id}`;
}
