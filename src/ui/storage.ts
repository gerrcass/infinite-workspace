import type { StoragePort } from '../store/persistence';

export interface BrowserStorage {
  readonly port: StoragePort | null;
  /** True when the browser exposed storage but access threw (private/quota). */
  readonly blocked: boolean;
}

/** Resolve localStorage behind a port so persistence never touches globals. */
export function openBrowserStorage(): BrowserStorage {
  try {
    const port = window.localStorage;
    return { port, blocked: false };
  } catch {
    return { port: null, blocked: true };
  }
}
