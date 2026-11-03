// localStorage helpers. Every access is wrapped in try/catch: storage can be
// missing (private windows, blocked site data, tests in Node) or full, and the
// app must still work without it.

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readString(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    // Full or blocked: keep working in memory.
  }
}

export function removeKey(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    // Ignore.
  }
}

/** Parsed JSON, or null when missing or corrupt. Callers validate the shape. */
export function readJson(key: string): unknown {
  const raw = readString(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeString(key, JSON.stringify(value));
  } catch {
    // Not serializable: skip.
  }
}

export const STATE_KEY = 'mince.state.v1';
export const THEME_KEY = 'mince.theme';
export const COOK_KEY = 'mince.cook.v1';
