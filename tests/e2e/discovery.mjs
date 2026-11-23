// Intended Playwright projects and the Town filename allowlist.
// Habit, check-in, dialog, and Health entry files run with Pixels and World.
// In-file phone, desktop, and platform skips stay inside a selected spec.
// A whole spec the allowlist omits needs an owner, issue, and reason below.
export const townTestMatch = /(?:pixels-(?:year|detail|life|day|settings|atlas)|hub-(?:pixels|up-next)|world|town-checkin|town-dialogs|town-date-visit|town-habits|town-hall|town-home|town-keepsakes|town-media-boundary|town-scene|cosmetic-catalog|town|health-entry)\.spec\.ts/;

export const intendedProjects = [
  { name: 'finance', testDir: 'apps/finance/frontend/e2e', domain: 'finance' },
  { name: 'travel', testDir: 'apps/travel/e2e', domain: 'travel' },
  { name: 'media', testDir: 'apps/media/e2e', domain: 'media' },
  { name: 'town', testDir: 'apps/web/e2e', domain: 'town', testMatch: townTestMatch },
  { name: 'suite', testDir: 'tests/e2e', useDomain: 'media' },
];

export const ownedExclusions = [];

export function projectByName(name) {
  const project = intendedProjects.find((item) => item.name === name);
  if (!project) throw new Error(`No e2e project for ${name}`);
  return project;
}
