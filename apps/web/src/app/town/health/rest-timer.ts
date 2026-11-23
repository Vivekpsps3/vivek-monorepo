/**
 * Local rest clock for the open workout session.
 * It is not a vault record, a notification, or a reward.
 * Leave and lock dispose the clock and any tick.
 */

export type RestPhase = 'idle' | 'running' | 'paused';

export interface RestTimer {
  readonly phase: RestPhase;
  /** Milliseconds already counted before the current run. */
  readonly bankedMs: number;
  /** Clock time when the current run began. Null unless running. */
  readonly runningSince: number | null;
}

export interface RestTickPolicy {
  readonly sound: boolean;
  readonly reducedMotion: boolean;
  readonly visible: boolean;
  readonly running: boolean;
}

const IDLE_REST: RestTimer = Object.freeze({
  phase: 'idle',
  bankedMs: 0,
  runningSince: null,
});

export function idleRestTimer(): RestTimer {
  return IDLE_REST;
}

export function restElapsed(timer: RestTimer, now: number): number {
  if (timer.phase !== 'running' || timer.runningSince === null) return timer.bankedMs;
  const delta = now - timer.runningSince;
  return timer.bankedMs + (delta > 0 ? delta : 0);
}

export function startRest(timer: RestTimer, now: number): RestTimer {
  if (timer.phase === 'running') return timer;
  return { phase: 'running', bankedMs: timer.bankedMs, runningSince: now };
}

export function pauseRest(timer: RestTimer, now: number): RestTimer {
  if (timer.phase !== 'running') return timer;
  return { phase: 'paused', bankedMs: restElapsed(timer, now), runningSince: null };
}

export function resetRest(): RestTimer {
  return IDLE_REST;
}

/** Minutes may pass 59. Seconds stay two digits. The text never names an exercise. */
export function formatRestClock(elapsedMs: number): string {
  const total = Math.floor(Math.max(0, elapsedMs) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** A tick may sound only while the clock is running, Town sound is on, and motion is allowed. */
export function restTickAllowed(policy: RestTickPolicy): boolean {
  return policy.running && policy.sound && !policy.reducedMotion && policy.visible;
}

/** One short tick. The context exists only after arm and closes on dispose. */
export class RestTickAudio {
  private context: AudioContext | null = null;
  private stopOscillator: (() => void) | null = null;
  private closed = false;

  get live(): boolean {
    return this.context !== null && !this.closed;
  }

  arm(allowed: boolean): void {
    if (!allowed || this.closed || this.context || !this.canPlay()) return;
    try {
      const context = new AudioContext();
      this.context = context;
      void context.resume?.().catch(() => undefined);
    } catch {
      this.context = null;
    }
  }

  pulse(allowed: boolean): void {
    if (!allowed || this.closed || !this.context || !this.canPlay()) {
      this.silence();
      return;
    }
    this.silence();
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const stop = (): void => {
      try { oscillator.stop(); } catch { /* already stopped */ }
    };
    this.stopOscillator = stop;
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    const start = context.currentTime;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.02, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => {
      if (this.stopOscillator === stop) this.stopOscillator = null;
    };
    oscillator.start(start);
    oscillator.stop(start + 0.05);
  }

  silence(): void {
    const stop = this.stopOscillator;
    this.stopOscillator = null;
    stop?.();
  }

  /** Idempotent. A later pulse cannot open a new context. */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.silence();
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => undefined);
  }

  private canPlay(): boolean {
    if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    return typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
