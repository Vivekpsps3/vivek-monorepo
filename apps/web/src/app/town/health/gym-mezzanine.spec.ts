import {
  GYM_UP_PIECES,
  gymUpDetail,
  gymUpFaded,
  gymUpFrames,
  gymUpHit,
  gymUpId,
  type GymUpId,
} from './gym-mezzanine';

describe('Gym upstairs geometry', () => {
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

  it('keeps object descriptions free of digits', () => {
    for (const id of ids) {
      expect(gymUpDetail(id)).not.toMatch(/\d/);
    }
    expect(gymUpId('wall')).toBe('wall');
    expect(gymUpId('desk')).toBeNull();
    expect(gymUpId(null)).toBeNull();
  });
});
