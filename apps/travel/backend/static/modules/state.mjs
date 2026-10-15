// Travel client state and domain choices.
export const ROLES = [
  ["outbound", "Outbound"],
  ["connection", "Between cities"],
  ["local", "Local"],
  ["inbound", "Inbound"],
];
export const MODES = [
  ["flight", "Flight"],
  ["drive", "Drive"],
  ["train", "Train"],
  ["bus", "Bus"],
  ["ferry", "Ferry"],
  ["other", "Other"],
];
export const KINDS = [
  ["restaurant", "Restaurant"],
  ["activity", "Activity"],
  ["lodging", "Lodging"],
  ["transit", "Getting around"],
  ["other", "Other"],
];
export const ARRANGEMENTS = [
  ["self_park", "I'm parking"],
  ["valet", "Valet"],
  ["offsite", "Off-site lot"],
  ["dropoff", "Someone is dropping me off"],
  ["pickup", "Someone is picking me up"],
  ["rideshare", "Rideshare"],
  ["none", "Not needed"],
];
export const NECESSARY = [
  ["yes", "Yes, I need parking"],
  ["no", "No"],
  ["unknown", "Not sure yet"],
];
export const STATUSES = [
  ["planning", "Planning"],
  ["booked", "Booked"],
  ["done", "Done"],
];
export const CADENCE = [
  ["yearly", "Each year"],
  ["monthly", "Each month"],
  ["semimonthly", "Twice a month"],
  ["biweekly", "Every two weeks"],
  ["weekly", "Each week"],
];
export const state = {
  seq: 0,
  error: "",
  trip: null,
  edit: null,
  compose: "",
  composeDate: "",
  composeRole: "outbound",
  flights: [],
  fieldSeq: 0,
};
