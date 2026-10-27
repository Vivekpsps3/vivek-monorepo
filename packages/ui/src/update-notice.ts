import { InjectionToken, type Signal } from '@angular/core';

/** Allows an active modal to expose the shell's notice without enabling its background. */
export interface UpdateNotice {
  readonly noticeVisible: Signal<boolean>;
  readonly updateAvailable: Signal<boolean>;
  dismissNotice(): void;
}

export const UPDATE_NOTICE = new InjectionToken<UpdateNotice>('Suite update notice');
