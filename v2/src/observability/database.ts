import path from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { Pool } from 'pg';

let pool: Pool | null = null;
let envLoaded = false;

const INIT_CONNECT_TIMEOUT_MS = 4000;

function loadEnvIfNeeded(): void {
  if (envLoaded) {
    return;
  }
  dotenvConfig();
  const repoRoot = path.resolve(__dirname, '../../..');
  for (const candidate of [
    path.join(repoRoot, '.env.secrets'),
    path.join(process.cwd(), '.env.secrets'),
  ]) {
    dotenvConfig({ path: candidate, override: true });
  }
  envLoaded = true;
}

function buildDatabaseUrl(): string {
  loadEnvIfNeeded();
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const user = process.env.POSTGRES_USER ?? 'postgres';
  const password = process.env.POSTGRES_PASSWORD ?? 'password';
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const database = process.env.POSTGRES_DB ?? 'sre_copilot';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

async function tryConnect(): Promise<Pool> {
  const nextPool = new Pool({
    connectionString: buildDatabaseUrl(),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
  });

  const client = await Promise.race([
    nextPool.connect(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), INIT_CONNECT_TIMEOUT_MS)),
  ]);
  await client.query('SELECT NOW()');
  client.release();
  return nextPool;
}

export async function initDatabase(): Promise<Pool | null> {
  if (pool) {
    return pool;
  }
  try {
    pool = await tryConnect();
    return pool;
  } catch {
    pool = null;
    return null;
  }
}

export function isDatabaseAvailable(): boolean {
  return pool !== null;
}

export async function query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
  if (!pool) {
    throw new Error('数据库不可用');
  }
  const result = await pool.query(text, params);
  return result.rows as T[];
}
