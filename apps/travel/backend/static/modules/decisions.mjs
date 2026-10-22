/**
 * Bundle T decisions (§9). Flip a value here to take the other option.
 * Labels and behavior read these flags; they are not scattered through views.
 */
export const DECISIONS = {
  /** D1 (c) quick add, with the existing builders behind More details. */
  moreDetails: true,
  /** D2 undo toast for row deletes; a dialog for trip delete and key removal. */
  undoRowDeletes: true,
  /** D3 maximum decimal places shown for a PTO day count. */
  ptoDayDecimals: 2,
  /** D4 let a policy accrue in days or hours. */
  accrualHours: true,
  /** D5 leg status labels. Stored values stay planned / booked / completed / cancelled. */
  legStatuses: [
    ["planned", "Planning"],
    ["booked", "Booked"],
    ["completed", "Done"],
    ["cancelled", "Cancelled"],
  ],
  /** D6 a new trip needs one named city. */
  cityRequired: true,
  /** D7 Settings lives in the More menu. */
  settingsInMenu: true,
  /** D8 bottom tab bar below 768px. Set false for a two-row top header. */
  bottomTabs: true,
  /** D9 week start. 0 is Sunday, 1 is Monday. The month view stays links. */
  weekStartsOn: 0,
  /** D10 packing lists stay hidden. */
  showPackingKind: false,
  /** D11 the map is behind Show map below 768px. The places list stays visible. */
  mapCollapsedNarrow: true,
};
