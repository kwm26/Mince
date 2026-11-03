import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { App } from './App';
import { optimizerEngine, PlanMap } from './optimizer';
import { applyTheme, readTheme } from './theme';

// Apply a saved light/dark choice before the first paint, so there's no flash.
applyTheme(readTheme());

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App engine={optimizerEngine} mapSlot={(api) => <PlanMap api={api} />} />
  </StrictMode>,
);
