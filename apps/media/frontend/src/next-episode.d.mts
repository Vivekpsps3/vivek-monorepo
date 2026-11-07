export function episodeLabel(season: number, episode: number): string;
export function nextEpisodeError(
  status: number,
  detail?: unknown,
): { message: string; reload: boolean };
