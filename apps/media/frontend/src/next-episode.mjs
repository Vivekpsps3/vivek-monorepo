/** Pure helpers for the mark-next-episode flow (M3). */

/** (2, 4) -> "S2E4". No zero padding; season 0 still prints "S0E1". */
export function episodeLabel(season, episode) {
  return `S${season}E${episode}`;
}

const OFFLINE_COPY = "Can't reach Media. Your progress hasn't changed. Try again.";
const STALE_COPY = "That episode is no longer next. Refresh to see your progress.";
const GONE_COPY = "This show isn't in your library anymore.";
const FALLBACK_COPY = "This could not finish. Your progress hasn't changed. Try again.";

function usableDetail(detail) {
  return typeof detail === "string" && detail.trim() !== "" ? detail : null;
}

/**
 * Map a failed mark-next response to the copy shown under the button and
 * whether the host should silently reload its data afterwards.
 */
export function nextEpisodeError(status, detail) {
  const code = Number(status) || 0;
  if (code === 0 || code === 502 || code === 503 || code === 504) {
    return { message: OFFLINE_COPY, reload: false };
  }
  if (code === 409) {
    return { message: usableDetail(detail) ?? STALE_COPY, reload: true };
  }
  if (code === 404) {
    return { message: GONE_COPY, reload: true };
  }
  return { message: usableDetail(detail) ?? FALLBACK_COPY, reload: false };
}
