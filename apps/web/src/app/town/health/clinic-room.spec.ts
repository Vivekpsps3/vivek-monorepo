import { DEFAULT_HEALTH_UNITS } from './health-entry';
import {
  CLINIC_PIECES,
  clinicFaded,
  clinicFrames,
  clinicHit,
  clinicObjectId,
  clinicRoomDetail,
  clinicUnitLine,
  type ClinicObjectId,
} from './clinic-room';

describe('Clinic room geometry', () => {
  const ids: Array<ClinicObjectId | null> = [null, 'reception', 'weight', 'rhr', 'bp', 'sleep', 'labs', 'checkups'];

  it('picks the front object and fades whatever covers the selection', () => {
    expect(clinicHit({ x: 40, y: 40 })).toBe('reception');
    expect(clinicHit({ x: 320, y: 90 })).toBe('weight');
    expect(clinicHit({ x: 250, y: 100 })).toBe('weight');
    expect(clinicHit({ x: 500, y: 50 })).toBe('rhr');
    expect(clinicHit({ x: 380, y: 100 })).toBe('rhr');
    expect(clinicHit({ x: 60, y: 250 })).toBe('bp');
    expect(clinicHit({ x: 220, y: 190 })).toBe('bp');
    expect(clinicHit({ x: 450, y: 250 })).toBe('sleep');
    expect(clinicHit({ x: 260, y: 220 })).toBe('sleep');
    expect(clinicHit({ x: 540, y: 180 })).toBe('labs');
    expect(clinicHit({ x: 540, y: 300 })).toBe('checkups');
    expect(clinicHit({ x: 8, y: 8 })).toBeNull();
    expect(clinicFaded('reception').has('weight')).toBeTrue();
    expect(clinicFaded('reception').has('rhr')).toBeFalse();
    expect(clinicFaded('weight').has('rhr')).toBeTrue();
    expect(clinicFaded('weight').has('bp')).toBeTrue();
    expect(clinicFaded('weight').has('sleep')).toBeFalse();
    expect(clinicFaded('bp').has('sleep')).toBeTrue();
    expect(clinicFaded('sleep').size).toBe(0);
    expect(clinicFaded('labs').size).toBe(0);
    expect(clinicFaded('checkups').size).toBe(0);
    expect(clinicFaded(null).size).toBe(0);
    expect(clinicFrames().map(frame => frame.id)).toEqual(['reception', 'weight', 'rhr', 'bp', 'sleep', 'labs', 'checkups']);
    expect(CLINIC_PIECES).toHaveSize(7);
  });

  it('keeps object descriptions free of digits and advice', () => {
    for (const id of ids) {
      const detail = clinicRoomDetail(id);
      expect(detail).not.toMatch(/\d/);
      expect(detail).not.toMatch(/normal|healthy|diagnos/i);
    }
    const units = DEFAULT_HEALTH_UNITS;
    expect(clinicUnitLine('weight', units)).toBe('Shown in pounds. Stored in kilograms.');
    expect(clinicUnitLine('weight', { weight: 'kg', distance: 'mi' })).toBe('Shown in kilograms. Stored in kilograms.');
    expect(clinicUnitLine('rhr', units)).toBe('Shown in beats per minute.');
    expect(clinicUnitLine('bp', units)).toContain('millimetres of mercury');
    expect(clinicUnitLine('sleep', units)).toBe('Shown in hours.');
    for (const id of ['weight', 'rhr', 'bp', 'sleep'] as const) {
      expect(clinicUnitLine(id, units)).not.toMatch(/\d|normal|healthy|diagnos/i);
      expect(clinicUnitLine(id, { weight: 'kg', distance: 'km' })).not.toMatch(/\d|normal|healthy|diagnos/i);
    }
    expect(clinicObjectId('weight')).toBe('weight');
    expect(clinicObjectId('labs')).toBe('labs');
    expect(clinicObjectId('checkups')).toBe('checkups');
    expect(clinicObjectId('desk')).toBeNull();
    expect(clinicObjectId(null)).toBeNull();
  });
});
