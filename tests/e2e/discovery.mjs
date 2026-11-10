// Intended Playwright projects and the Town filename allowlist.
// Habit, check-in, and dialog files run with Pixels and World.
// In-file phone, desktop, and platform skips stay inside a selected spec.
// A whole spec the allowlist omits needs an owner, issue, and reason below.
export const townTestMatch = /(?:pixels-(?:year|detail|life)|hub-pixels|world|town-checkin|town-dialogs|town)\.spec\.ts/;

export const intendedProjects = [
  { name: 'finance', testDir: 'apps/finance/frontend/e2e', domain: 'finance' },
  { name: 'travel', testDir: 'apps/travel/e2e', domain: 'travel' },
  { name: 'media', testDir: 'apps/media/e2e', domain: 'media' },
  { name: 'town', testDir: 'apps/web/e2e', domain: 'town', testMatch: townTestMatch },
  { name: 'suite', testDir: 'tests/e2e', useDomain: 'media' },
];

export const ownedExclusions = [
  {
    project: 'town',
    file: 'apps/web/e2e/pixels-settings.spec.ts',
    owner: 'UX-01',
    issue: '#259',
    reason: 'Profile birthday settings stay unselected until UX-01 repairs Profile loads.',
  },
];

export function projectByName(name) {
  const project = intendedProjects.find((item) => item.name === name);
  if (!project) throw new Error(`No e2e project for ${name}`);
  return project;
}
