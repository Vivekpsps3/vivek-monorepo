import { HabitDialogComponent } from '../habit-dialog.component';
import { HistoryDialogComponent } from '../history-dialog.component';
import { TownLotComponent } from '../town-lot.component';
import { TownTodayComponent } from '../town-today.component';
import { TownComponent } from '../town.component';
import * as healthMath from './health-math';
import * as healthStore from './health-store.service';
import * as healthUnits from './health-units';
import * as healthValidate from './health-validate';
import * as healthConstants from './health.constants';

/**
 * AC-H10: Town Health never asks for a passphrase. No file under
 * apps/web/src/app/town/ may reference a passphrase input — the vault is
 * either already unlocked in this tab or Town shows the locked state.
 *
 * Karma does not serve raw source files, so the scan runs over the
 * compiled form of the town feature as loaded by this test bundle: every
 * town component's compiled definition (its inlined template and styles,
 * where an <input type="password"> would live) and the exported runtime
 * values and function sources of the health modules. A raw-text scan of
 * the same folder is one grep away for reviewers:
 *   grep -ri 'passphrase\|type="password"' apps/web/src/app/town/
 * This spec file is the scanner, so its own strings are not scanned.
 */
const FORBIDDEN = ['passphrase', 'type="password"', "type='password'"];

/** Collect every string and function source reachable from a value. */
function collectText(value: unknown, seen: Set<object>, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (typeof value === 'function') {
    out.push(Function.prototype.toString.call(value));
    return;
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    collectText((value as Record<string, unknown>)[key], seen, out);
  }
}

function scan(label: string, subject: unknown): void {
  const out: string[] = [];
  collectText(subject, new Set(), out);
  const text = out.join('\n').toLowerCase();
  for (const needle of FORBIDDEN) {
    expect(text).withContext(`${label} must not contain ${needle}`).not.toContain(needle);
  }
}

describe('AC-H10: no passphrase input anywhere under town/', () => {
  const components = [
    ['TownComponent', TownComponent],
    ['HabitDialogComponent', HabitDialogComponent],
    ['HistoryDialogComponent', HistoryDialogComponent],
    ['TownLotComponent', TownLotComponent],
    ['TownTodayComponent', TownTodayComponent],
  ] as const;
  for (const [label, component] of components) {
    it(`scans the compiled ${label} definition`, () => {
      scan(label, (component as unknown as { ɵcmp: unknown }).ɵcmp);
      scan(label, (component as unknown as { ɵfac: unknown }).ɵfac);
    });
  }

  const modules = [
    ['health-math', healthMath],
    ['health-store.service', healthStore],
    ['health-units', healthUnits],
    ['health-validate', healthValidate],
    ['health.constants', healthConstants],
  ] as const;
  for (const [label, module] of modules) {
    it(`scans the ${label} module exports`, () => scan(label, module));
  }
});
