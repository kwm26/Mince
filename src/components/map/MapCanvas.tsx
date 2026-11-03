import type { PointerEvent as ReactPointerEvent, Ref } from 'react';
import type { Category } from '../../types';

export type NodeKind = 'recipe' | 'shared' | 'single';
export type Emphasis = 'high' | 'normal' | 'dim';

export interface CanvasNode {
  id: string;
  kind: NodeKind;
  category?: Category; // ingredients only: the fill colour (design-spec §2)
  x: number;
  y: number;
  base: number;        // base radius for the kind (design-spec §5)
  radius: number;      // drawn radius: the lens size, or the base
  emphasis: Emphasis;
  selected: boolean;
  label?: { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  badge?: { text: string; x: number; y: number; w: number };
}

export interface CanvasEdge {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  toSingle: boolean;
  emphasis: Emphasis;
}

export interface CanvasHull {
  name: string;
  path: string;
  top: { x: number; y: number };
  highlighted: boolean;
  label?: { x: number; y: number };   // placed by the caller; omitted when it would collide
}

export interface CanvasGhost { id: string; x1: number; y1: number; x2: number; y2: number; label: string; }

interface Props {
  width: number;
  height: number;
  sentence: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  hulls: CanvasHull[];
  ghosts: CanvasGhost[];
  viewBox: string;
  svgRef: Ref<SVGSVGElement>;
  zoomed: boolean;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<SVGSVGElement>) => void;
  };
  onNodeTap: (id: string) => void;
  onBackgroundTap: () => void;
}

const CHAR_W = 6.6;     // approximate advance of a 12px bold sans character, in map units
const HIT_RADIUS = 24;  // 48px tap target at 1:1
export const HULL_CHAR_W = 10; // 12px bold uppercase with 0.12em tracking
export const BADGE_H = 18;

/** Rough width of a 12px label, for pills and edge clamping (SVG text can't be measured before render). */
export function textWidth(s: string): number {
  return s.length * CHAR_W;
}

/** The ingredient map as static SVG. Pure presentation: every value, label spot included, comes from props. */
export function MapCanvas(props: Props) {
  const { width, height, nodes, edges, hulls, ghosts } = props;

  const clampX = (x: number, w: number) => Math.min(width - w / 2 - 2, Math.max(w / 2 + 2, x));

  return (
    <svg
      ref={props.svgRef}
      className={`map-canvas${props.zoomed ? ' is-zoomed' : ''}`}
      viewBox={props.viewBox}
      role="img"
      aria-label={props.sentence}
      style={{ aspectRatio: `${width} / ${height}` }}
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as Element).classList.contains('map-bg')) props.onBackgroundTap();
      }}
      {...props.handlers}
    >
      <rect className="map-bg" x={0} y={0} width={width} height={height} />

      <g className="map-hulls">
        {hulls.map((h) => (
          <g key={h.name} className={`map-hull${h.highlighted ? ' is-high' : ''}`}>
            <path d={h.path} />
          </g>
        ))}
      </g>

      <g className="map-edges">
        {edges.map((e) => (
          <line
            key={e.id}
            className={`map-edge map-edge--${e.emphasis}${e.toSingle ? ' map-edge--single' : ''}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
          />
        ))}
        {ghosts.map((g) => (
          <line key={g.id} className="map-ghost" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
        ))}
      </g>

      <g className="map-nodes">
        {nodes.map((n) => (
          <g
            key={n.id}
            data-id={n.id}
            className={`map-node map-node--${n.kind}${n.category ? ` map-cat--${n.category}` : ''} is-${n.emphasis}${n.selected ? ' is-selected' : ''}`}
            transform={`translate(${n.x} ${n.y})`}
            onClick={() => props.onNodeTap(n.id)}
          >
            <circle className="map-hit" r={Math.max(HIT_RADIUS, n.radius)} />
            {n.selected && <circle className="map-ring" r={n.radius + 4} />}
            <g className="map-node-body" style={{ transform: `scale(${n.radius / n.base})` }}>
              <circle className="map-dot" r={n.base} />
            </g>
          </g>
        ))}
      </g>

      <g className="map-labels" aria-hidden="true">
        {hulls.map((h) =>
          h.label ? (
            <text key={h.name} className="map-hull-label" x={h.label.x} y={h.label.y} textAnchor="middle">
              {h.name}
            </text>
          ) : null,
        )}
        {nodes.map((n) =>
          n.label ? (
            <text key={n.id} className="map-label" x={n.label.x} y={n.label.y} textAnchor={n.label.anchor}>
              {n.label.text}
            </text>
          ) : null,
        )}
        {nodes.map((n) =>
          n.badge ? (
            <g key={n.id} className="map-badge" transform={`translate(${n.badge.x} ${n.badge.y})`}>
              <rect width={n.badge.w} height={BADGE_H} rx={4} />
              <text x={n.badge.w / 2} y={13} textAnchor="middle">
                {n.badge.text}
              </text>
            </g>
          ) : null,
        )}
        {ghosts.map((g) => {
          // Slide the pill along the dashed line to the first spot clear of every badge.
          const w = textWidth(g.label) + 14;
          const badges = nodes.flatMap((n) => (n.badge ? [n.badge] : []));
          const spots = [0.5, 0.35, 0.65, 0.2, 0.8].map((t) => ({
            mx: clampX(g.x1 + (g.x2 - g.x1) * t, w),
            my: g.y1 + (g.y2 - g.y1) * t,
          }));
          const free = spots.find(({ mx, my }) =>
            badges.every((b) => mx + w / 2 < b.x || b.x + b.w < mx - w / 2 || my + 10 < b.y || b.y + BADGE_H < my - 10),
          );
          const { mx, my } = free ?? spots[0]!;
          return (
            <g key={g.id} className="map-ghost-pill" transform={`translate(${mx - w / 2} ${my - 10})`}>
              <rect width={w} height={20} rx={4} />
              <text x={w / 2} y={14} textAnchor="middle">
                {g.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
