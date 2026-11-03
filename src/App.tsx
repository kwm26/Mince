import { useEffect, useState, type ReactNode } from 'react';
import { TabBar, type Tab } from './components/TabBar';
import { disconnectedEngine, type PlanEngine } from './engine';
import { isoDate } from './lib/dates';
import { Cook, type CookSession } from './screens/Cook';
import { Kitchen } from './screens/Kitchen';
import { Plan, type PlanMapApi, type PlanView } from './screens/Plan';
import { StateProvider } from './state';
import { COOK_KEY, readJson, removeKey, writeJson } from './storage';

export interface AppProps {
  /** The optimizer. Defaults to a placeholder that fails honestly until the real one is wired. */
  engine?: PlanEngine;
  /** The ingredient map for Plan's Map view: a node, or a render function given the plan state. */
  mapSlot?: ReactNode | ((api: PlanMapApi) => ReactNode);
}

export function App({ engine = disconnectedEngine, mapSlot }: AppProps) {
  const [today] = useState(() => isoDate(new Date()));
  return (
    <StateProvider today={today}>
      <Shell engine={engine} mapSlot={mapSlot} />
    </StateProvider>
  );
}

function readCookSession(): CookSession | null {
  const v = readJson(COOK_KEY);
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  if (typeof s.recipeId !== 'string' || typeof s.step !== 'number' || !(s.day === null || typeof s.day === 'number')) return null;
  return { recipeId: s.recipeId, day: s.day as number | null, step: s.step };
}

function Shell({ engine, mapSlot }: Required<Pick<AppProps, 'engine'>> & Pick<AppProps, 'mapSlot'>) {
  const [tab, setTab] = useState<Tab>(() => (readCookSession() ? 'cook' : 'kitchen'));
  const [planView, setPlanView] = useState<PlanView>('week');
  const [mapFocus, setMapFocus] = useState<string | null>(null);
  const [cook, setCook] = useState<CookSession | null>(readCookSession);
  const focusMode = tab === 'cook' && cook !== null;

  useEffect(() => {
    if (cook) writeJson(COOK_KEY, cook);
    else removeKey(COOK_KEY);
  }, [cook]);

  const go = (next: Tab) => {
    setTab(next);
    window.scrollTo(0, 0);
  };

  return (
    <div className="app" data-focus={focusMode}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {tab === 'kitchen' && (
        <Kitchen
          onSeeOnMap={(id) => {
            setMapFocus(id);
            setPlanView('map');
            go('plan');
          }}
        />
      )}
      {tab === 'plan' && <Plan engine={engine} mapSlot={mapSlot} view={planView} onViewChange={setPlanView} mapFocus={mapFocus} />}
      {tab === 'cook' && (
        <Cook
          session={cook}
          onSession={(s) => {
            setCook(s);
            window.scrollTo(0, 0);
          }}
        />
      )}
      {!focusMode && <TabBar active={tab} onChange={go} />}
    </div>
  );
}
