/** One short original tone. The context closes when the tone ends or the page hides. */
export async function playSceneTone(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const context = new window.AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    try { oscillator.stop(); } catch { /* already stopped */ }
  };
  const onHide = (): void => {
    if (document.visibilityState === 'hidden') stop();
  };
  document.addEventListener('visibilitychange', onHide);
  try {
    oscillator.type = 'sine';
    oscillator.frequency.value = 523.25;
    const start = context.currentTime;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.03, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    await new Promise<void>(resolve => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      oscillator.onended = finish;
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  } finally {
    document.removeEventListener('visibilitychange', onHide);
    await context.close();
  }
}
