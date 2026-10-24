/** Staged signup copy. Times are measured from the moment submit starts. */
export function signupProgress(elapsedMs: number): { button: string; note: string } {
  const button = 'Creating account…';
  if (elapsedMs >= 30_000) return { button, note: "Still working. Don't close this tab." };
  if (elapsedMs >= 5_000) return { button, note: 'Setting up encryption. This can take up to a minute.' };
  return { button, note: '' };
}

/** The vault warning collapses when the person is on their way into Media. */
export function mediaSignup(next: string | null): boolean {
  if (!next) return false;
  return next.startsWith('/media') || next.startsWith('/hub/media');
}
