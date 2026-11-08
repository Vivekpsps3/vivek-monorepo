import { Injectable, signal } from '@angular/core';

export type PixelsColorBy = 'activity' | 'app';
export type PixelsViewMode = 'grid' | 'table';

const COLOR_KEY = 'pixels.colorBy';
const VIEW_KEY = 'pixels.view';

export function readColorBy(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): PixelsColorBy {
  return storage?.getItem(COLOR_KEY) === 'app' ? 'app' : 'activity';
}

export function writeColorBy(value: PixelsColorBy, storage: Pick<Storage, 'setItem'> | null = defaultStorage()): void {
  storage?.setItem(COLOR_KEY, value);
}

export function readViewMode(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): PixelsViewMode {
  return storage?.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid';
}

export function writeViewMode(value: PixelsViewMode, storage: Pick<Storage, 'setItem'> | null = defaultStorage()): void {
  storage?.setItem(VIEW_KEY, value);
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class PixelsPreferences {
  readonly colorBy = signal<PixelsColorBy>(readColorBy());
  readonly view = signal<PixelsViewMode>(readViewMode());

  setColorBy(value: PixelsColorBy): void {
    this.colorBy.set(value);
    writeColorBy(value);
  }

  setView(value: PixelsViewMode): void {
    this.view.set(value);
    writeViewMode(value);
  }
}
