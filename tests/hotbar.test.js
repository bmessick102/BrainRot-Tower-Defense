import { describe, it, expect } from 'vitest';
import { hotbarSlots, slotForKey } from '../src/logic/hotbar.js';
import { ensureHero } from '../src/logic/hero.js';
import { hypeNeeded } from '../src/logic/dj.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

function village() {
  const s = makeStateWithTownHall({ gold: 1e6, researchPoints: 0 }, 10);
  addBuilding(s, 'altar', 6, 6, 1);
  const dj = addBuilding(s, 'dj', 10, 10, 1);
  addBuilding(s, 'fuelStation', 14, 10, 4);
  ensureHero(s);
  return { s, dj };
}

describe('ability hotbar', () => {
  it('lists Brisket Feast, Drop the Beat, then each brewed spell type (with its count)', () => {
    const { s, dj } = village();
    s.spells = ['heal', 'rage', 'heal'];
    const slots = hotbarSlots(s);
    expect(slots.map((x) => x.id)).toEqual(['feast', `beat:${dj.id}`, 'spell:rage', 'spell:heal']);
    expect(slots.find((x) => x.kind === 'heal').count).toBe(2);
    expect(slots.every((x) => x.desc && x.name)).toBe(true);
  });

  it('nothing is ready between waves; in a wave they are (the beat once the hype meter is full)', () => {
    const { s, dj } = village();
    s.spells = ['freeze'];
    expect(hotbarSlots(s).some((x) => x.ready)).toBe(false);
    expect(hotbarSlots(s).find((x) => x.type === 'spell').reason).toBe('Only during a wave');
    s.wave.phase = 'active';
    s.hero.status = 'ready';
    const live = hotbarSlots(s);
    expect(live.find((x) => x.type === 'feast').ready).toBe(true);
    expect(live.find((x) => x.type === 'spell').ready).toBe(true);
    expect(live.find((x) => x.type === 'beat').ready).toBe(false);
    dj.hype = hypeNeeded(dj);
    const full = hotbarSlots(s).find((x) => x.type === 'beat');
    expect(full.ready).toBe(true);
    expect(full.meter).toBe(1);
  });

  it('number keys 1-9 pick slots in order', () => {
    const { s } = village();
    const slots = hotbarSlots(s);
    expect(slotForKey(slots, '1').id).toBe('feast');
    expect(slotForKey(slots, '2').type).toBe('beat');
    expect(slotForKey(slots, '3')).toBeNull();
    expect(slotForKey(slots, 'x')).toBeNull();
    expect(slotForKey(slots, '0')).toBeNull();
  });

  it('is empty in a village with none of them', () => {
    expect(hotbarSlots(makeStateWithTownHall({}, 3))).toEqual([]);
  });
});
