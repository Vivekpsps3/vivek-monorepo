import * as logic from './index';

describe('logic exports', () => {
  it('exposes the world logic API', () => {
    expect(typeof logic.engineWeek).toBe('function');
    expect(typeof logic.scaleForWidth).toBe('function');
    expect(typeof logic.prefersReducedMotion).toBe('function');
    expect(typeof logic.panDurationMs).toBe('function');
    expect(typeof logic.inertiaFactor).toBe('function');
    expect(typeof logic.isTap).toBe('function');
    expect(typeof logic.shouldScheduleFrame).toBe('function');
    expect(typeof logic.snapWeek).toBe('function');
    expect(typeof logic.tileOfDay).toBe('function');
    expect(typeof logic.applyCamera).toBe('function');
    expect(typeof logic.bandAt).toBe('function');
    expect(typeof logic.createChunkCache).toBe('function');
    expect(typeof logic.createBitmapCache).toBe('function');
    expect(typeof logic.bitmapKey).toBe('function');
    expect(typeof logic.initialRange).toBe('function');
    expect(typeof logic.nextOlderRange).toBe('function');
    expect(typeof logic.shouldPage).toBe('function');
    expect(typeof logic.oneInFlight).toBe('function');
    expect(typeof logic.prependedWeekCount).toBe('function');
    expect(typeof logic.addIsoDays).toBe('function');
    expect(typeof logic.isoMonday).toBe('function');
    expect(typeof logic.readingForWeeks).toBe('function');
    expect(typeof logic.readingWeek).toBe('function');
    expect(typeof logic.fogStorageKey).toBe('function');
    expect(typeof logic.readFogEnabled).toBe('function');
    expect(typeof logic.writeFogEnabled).toBe('function');
    expect(typeof logic.fogMask).toBe('function');
    expect(typeof logic.litSummary).toBe('function');
    expect(typeof logic.chestOverlay).toBe('function');
    expect(typeof logic.weeksToRegenerate).toBe('function');
  });
});
