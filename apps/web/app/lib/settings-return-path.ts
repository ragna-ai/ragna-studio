const RETURN_PATH_STORAGE_KEY = 'settings:return-path';
const SETTINGS_PREFIX = '/settings';
const FALLBACK_RETURN_PATH = '/';

export function isSettingsPath(path: string): boolean {
  return path === SETTINGS_PREFIX || path.startsWith(`${SETTINGS_PREFIX}/`);
}

export function rememberReturnPath(fullPath: string): void {
  sessionStorage.setItem(RETURN_PATH_STORAGE_KEY, fullPath);
}

export function readReturnPath(): string {
  return (
    sessionStorage.getItem(RETURN_PATH_STORAGE_KEY) ?? FALLBACK_RETURN_PATH
  );
}
