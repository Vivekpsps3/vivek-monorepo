import {
  GYM_UP_PIECES,
  gymUpDetail,
  gymUpFaded,
  gymUpFrames,
  gymUpHit,
  gymUpId,
  type GymUpId,
} from './gym-mezzanine';
import type { GymGate } from './gym-floor';

describe('Gym upstairs geometry', () => {
  const gates: GymGate[] = ['locked', 'setup', 'unavailable', 'ready'];
  const ids: Array<GymUpId | null> = [null, 'wall', 'cabinet'];

  it('picks the cabinet over the wall and fades what covers the wall', () => {
    expect(gymUpHit({ x: 80, y: 80 })).toBe('wall');
    expect(gymUpHit({ x: 340, y: 180 })).toBe('cabinet');
    expect(gymUpHit({ x: 500, y: 250 })).toBe('cabinet');
    expect(gymUpHit({ x: 8, y: 8 })).toBeNull();
    expect(gymUpFaded('wall').has('cabinet')).toBeTrue();
    expect(gymUpFaded('cabinet').size).toBe(0);
    expect(gymUpFaded(null).size).toBe(0);
    expect(gymUpFrames().map(frame => frame.id)).toEqual(['wall', 'cabinet']);
    expect(GYM_UP_PIECES).toHaveSize(2);
  });

  it('keeps locked, empty, and unavailable copy free of digits', () => {
    for (const gate of gates) {
      for (const id of ids) {
        expect(gymUpDetail(id, gate)).not.toMatch(/\d/);
      }
    }
    expect(gymUpId('wall')).toBe('wall');
    expect(gymUpId('desk')).toBeNull();
    expect(gymUpId(null)).toBeNull();
  });
});
