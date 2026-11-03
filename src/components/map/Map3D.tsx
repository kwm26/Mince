// The ingredient map in 3D (design-spec §11 "2D / 3D"). Same nodes, colours,
// sizes and lens emphasis as the 2D canvas, placed by layout3d.ts. Drag to orbit,
// pinch or scroll to zoom, double-tap to reset, tap a sphere for its sheet.
// Loaded on demand, so three.js never weighs on the 2D path.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Layout3D } from '../../lib/layout3d';
import type { CanvasNode, Emphasis } from './MapCanvas';

export interface Edge3D { from: string; to: string; emphasis: Emphasis; }

interface Props {
  sentence: string;
  nodes: CanvasNode[];
  edges: Edge3D[];
  layout: Layout3D;
  onNodeTap: (id: string) => void;
  onBackgroundTap: () => void;
  onUnavailable: () => void;
}

const OPACITY: Record<Emphasis, number> = { high: 1, normal: 0.9, dim: 0.18 };
const TAP_SLOP = 8;       // px a pointer may move and still count as a tap
const DOUBLE_TAP_MS = 300;

function token(name: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || '#888888');
}

function nodeColor(n: CanvasNode): THREE.Color {
  return n.kind === 'recipe' ? token('--color-primary') : token(`--color-cat-${n.category ?? 'other'}`);
}

export default function Map3D({ sentence, nodes, edges, layout, onNodeTap, onBackgroundTap, onUnavailable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  // Callbacks change every render; the scene reads the latest through refs.
  const cb = useRef({ onNodeTap, onBackgroundTap, onUnavailable });
  cb.current = { onNodeTap, onBackgroundTap, onUnavailable };

  useEffect(() => {
    const host = hostRef.current;
    const labelHost = labelsRef.current;
    if (!host || !labelHost) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      cb.current.onUnavailable();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const world = new THREE.Group();
    scene.add(world);
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1, 2, 3);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
    const home = { yaw: -0.5, pitch: 0.35, dist: Math.max(layout.radius, 60) * 2.6 };
    const view = { ...home };

    // Spheres: one shared geometry, one material per node (opacity and colour differ).
    const sphere = new THREE.SphereGeometry(1, 24, 16);
    const meshes = new Map<string, THREE.Mesh<THREE.SphereGeometry, THREE.MeshLambertMaterial>>();
    for (const n of nodes) {
      const p = layout.positions[n.id];
      if (!p) continue;
      const mat = new THREE.MeshLambertMaterial({ transparent: n.emphasis === 'dim', opacity: OPACITY[n.emphasis] });
      const mesh = new THREE.Mesh(sphere, mat);
      mesh.position.set(p.x, p.y, p.z);
      mesh.scale.setScalar(n.radius * (n.selected ? 1.25 : 1));
      mesh.userData.id = n.id;
      world.add(mesh);
      meshes.set(n.id, mesh);
    }

    // Edges: two line sets so faded edges can be fainter than the rest.
    const lineSet = (dim: boolean) => {
      const pts: number[] = [];
      for (const e of edges) {
        if ((e.emphasis === 'dim') !== dim) continue;
        const a = layout.positions[e.from];
        const b = layout.positions[e.to];
        if (a && b) pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: dim ? 0.08 : 0.45 });
      const lines = new THREE.LineSegments(geo, mat);
      world.add(lines);
      return lines;
    };
    const strong = lineSet(false);
    const faint = lineSet(true);

    const recolor = () => {
      for (const n of nodes) meshes.get(n.id)?.material.color.copy(nodeColor(n));
      const ink = token('--color-text');
      strong.material.color.copy(ink);
      faint.material.color.copy(ink);
    };
    recolor();

    // Labels: DOM text projected onto the canvas each frame, so they stay crisp and readable.
    const labelled = nodes.filter((n) => n.label && meshes.has(n.id) && n.emphasis !== 'dim');
    labelHost.replaceChildren(
      ...labelled.map((n) => {
        const el = document.createElement('span');
        el.className = 'map3d-label';
        el.textContent = n.label!.text;
        return el;
      }),
    );
    const labelEls = [...labelHost.children] as HTMLElement[];

    let dirty = true;
    const size = { w: 1, h: 1 };
    const resize = () => {
      size.w = host.clientWidth || 1;
      size.h = host.clientHeight || 1;
      renderer.setSize(size.w, size.h, false);
      camera.aspect = size.w / size.h;
      camera.updateProjectionMatrix();
      dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const v = new THREE.Vector3();
    const draw = () => {
      camera.position.set(
        view.dist * Math.cos(view.pitch) * Math.sin(view.yaw),
        view.dist * Math.sin(view.pitch),
        view.dist * Math.cos(view.pitch) * Math.cos(view.yaw),
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      labelled.forEach((n, i) => {
        const el = labelEls[i]!;
        meshes.get(n.id)!.getWorldPosition(v).project(camera);
        const hidden = v.z > 1;
        el.style.transform = `translate(${((v.x + 1) / 2) * size.w}px, ${((1 - v.y) / 2) * size.h}px)`;
        el.style.visibility = hidden ? 'hidden' : 'visible';
      });
    };
    let frame = 0;
    const loop = () => {
      if (dirty) {
        dirty = false;
        draw();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    // Orbit, zoom, tap and double-tap with plain pointer events.
    const canvas = renderer.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number } | null = null;
    let moved = false;
    let pinch = 0;
    let lastTap = 0;
    const clampDist = (d: number) => Math.min(Math.max(d, layout.radius * 0.8), layout.radius * 6);

    const pick = (x: number, y: number): string | null => {
      const rect = canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), camera);
      const hit = ray.intersectObjects([...meshes.values()])[0];
      return hit ? (hit.object.userData.id as string) : null;
    };

    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        start = { x: e.clientX, y: e.clientY };
        moved = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        moved = true;
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0) view.dist = clampDist(view.dist * (pinch / d));
        pinch = d;
      } else {
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) moved = true;
        if (!moved) return;
        view.yaw -= (e.clientX - prev.x) * 0.008;
        view.pitch = Math.min(1.3, Math.max(-1.3, view.pitch + (e.clientY - prev.y) * 0.008));
      }
      dirty = true;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size > 0) return;
      pinch = 0;
      if (moved) return;
      const now = performance.now();
      if (now - lastTap < DOUBLE_TAP_MS) {
        Object.assign(view, home);
        dirty = true;
        lastTap = 0;
        return;
      }
      lastTap = now;
      const id = pick(e.clientX, e.clientY);
      if (id) cb.current.onNodeTap(id);
      else cb.current.onBackgroundTap();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      view.dist = clampDist(view.dist * Math.exp(e.deltaY * 0.001));
      dirty = true;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });

    // Follow theme changes: the OS setting or the app's data-theme override.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => {
      recolor();
      dirty = true;
    };
    media.addEventListener('change', onTheme);
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      media.removeEventListener('change', onTheme);
      canvas.removeEventListener('wheel', wheel);
      for (const m of meshes.values()) m.material.dispose();
      sphere.dispose();
      for (const l of [strong, faint]) {
        l.geometry.dispose();
        l.material.dispose();
      }
      renderer.dispose();
      canvas.remove();
      labelHost.replaceChildren();
    };
  }, [nodes, edges, layout]);

  return (
    <div ref={hostRef} className="map3d" role="img" aria-label={sentence}>
      <div ref={labelsRef} className="map3d-labels" aria-hidden="true" />
    </div>
  );
}
