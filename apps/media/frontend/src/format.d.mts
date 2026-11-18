/** A month or year stays a band. The implementation lives in format.mjs. */
export function releaseBand(
  event:
    | {
        release_status?: string | null;
        status?: string | null;
        precision?: string | null;
        release_on?: string | null;
        released_on?: string | null;
      }
    | null
    | undefined,
): string;
