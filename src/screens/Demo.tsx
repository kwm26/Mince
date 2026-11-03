import { useMemo, useState } from 'react';
import { ChoiceChips } from '../components/ChoiceChips';
import { DayRow } from '../components/DayRow';
import { ClockIcon, XIcon } from '../components/icons';
import { PantryList, type PantryRow } from '../components/PantryList';
import { Stat } from '../components/Stat';
import { fridges, fridgeToPantry, ingredientById, recipeById, weekToConstraints, weeks } from '../lib/data';
import { dayLabel, isoDate } from '../lib/dates';
import { daysLeft, daysLeftLabel, formatAmount, isPerishable, isUseSoon } from '../lib/kitchen';
import { pinnedMinutesByDay } from '../lib/week';
import type { FridgeSeed, WeekSeed } from '../types';

/** Browse the example fridges and weeks (data-model §13) until the real screens land. */
export function Demo() {
  const [today] = useState(() => isoDate(new Date()));
  const [fridgeId, setFridgeId] = useState(fridges[0]?.id ?? '');
  const [weekId, setWeekId] = useState(weeks[0]?.id ?? '');
  const fridge = fridges.find((f) => f.id === fridgeId);
  const week = weeks.find((w) => w.id === weekId);

  return (
    <main className="screen">
      <header className="screen-head">
        <p className="eyebrow">Demo</p>
        <h1>
          Example <em className="accent">data</em>
        </h1>
        <p className="muted">
          Three fridges and five weeks, built only from the {recipeById.size} recipes. Dates count from today.
        </p>
      </header>

      <section className="section" aria-labelledby="fridges-heading">
        <h2 id="fridges-heading">Fridges</h2>
        <ChoiceChips
          label="Example fridge"
          options={fridges.map((f) => ({ id: f.id, label: f.name }))}
          value={fridgeId}
          onChange={setFridgeId}
        />
        {fridge && <FridgeView fridge={fridge} today={today} />}
      </section>

      <section className="section" aria-labelledby="weeks-heading">
        <h2 id="weeks-heading">Weeks</h2>
        <ChoiceChips
          label="Example week"
          options={weeks.map((w) => ({ id: w.id, label: w.name }))}
          value={weekId}
          onChange={setWeekId}
        />
        {week && <WeekView week={week} today={today} />}
      </section>
    </main>
  );
}

function FridgeView({ fridge, today }: { fridge: FridgeSeed; today: string }) {
  const rows = useMemo<PantryRow[]>(
    () =>
      fridgeToPantry(fridge, today)
        .map((item) => {
          const ingredient = ingredientById.get(item.ingredientId);
          const left = daysLeft(item, today);
          return {
            id: item.ingredientId,
            name: ingredient?.name ?? item.ingredientId,
            amount: formatAmount(item.amount, ingredient?.packUnit ?? ''),
            daysLeft: left,
            daysLeftLabel: daysLeftLabel(left),
            useSoon: isUseSoon(left),
          };
        })
        .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name)),
    [fridge, today],
  );
  const perishable = fridge.items.filter((x) => {
    const i = ingredientById.get(x.ingredientId);
    return i ? isPerishable(i) : false;
  }).length;

  return (
    <div className="detail">
      <p className="muted">{fridge.description}</p>
      <div className="stats">
        <Stat label="Items" value={rows.length} />
        <Stat label="Perishable" value={perishable} />
        <Stat label="Use soon" value={rows.filter((r) => r.useSoon).length} />
      </div>
      <PantryList rows={rows} />
    </div>
  );
}

function WeekView({ week, today }: { week: WeekSeed; today: string }) {
  const constraints = useMemo(() => weekToConstraints(week, today), [week, today]);
  const pinned = pinnedMinutesByDay(constraints, recipeById);
  const fridgeName = week.fridgeId === null ? 'Empty fridge' : fridges.find((f) => f.id === week.fridgeId)?.name;

  return (
    <div className="detail">
      <p className="muted">{week.description}</p>
      <div className="stats">
        <Stat label="Protein" value={constraints.proteinPerDay} unit="g/day" />
        <Stat label="Pins" value={constraints.pins.length} />
        <Stat label="Pantry" value={constraints.pantry.length} unit="items" />
      </div>
      <p className="meta">Fridge: {fridgeName}</p>
      <ul className="day-list">
        {Array.from({ length: constraints.days }, (_, day) => {
          const { weekday, date } = dayLabel(constraints.startDate, day);
          const limit = constraints.maxCookMinutes[day] ?? 0;
          const minutes = pinned[day] ?? 0;
          const pins = constraints.pins.filter((p) => p.day === day);
          return (
            <DayRow key={day} weekday={weekday} date={date}>
              {day === 0 && <span className="eyebrow">Shopping day</span>}
              <span className="day-limit">
                <ClockIcon size={16} />
                {limit === 0 ? 'No cooking' : `Up to ${limit} min of cooking`}
              </span>
              {pins.length > 0 ? (
                <ul className="mini-chips" aria-label="Pinned meals">
                  {pins.map((p) => {
                    const r = recipeById.get(p.recipeId);
                    return (
                      <li key={p.recipeId} className="mini-chip">
                        {r?.title ?? p.recipeId} · {r?.minutes} min
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <span className="muted">Nothing pinned</span>
              )}
              {minutes > limit && (
                <span className="day-conflict">
                  <XIcon size={16} />
                  Pinned meals need {minutes} min; the limit is {limit} min
                </span>
              )}
            </DayRow>
          );
        })}
      </ul>
    </div>
  );
}
