import { sceneAudio } from './scene-audio';
import { playSceneTone } from './scene-sound';

describe('scene sound', () => {
  const original = window.AudioContext;
  let visibility = 'visible';

  beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });

  afterEach(() => {
    window.AudioContext = original;
    delete (document as { visibilityState?: string }).visibilityState;
  });

  it('plays one tone and closes the context', async () => {
    let constructed = 0;
    let closed = 0;
    let stops = 0;
    window.AudioContext = class {
      currentTime = 0;
      destination = {};
      constructor() { constructed += 1; }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { value: 0 },
          onended: null as null | (() => void),
          connect() { return this; },
          start() { /* one shot */ },
          stop() { stops += 1; this.onended?.(); },
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime() { /* envelope */ },
            exponentialRampToValueAtTime() { /* envelope */ },
          },
          connect() { return this; },
        };
      }
      close() { closed += 1; return Promise.resolve(); }
    } as unknown as typeof AudioContext;

    await sceneAudio.play();
    expect(constructed).toBe(1);
    expect(stops).toBe(1);
    expect(closed).toBe(1);
  });

  it('does not construct a context while hidden or motion is reduced', async () => {
    let constructed = 0;
    window.AudioContext = class {
      constructor() { constructed += 1; }
    } as unknown as typeof AudioContext;
    visibility = 'hidden';
    await playSceneTone();
    visibility = 'visible';
    spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
    await playSceneTone();
    expect(constructed).toBe(0);
  });
});
