// Applies the resolved interior to each floor instance. Open floors get a tint and props.
// Closed floors only tint their glass band, so a stack of teams reads as mixed from outside
// while the shell stays on the exterior theme.
import { resolveFloorInterior } from './interiors.js';
import { applyTint, tintClosedGlass } from './tint.js';

export function dressBuilding(building, state, exteriorId) {
  if (!building?.slots) return;
  const feed = state?.floor_themes || null;
  for (const slot of building.slots) {
    const theme = resolveFloorInterior(slot, { feed, exteriorId });
    const key = theme?.id || 'office';
    if (slot.open && slot.open.interiorKey !== key) {
      dressOpen(slot.open, theme);
      slot.open.interiorKey = key;
    }
    if (slot.closed && slot.closed.interiorKey !== key) {
      tintClosedGlass(slot.closed.obj, theme?.glass || null);
      slot.closed.interiorKey = key;
    }
  }
}

function dressOpen(inst, theme) {
  const prev = inst.root.getObjectByName('interior-props');
  if (prev) prev.removeFromParent();
  applyTint(inst.obj, theme?.tint || null);
  if (!theme?.createProps) return;
  const props = theme.createProps();
  props.name = 'interior-props';
  props.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  inst.root.add(props);
}
