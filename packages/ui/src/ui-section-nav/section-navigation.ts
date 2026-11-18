import type { IsActiveMatchOptions, Router } from '@angular/router';

export interface UiSectionNavItem {
  label: string;
  ariaLabel?: string;
  link: string;
  exact?: boolean;
  also?: readonly string[];
}

const match: IsActiveMatchOptions = {
  paths: 'subset',
  queryParams: 'subset',
  fragment: 'ignored',
  matrixParams: 'ignored',
};

export function currentSectionNavLink(router: Router, items: readonly UiSectionNavItem[]): string | undefined {
  let current: string | undefined;
  let specificity = -1;
  for (const item of items) {
    for (const link of [item.link, ...(item.also ?? [])]) {
      const url = router.parseUrl(link);
      // A matching tab or category takes precedence over its default view.
      const queryCount = url.queryParamMap.keys.length;
      const options = link === item.link && item.exact ? { ...match, paths: 'exact' as const } : match;
      if (queryCount > specificity && router.isActive(url, options)) {
        current = item.link;
        specificity = queryCount;
      }
    }
  }
  return current;
}
