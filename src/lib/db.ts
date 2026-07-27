import { neon, NeonQueryFunction } from '@neondatabase/serverless';

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
}

export interface DeviceSessionRecord {
  device_id: string;
  username: string;
  associated_at: string;
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
  }
}

const globalMemoryStore: MemoryStore = (globalThis as any).__unravelMemoryStore || new MemoryStore();
if (process.env.NODE_ENV !== 'production') {
  (globalThis as any).__unravelMemoryStore = globalMemoryStore;
}

/**
 * Returns the Neon SQL tagged-template client, or null if DATABASE_URL is not set.
 * When null, callers use the in-memory fallback store instead.
 */
function getSql(): NeonQueryFunction<false, false> | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  try {
    return neon(connectionString);
  } catch (err) {
    console.warn('Failed to initialize Neon connection, falling back to memory store:', err);
    return null;
  }
}

// Creation Operations
export async function createCreation(record: Omit<CreationRecord, 'created_at' | 'report_count' | 'is_hidden' | 'view_count'>): Promise<CreationRecord> {
  const sql = getSql();
  const username = record.username || await getAssociatedUsername(record.device_id);

  const fullRecord: CreationRecord = {
    ...record,
    username,
    created_at: new Date().toISOString(),
    report_count: 0,
    is_hidden: false,
    view_count: 0,
  };

  if (!sql) {
    globalMemoryStore.creations.set(fullRecord.id, fullRecord);
    return fullRecord;
  }

  const gridDataJson = JSON.stringify(fullRecord.grid_data);
  const disturbedJson = fullRecord.disturbed_positions ? JSON.stringify(fullRecord.disturbed_positions) : null;
  const parentId = fullRecord.parent_creation_id || null;

  await sql`
    INSERT INTO creations 
    (id, device_id, grid_data, disturbed_positions, thumbnail_url, source_mode, parent_creation_id, is_daily_challenge, is_public, username, view_count) 
    VALUES (${fullRecord.id}, ${fullRecord.device_id}, ${gridDataJson}::jsonb, ${disturbedJson}::jsonb, ${fullRecord.thumbnail_url}, ${fullRecord.source_mode}, ${parentId}, ${fullRecord.is_daily_challenge}, ${fullRecord.is_public}, ${username}, 0)
  `;
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
  return {
    ...row,
    grid_data: typeof row.grid_data === 'string' ? JSON.parse(row.grid_data) : row.grid_data,
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

export async function reportCreation(creationId: string, reason?: string): Promise<{ hidden: boolean; report_count: number }> {
  const sql = getSql();
  const threshold = 3;

  if (!sql) {
    const item = globalMemoryStore.creations.get(creationId);
    if (!item) return { hidden: false, report_count: 0 };
    item.report_count += 1;
    if (item.report_count >= threshold) {
      item.is_hidden = true;
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
  await sql`INSERT INTO reports (creation_id, reason) VALUES (${creationId}, ${reasonVal})`;
  const rows = await sql`
    UPDATE creations 
    SET report_count = report_count + 1, 
        is_hidden = (report_count + 1 >= ${threshold}) 
    WHERE id = ${creationId} 
    RETURNING report_count, is_hidden
  `;
  if (rows.length === 0) return { hidden: false, report_count: 0 };
  return { hidden: rows[0].is_hidden, report_count: rows[0].report_count };
}

export async function getDailyChallenge(): Promise<CreationRecord | null> {
  const sql = getSql();
  const today = new Date().toISOString().split('T')[0];

  if (!sql) {
    const challenge = globalMemoryStore.dailyChallenges.get(today);
    if (challenge) {
      return getCreationById(challenge.creation_id);
    }
    // Pick the most recent public creation as fallback
    const firstPublic = Array.from(globalMemoryStore.creations.values()).find((c) => c.is_public && !c.is_hidden);
    return firstPublic || null;
  }

  const rows = await sql`
    SELECT c.* FROM creations c 
    JOIN daily_challenges d ON c.id = d.creation_id 
    WHERE d.active_date = ${today} AND c.is_hidden = FALSE
  `;
  if (rows.length > 0) {
    const row = rows[0] as any;
    return {
      ...row,
      grid_data: typeof row.grid_data === 'string' ? JSON.parse(row.grid_data) : row.grid_data,
      disturbed_positions: typeof row.disturbed_positions === 'string' ? JSON.parse(row.disturbed_positions) : row.disturbed_positions,
    };
  }

  // If no challenge set for today, pick most recent public creation or fallback
  const fallbackRes = await sql`SELECT * FROM creations WHERE is_hidden = FALSE ORDER BY created_at DESC LIMIT 1`;
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

export async function updateDeviceStreak(deviceId: string): Promise<DeviceStreakRecord> {
  const sql = getSql();
  const today = new Date().toISOString().split('T')[0];

  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
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
    } else if (streak.last_completed_date === today) {
      return streak;
    } else if (streak.last_completed_date === yesterday) {
      streak.current_streak += 1;
      streak.longest_streak = Math.max(streak.longest_streak, streak.current_streak);
      streak.last_completed_date = today;
    } else {
      streak.current_streak = 1;
      streak.last_completed_date = today;
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
    return newStreak;
  }

  const row = rows[0] as any;
  if (row.last_completed_date === today) {
    return row as DeviceStreakRecord;
  }

  const newCurrent = row.last_completed_date === yesterday ? row.current_streak + 1 : 1;
  const newLongest = Math.max(row.longest_streak, newCurrent);

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

  return {
    device_id: deviceId,
    current_streak: newCurrent,
    longest_streak: newLongest,
    last_completed_date: today,
    username: username || null,
  };
}

export async function getDeviceStreak(deviceId: string): Promise<DeviceStreakRecord> {
  const sql = getSql();
  const username = await getAssociatedUsername(deviceId);

  if (!sql) {
    let key = username ? `user:${username}` : deviceId;
    return globalMemoryStore.deviceStreaks.get(key) || {
      device_id: deviceId,
      current_streak: 0,
      longest_streak: 0,
      last_completed_date: null,
      username: username || null,
    };
  }

  let rows;
  if (username) {
    rows = await sql`SELECT * FROM device_streaks WHERE username = ${username}`;
  } else {
    rows = await sql`SELECT * FROM device_streaks WHERE device_id = ${deviceId} AND username IS NULL`;
  }

  if (rows.length === 0) {
    return { device_id: deviceId, current_streak: 0, longest_streak: 0, last_completed_date: null, username: username || null };
  }
  return rows[0] as DeviceStreakRecord;
}

export async function incrementViewCount(id: string): Promise<void> {
  const sql = getSql();
  if (!sql) {
    const item = globalMemoryStore.creations.get(id);
    if (item) {
      item.view_count = (item.view_count || 0) + 1;
    }
    return;
  }
  await sql`UPDATE creations SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ${id}`;
}

// Account & Session Operations

export async function createAccount(username: string, pinHash: string): Promise<AccountRecord> {
  const sql = getSql();
  const lowerUsername = username.toLowerCase().trim();
  const record: AccountRecord = {
    username: lowerUsername,
    pin_hash: pinHash,
    created_at: new Date().toISOString(),
  };

  if (!sql) {
    if (globalMemoryStore.accounts.has(lowerUsername)) {
      throw new Error('Username already exists');
    }
    globalMemoryStore.accounts.set(lowerUsername, record);
    return record;
  }

  await sql`
    INSERT INTO accounts (username, pin_hash)
    VALUES (${lowerUsername}, ${pinHash})
  `;
  return record;
}

export async function getAccountByUsername(username: string): Promise<AccountRecord | null> {
  const sql = getSql();
  const lowerUsername = username.toLowerCase().trim();

  if (!sql) {
    return globalMemoryStore.accounts.get(lowerUsername) || null;
  }

  const rows = await sql`SELECT * FROM accounts WHERE username = ${lowerUsername}`;
  if (rows.length === 0) return null;
  return rows[0] as AccountRecord;
}

export async function associateDeviceWithAccount(deviceId: string, username: string): Promise<void> {
  const sql = getSql();
  const lowerUsername = username.toLowerCase().trim();

  if (!sql) {
    globalMemoryStore.deviceSessions.set(deviceId, lowerUsername);
    return;
  }

  await sql`
    INSERT INTO device_sessions (device_id, username)
    VALUES (${deviceId}, ${lowerUsername})
    ON CONFLICT (device_id) 
    DO UPDATE SET username = ${lowerUsername}, associated_at = CURRENT_TIMESTAMP
  `;
}

export async function getAssociatedUsername(deviceId: string): Promise<string | null> {
  const sql = getSql();

  if (!sql) {
    return globalMemoryStore.deviceSessions.get(deviceId) || null;
  }

  const rows = await sql`SELECT username FROM device_sessions WHERE device_id = ${deviceId}`;
  if (rows.length === 0) return null;
  return rows[0].username;
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
  const lowerUsername = username.toLowerCase().trim();

  if (!sql) {
    // 1. Migrate Creations
    for (const c of globalMemoryStore.creations.values()) {
      if (c.device_id === deviceId) {
        c.username = lowerUsername;
      }
    }
    // 2. Migrate Streak
    const devStreak = globalMemoryStore.deviceStreaks.get(deviceId);
    if (devStreak) {
      let userStreakKey = `user:${lowerUsername}`;
      const userStreak = globalMemoryStore.deviceStreaks.get(userStreakKey);
      if (userStreak) {
        userStreak.current_streak = Math.max(userStreak.current_streak, devStreak.current_streak);
        userStreak.longest_streak = Math.max(userStreak.longest_streak, devStreak.longest_streak);
        if (devStreak.last_completed_date && (!userStreak.last_completed_date || devStreak.last_completed_date > userStreak.last_completed_date)) {
          userStreak.last_completed_date = devStreak.last_completed_date;
        }
        globalMemoryStore.deviceStreaks.delete(deviceId);
      } else {
        devStreak.username = lowerUsername;
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
    SET username = ${lowerUsername}
    WHERE device_id = ${deviceId}
  `;

  // 2. Update Streak
  const userStreaks = await sql`SELECT * FROM device_streaks WHERE username = ${lowerUsername}`;
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
        WHERE username = ${lowerUsername}
      `;
      await sql`DELETE FROM device_streaks WHERE device_id = ${deviceId} AND username IS NULL`;
    } else {
      await sql`
        UPDATE device_streaks
        SET username = ${lowerUsername}
        WHERE device_id = ${deviceId} AND username IS NULL
      `;
    }
  }
}
