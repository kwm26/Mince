import { useState } from 'react';
import { NEXT_THEME, readTheme, saveTheme, THEME_WORDS, type ThemeChoice } from '../theme';
import { IconButton } from './Button';
import { ContrastIcon, MoonIcon, SunIcon } from './icons';

/** Cycles device → light → dark. The label says the current theme and what a tap does. */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  const next = NEXT_THEME[choice];
  return (
    <IconButton
      label={`Theme ${THEME_WORDS[choice]}. Switch to ${THEME_WORDS[next]}`}
      onClick={() => {
        saveTheme(next);
        setChoice(next);
      }}
    >
      {choice === 'light' ? <SunIcon size={22} /> : choice === 'dark' ? <MoonIcon size={22} /> : <ContrastIcon size={22} />}
    </IconButton>
  );
}
