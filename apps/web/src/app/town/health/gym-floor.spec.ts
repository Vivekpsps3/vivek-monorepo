import { GYM_PIECES, gymFaded, gymFloorDetail, gymFloorId, gymFrames, gymHit, type GymFloorId } from './gym-floor';

describe('Gym floor geometry', () => {
  const ids: Array<GymFloorId | null> = [null, 'desk', 'station', 'bench'];

  it('picks the front object and fades whatever covers the selection', () => {
    expect(gymHit({ x: 80, y: 60 })).toBe('desk');
    expect(gymHit({ x: 300, y: 180 })).toBe('bench');
    expect(gymHit({ x: 500, y: 280 })).toBe('station');
    expect(gymHit({ x: 230, y: 154 })).toBe('bench');
    expect(gymHit({ x: 420, y: 220 })).toBe('station');
    expect(gymHit({ x: 8, y: 8 })).toBeNull();
    expect(gymFaded('bench').has('station')).toBeTrue();
    expect(gymFaded('bench').has('desk')).toBeFalse();
    expect(gymFaded(null).size).toBe(0);
    expect(gymFrames().map(frame => frame.id)).toEqual(['desk', 'bench', 'station']);
    expect(GYM_PIECES).toHaveSize(3);
  });

  it('keeps object descriptions free of digits', () => {
    for (const id of ids) {
      expect(gymFloorDetail(id)).not.toMatch(/\d/);
    }
    expect(gymFloorId('station')).toBe('station');
    expect(gymFloorId('trophy')).toBeNull();
    expect(gymFloorId(null)).toBeNull();
  });
});
