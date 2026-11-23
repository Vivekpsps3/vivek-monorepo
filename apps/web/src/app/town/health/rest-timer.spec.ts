import {
  RestTickAudio,
  formatRestClock,
  idleRestTimer,
  pauseRest,
  resetRest,
  restElapsed,
  restTickAllowed,
  startRest,
} from './rest-timer';

describe('rest timer', () => {
  it('starts, pauses, and resets without carrying a name', () => {
    const idle = idleRestTimer();
    expect(restElapsed(idle, 5_000)).toBe(0);
    expect(formatRestClock(0)).toBe('0:00');
    const running = startRest(idle, 1_000);
    expect(running.phase).toBe('running');
    expect(startRest(running, 1_500)).toBe(running);
    expect(restElapsed(running, 1_000)).toBe(0);
    expect(restElapsed(running, 900)).toBe(0);
    expect(restElapsed(running, 2_600)).toBe(1_600);
    expect(formatRestClock(1_600)).toBe('0:01');
    expect(formatRestClock(61_000)).toBe('1:01');
    const paused = pauseRest(running, 4_200);
    expect(paused).toEqual({ phase: 'paused', bankedMs: 3_200, runningSince: null });
    expect(pauseRest(paused, 9_000)).toBe(paused);
    expect(restElapsed(paused, 9_000)).toBe(3_200);
    expect(formatRestClock(3_200)).toBe('0:03');
    const again = startRest(paused, 10_000);
    expect(restElapsed(again, 11_500)).toBe(4_700);
    expect(resetRest()).toBe(idle);
    expect(pauseRest(idle, 10)).toBe(idle);
    expect(JSON.stringify(again)).not.toMatch(/press|squat|exercise/i);
  });

  it('allows a tick only while running with sound, motion, and a visible page', () => {
    const base = { sound: true, reducedMotion: false, visible: true, running: true };
    expect(restTickAllowed(base)).toBeTrue();
    expect(restTickAllowed({ ...base, sound: false })).toBeFalse();
    expect(restTickAllowed({ ...base, reducedMotion: true })).toBeFalse();
    expect(restTickAllowed({ ...base, visible: false })).toBeFalse();
    expect(restTickAllowed({ ...base, running: false })).toBeFalse();
  });
});

describe('rest tick audio', () => {
  const original = window.AudioContext;
  let visibility = 'visible';
  let reduced = false;
  let constructed = 0;
  let closed = 0;
  let started = 0;
  let stopped = 0;

  beforeEach(() => {
    visibility = 'visible';
    reduced = false;
    constructed = 0;
    closed = 0;
    started = 0;
    stopped = 0;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    spyOn(window, 'matchMedia').and.callFake((query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener() { /* unused */ },
      removeEventListener() { /* unused */ },
    }) as unknown as MediaQueryList);
    window.AudioContext = class {
      currentTime = 0;
      destination = {};
      constructor() { constructed += 1; }
      resume() { return Promise.resolve(); }
      createOscillator() {
        const oscillator = {
          type: 'sine',
          frequency: { value: 0 },
          onended: null as null | (() => void),
          connect() { return oscillator; },
          start() { started += 1; },
          stop() { stopped += 1; oscillator.onended?.(); },
        };
        return oscillator;
      }
      createGain() {
        const gain = {
          gain: {
            setValueAtTime() { /* envelope */ },
            exponentialRampToValueAtTime() { /* envelope */ },
          },
          connect() { return gain; },
        };
        return gain;
      }
      close() { closed += 1; return Promise.resolve(); }
    } as unknown as typeof AudioContext;
  });

  afterEach(() => {
    window.AudioContext = original;
    delete (document as { visibilityState?: string }).visibilityState;
  });

  it('does not open a context when sound, motion, or visibility refuses the tick', () => {
    const quiet = new RestTickAudio();
    quiet.arm(false);
    quiet.pulse(false);
    reduced = true;
    const still = new RestTickAudio();
    still.arm(true);
    still.pulse(true);
    reduced = false;
    visibility = 'hidden';
    const hidden = new RestTickAudio();
    hidden.arm(true);
    hidden.pulse(true);
    expect(constructed).toBe(0);
    expect(started).toBe(0);
  });

  it('ticks on the armed context and dispose stops any further tick', () => {
    const audio = new RestTickAudio();
    audio.pulse(true);
    expect(constructed).toBe(0);
    audio.arm(true);
    expect(audio.live).toBeTrue();
    expect(constructed).toBe(1);
    audio.pulse(true);
    expect(started).toBe(1);
    audio.silence();
    expect(stopped).toBeGreaterThan(0);
    audio.pulse(true);
    const startedBeforeDispose = started;
    audio.dispose();
    audio.dispose();
    expect(audio.live).toBeFalse();
    expect(closed).toBe(1);
    audio.arm(true);
    audio.pulse(true);
    expect(constructed).toBe(1);
    expect(started).toBe(startedBeforeDispose);
  });
});
