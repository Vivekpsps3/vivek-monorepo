import { mediaSignup, signupProgress } from './signup-progress';

describe('signup progress', () => {
  it('stages the button copy at 0s, 5s, and 30s', () => {
    expect(signupProgress(0)).toEqual({ button: 'Creating account…', note: '' });
    expect(signupProgress(4_999).note).toBe('');
    expect(signupProgress(5_000).note).toBe('Setting up encryption. This can take up to a minute.');
    expect(signupProgress(30_000).note).toBe("Still working. Don't close this tab.");
  });

  it('collapses the vault warning only for a Media destination', () => {
    expect(mediaSignup('/media/')).toBeTrue();
    expect(mediaSignup('/media/#/library')).toBeTrue();
    expect(mediaSignup('/hub/media')).toBeTrue();
    expect(mediaSignup('/hub')).toBeFalse();
    expect(mediaSignup(null)).toBeFalse();
  });
});
