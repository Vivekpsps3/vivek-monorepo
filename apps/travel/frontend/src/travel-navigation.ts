import type { UiSectionNavItem } from "@vivek/ui";

export const travelSections: readonly UiSectionNavItem[] = [
  { label: "Trips", link: "/travel", exact: true, also: ["/travel/trips"] },
  { label: "Terminal", link: "/travel/terminal", exact: true },
  { label: "Memories", link: "/travel/memories", exact: true },
  { label: "Calendar", link: "/travel/calendar" },
  { label: "PTO", link: "/travel/pto" },
];
