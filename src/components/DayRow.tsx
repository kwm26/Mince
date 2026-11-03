import type { ReactNode } from 'react';

interface Props { weekday: string; date: number; children: ReactNode; }

/** Planner day row: a date column (MON over an italic serif date), then the day's content. */
export function DayRow({ weekday, date, children }: Props) {
  return (
    <li className="day-row">
      <div className="day-date">
        <span className="day-weekday">{weekday}</span>
        <span className="day-number">{date}</span>
      </div>
      <div className="day-body">{children}</div>
    </li>
  );
}
