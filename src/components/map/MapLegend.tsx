import type { ReactNode } from 'react';
import type { Category } from '../../types';
import { categoryLabel } from '../../lib/labels';

export interface LegendFlags {
  categories: Category[]; // ingredient categories on the map, in legend order
  single: boolean;     // single-use ingredients are on the map
  dim: boolean;        // some nodes are faded
  badge?: string;      // what a tag means under this lens, e.g. "Days left"
  sizeMeaning?: string;
  ghost: boolean;
  families: boolean;
}

function Swatch({ children }: { children: ReactNode }) {
  return (
    <svg className="map-legend-swatch" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** Always-visible key for the map's colours, shapes and tags (design-spec §5, §11). Every colour has its word. */
export function MapLegend({ flags }: { flags: LegendFlags }) {
  return (
    <ul className="map-legend" aria-label="Map key">
      <li>
        <Swatch>
          <circle className="map-legend-recipe" cx="10" cy="10" r="7" />
        </Swatch>
        Recipe
      </li>
      <li>
        <Swatch>
          <circle className="map-legend-shared" cx="10" cy="10" r="5" />
        </Swatch>
        Shared: big, dark outline
      </li>
      {flags.single && (
        <li>
          <Swatch>
            <circle className="map-legend-single" cx="10" cy="10" r="4" />
          </Swatch>
          Used by one recipe: small, thin outline
        </li>
      )}
      {flags.categories.map((c) => (
        <li key={c} className={`map-cat--${c}`}>
          <Swatch>
            <circle className="map-legend-cat" cx="10" cy="10" r="6" />
          </Swatch>
          {categoryLabel(c)}
        </li>
      ))}
      {flags.dim && (
        <li>
          <Swatch>
            <circle className="map-legend-recipe is-dim" cx="10" cy="10" r="7" />
          </Swatch>
          Faded: not part of this view
        </li>
      )}
      {flags.sizeMeaning && (
        <li>
          <Swatch>
            <circle className="map-legend-size" cx="6" cy="13" r="3" />
            <circle className="map-legend-size" cx="13" cy="9" r="6" />
          </Swatch>
          {flags.sizeMeaning}
        </li>
      )}
      {flags.badge && (
        <li>
          <span className="map-legend-tag">Tag</span>
          {flags.badge}
        </li>
      )}
      {flags.ghost && (
        <li>
          <Swatch>
            <line className="map-legend-ghost" x1="1" y1="10" x2="19" y2="10" />
          </Swatch>
          Suggested swap
        </li>
      )}
      {flags.families && (
        <li>
          <Swatch>
            <rect className="map-legend-hull" x="2" y="4" width="16" height="12" />
          </Swatch>
          Family: recipes that share perishables
        </li>
      )}
    </ul>
  );
}
