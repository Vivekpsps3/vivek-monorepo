import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  bindSystemTheme,
  readThemeChoice,
  resolveThemeChoice,
  setThemePreference,
  type ThemeChoice,
  type UiTheme,
} from '@vivek/ui';

export type Theme = ThemeChoice;

const KEY = 'ft-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  private readonly choiceSubject = new BehaviorSubject<ThemeChoice>(readThemeChoice(KEY));
  private readonly resolvedSubject = new BehaviorSubject<UiTheme>(resolveThemeChoice(this.choiceSubject.value));
  readonly choice$ = this.choiceSubject.asObservable();
  /** Resolved light or dark value currently painted on the document. */
  readonly theme$ = this.resolvedSubject.asObservable();
  private readonly unbind = bindSystemTheme(KEY, resolved => {
    this.resolvedSubject.next(resolved);
  });

  constructor() {
    setThemePreference(this.choiceSubject.value, KEY);
  }

  get current(): ThemeChoice {
    return this.choiceSubject.value;
  }

  get resolved(): UiTheme {
    return this.resolvedSubject.value;
  }

  set(theme: ThemeChoice): void {
    setThemePreference(theme, KEY);
    this.choiceSubject.next(theme);
    this.resolvedSubject.next(resolveThemeChoice(theme));
  }

  ngOnDestroy(): void {
    this.unbind();
  }
}
