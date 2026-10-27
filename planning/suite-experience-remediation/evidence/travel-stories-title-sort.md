# Trip stories, rating, search pages, and Unicode title order — 2026-10-27

Ten scoped follow-ups. They do not close TRV-04, ERR-01, NAV-01, ARC-05,
SRC-02, DEL-ALL, DOC-01, QA-01, or PR-01. No commit, push, PR, or deployment
was made. The Travel coverage floor stays 80.41%. The Media floor stays 70.6%
even though the gate reported 79.45%.

## Overlapping PTO

Trip detail already computed `pto.conflicts`. The trip page now prints each
shared date, the combined amount, and the labels. Home cards for trips with
those conflicts say "PTO overlaps". The browser story creates North trip and
South trip on 2026-12-07 through 2026-12-09 and checks both surfaces. No PTO
policy is required, because each trip projection carries its own conflicts.

## Same day and one night

The trip header used to print `0 nights` for a departure that is also the
return. Zero nights now read "same day", and one night reads "1 night". Longer
trips still use the number of nights. Lisbon on 2026-12-14 and Porto from
2026-12-16 to 2026-12-17 cover the two wordings.

## Home attention

`attention_for` already listed unbooked necessary parking and open reminders.
Home now shows them under "Needs a look", with the trip title linking to that
trip. The parking form still cannot mark a spot necessary, so the story seeds
`necessary: "yes"` and an open reminder through the API.

## Two cities, a reversed return, a leap day, and a half day

The new-trip screen already named two cities "Kyoto and Osaka" and already
refused a return before departure inside `range()`. Save now refuses that
order as well, and the Save button stays disabled while the return is earlier.
Correcting the return allows the save. A leap-day trip from 2028-02-29 to
2028-03-01 keeps February 29, counts both weekdays as PTO, and shows one night.
Choosing Half day on 2026-12-15 saves 0.5 PTO days and reopens as Half day.

## Rating zero and a cleared rating

Empty number input stays null. A saved 0 remains 0, the library card shows
"0 / 10", and clearing the field saves null so the card no longer shows a score.

## Search pages

Search already moved `offset` by 20. The browser story mocks two windows and
checks More results, then Previous, including the offset in the URL.

## Unicode library order

SQLite `lower()` does not fold accents. `catalog_items.title_sort` stores an
NFKD casefold key with combining marks removed. A listener fills it on insert
and update, and revision `site_catalog_title_sort_v1` backfills existing rows.
Library title order still pages in SQL. Alpha, ångström, Éclair, école, and
Zebra sort in that order. The autogenerate drift check stayed empty. This does
not close the rest of the schema-drift audit.

## Verification

| Command | Result | Log |
| --- | --- | --- |
| Full Travel Playwright | 66 passed, no skips | /tmp/suite-ten-travel-browser.log |
| Full Media Playwright | 46 passed, no skips | /tmp/suite-ten-media-browser.log |
| Sort, migration head, backfill, and drift tests | 14 passed | /tmp/suite-ten-pytest.log |
| `./scripts/coverage-gate.sh media` | 138 passed; 79.45%, floor 70.6% | /tmp/suite-ten-media-coverage.log |
| Ruff ratchet | 101 findings match the baseline | /tmp/suite-ten-ruff.log |
| `ng build web --configuration production` | Passed, 2026-10-27 06:37:44 UTC | /tmp/suite-ten-build2.log |

The passing browser runs served that bundle. The Travel coverage floor was not
re-measured and was not changed.
