import { InjectionToken } from '@angular/core';
import type { SessionPort } from '@vivek/auth';

export const SESSION_CONTEXT = new InjectionToken<SessionPort>('Suite session');
export type { SessionPort } from '@vivek/auth';
