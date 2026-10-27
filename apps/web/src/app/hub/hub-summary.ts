const RELEASE_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Same kind words as the journal. */
export function journalKindLabel(kind: string): string {
  return ({
    movie: 'Movie',
    tv: 'Series',
    book: 'Book',
    track: 'Song',
    album: 'Album',
    artist: 'Artist',
    game: 'Game',
  } as Record<string, string>)[kind] || 'Media';
}

/** Phrases for Hub release rows. Month and year precision never become a calendar day. */
export function mediaReleaseLabel(item: {
  when?: string | null;
  precision?: string | null;
  release_on?: string | null;
}): string | null {
  switch (item.when) {
    case 'today': return 'Releases today';
    case 'tomorrow': return 'Releases tomorrow';
    case 'this_week': return 'This week';
    case 'this_month': return 'This month';
    case 'recent': return 'Recently released';
    case 'postponed': return 'Postponed';
    case 'unknown': return 'No date';
    default:
      break;
  }
  if (!item.release_on || item.precision === 'unknown') return 'Upcoming';
  if (item.precision === 'year') return item.release_on.slice(0, 4);
  if (item.precision === 'month') {
    const [year, month] = item.release_on.split('-');
    const name = RELEASE_MONTHS[Number(month) - 1];
    return name && year ? `${name} ${year}` : 'Upcoming';
  }
  return null;
}
