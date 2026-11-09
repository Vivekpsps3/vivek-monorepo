// Intended Playwright projects and the only Town filename allowlist.
// In-file phone, desktop, and platform skips stay inside a selected spec.
// A whole spec the allowlist omits needs an owner, issue, and reason below.
export const townTestMatch = /(?:pixels-(?:year|detail|life)|hub-pixels|world)\.spec\.ts/;

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
    file: 'apps/web/e2e/town.spec.ts',
    owner: 'TOWN-01',
    issue: '#249',
    reason: 'Town founding stays unselected until TOWN-01 activates the existing fixtures.',
  },
  {
    project: 'town',
    file: 'apps/web/e2e/town-checkin.spec.ts',
    owner: 'TOWN-01',
    issue: '#249',
    reason: 'Town check-in stays unselected until TOWN-01 activates the existing fixtures.',
  },
  {
    project: 'town',
    file: 'apps/web/e2e/town-dialogs.spec.ts',
    owner: 'TOWN-01',
    issue: '#249',
    reason: 'Town dialogs stay unselected until TOWN-01 activates the existing fixtures.',
  },
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
