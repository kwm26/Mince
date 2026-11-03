// Theme: follows the OS by default; a chosen light or dark is set as data-theme on
// <html> and remembered in localStorage (design-spec §9).

import { readString, removeKey, THEME_KEY, writeString } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';

export function readTheme(): ThemeChoice {
  const v = readString(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function saveTheme(choice: ThemeChoice): void {
  if (choice === 'system') removeKey(THEME_KEY);
  else writeString(THEME_KEY, choice);
  applyTheme(choice);
}

export const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
export const THEME_WORDS: Record<ThemeChoice, string> = { system: 'follows your device', light: 'light', dark: 'dark' };
