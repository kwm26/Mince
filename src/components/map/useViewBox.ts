import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface ViewBox { x: number; y: number; w: number; h: number; }

const MAX_ZOOM = 4;
const TAP_SLOP = 8;           // px a finger may drift and still count as a tap
const DOUBLE_TAP_MS = 300;

/**
 * Pinch to zoom, drag to pan (only while zoomed), double-tap to reset, all on the
 * SVG viewBox via pointer events (design-spec §11). Ctrl + wheel (trackpad pinch)
 * zooms on desktop. `takeSuppressedClick()` tells a node's click handler to ignore
 * the click that ended a pan or a double-tap.
 */
export function useViewBox(width: number, height: number) {
  const [vb, setVb] = useState<ViewBox>({ x: 0, y: 0, w: width, h: height });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ vb: ViewBox; dist: number; mid: { x: number; y: number }; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const suppress = useRef(false);
  const vbRef = useRef(vb);
  vbRef.current = vb;

  const clampVb = useCallback(
    (v: ViewBox): ViewBox => {
      const w = Math.min(width, Math.max(width / MAX_ZOOM, v.w));
      const h = (w * height) / width;
      return {
        w,
        h,
        x: Math.min(width - w, Math.max(0, v.x)),
        y: Math.min(height - h, Math.max(0, v.y)),
      };
    },
    [width, height],
  );

  const reset = useCallback(() => setVb({ x: 0, y: 0, w: width, h: height }), [width, height]);

  useEffect(() => reset(), [reset]);

  /** Zoom so `box` (in map units) fills the view, with some margin. */
  const focusBox = useCallback(
    (box: ViewBox) => {
      const pad = 40;
      const w = Math.max(box.w + pad * 2, ((box.h + pad * 2) * width) / height);
      const h = (w * height) / width;
      setVb(clampVb({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h }));
    },
    [clampVb, width, height],
  );

  const scale = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? { rect, k: vbRef.current.w / rect.width } : null;
  };

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const [a, b] = pts;
    if (!a) {
      gesture.current = null;
      return;
    }
    const mid = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
    const dist = b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    gesture.current = { vb: vbRef.current, dist, mid, moved: gesture.current?.moved ?? false };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = null;
      suppress.current = false;
    }
    startGesture();
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const s = scale();
    if (!g || !s) return;
    const pts = [...pointers.current.values()];
    const [a, b] = pts;
    if (!a) return;

    if (b && g.dist > 0) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / g.dist;
      const k0 = g.vb.w / s.rect.width;
      const anchor = { x: g.vb.x + (g.mid.x - s.rect.left) * k0, y: g.vb.y + (g.mid.y - s.rect.top) * k0 };
      const w = Math.min(width, Math.max(width / MAX_ZOOM, g.vb.w / ratio));
      const k1 = w / s.rect.width;
      g.moved = true;
      setVb(clampVb({ w, h: (w * height) / width, x: anchor.x - (mid.x - s.rect.left) * k1, y: anchor.y - (mid.y - s.rect.top) * k1 }));
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }

    const dx = a.x - g.mid.x;
    const dy = a.y - g.mid.y;
    if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    if (g.vb.w >= width) return; // not zoomed: let the page scroll
    g.moved = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setVb(clampVb({ ...g.vb, x: g.vb.x - dx * s.k, y: g.vb.y - dy * s.k }));
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.moved) suppress.current = true;

    if (pointers.current.size === 0) {
      if (!g?.moved && e.type === 'pointerup') {
        const now = e.timeStamp;
        const prev = lastTap.current;
        if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 24) {
          reset();
          suppress.current = true;
          lastTap.current = null;
        } else {
          lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        }
      }
      gesture.current = null;
    } else {
      startGesture();
    }
  };

  // Ctrl + wheel is how trackpads report a pinch; React's wheel listener is passive.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const cur = vbRef.current;
      const k0 = cur.w / rect.width;
      const anchor = { x: cur.x + (e.clientX - rect.left) * k0, y: cur.y + (e.clientY - rect.top) * k0 };
      const w = Math.min(width, Math.max(width / MAX_ZOOM, cur.w * Math.exp(e.deltaY * 0.01)));
      const k1 = w / rect.width;
      setVb(clampVb({ w, h: (w * height) / width, x: anchor.x - (e.clientX - rect.left) * k1, y: anchor.y - (e.clientY - rect.top) * k1 }));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [clampVb, width, height]);

  const takeSuppressedClick = () => {
    const s = suppress.current;
    suppress.current = false;
    return s;
  };

  return {
    svgRef,
    viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
    zoomed: vb.w < width - 0.5,
    reset,
    focusBox,
    takeSuppressedClick,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
