import type { StageColor } from '@/types';
import { DEFAULT_PIPELINE } from '@/types';

/** The `.pill-*` class for a given stage colour. */
export const stagePillClass = (color: StageColor) => `pill-${color}`;

/* ── stage-name → colour registry ────────────────────────────────────────────
 * The pipeline lives in the store, but <Pill> is a tiny presentational
 * component used all over the app (dashboard, drivers, candidate record) with
 * only a stage *name* to go on. The store keeps this registry in sync so those
 * pills pick up custom stage colours automatically. */
const registry = new Map<string, StageColor>();

export function setStageColorRegistry(stages: { name: string; color: StageColor }[]) {
  registry.clear();
  for (const s of stages) registry.set(s.name, s.color);
}

export const stageColorForName = (name: string): StageColor | undefined => registry.get(name);

// Seed with the default pipeline so pills are coloured before the store mounts.
setStageColorRegistry(DEFAULT_PIPELINE);
