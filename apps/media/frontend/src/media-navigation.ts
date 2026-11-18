import type { UiSectionNavItem } from "@vivek/ui";

export const mediaSections: readonly UiSectionNavItem[] = [
  { label: "Now", link: "/media", exact: true },
  { label: "Movies", link: "/media/library?kind=movie" },
  { label: "Series", link: "/media/library?kind=tv" },
  { label: "Books", link: "/media/library?kind=book" },
  {
    label: "Music",
    link: "/media/library?kind=artist",
    also: ["/media/library?kind=album", "/media/library?kind=track"],
  },
  { label: "Games", link: "/media/library?kind=game" },
  { label: "Calendar", link: "/media/calendar" },
  { label: "Search", link: "/media/search" },
  { label: "Add", ariaLabel: "Add manually", link: "/media/add" },
  { label: "All items", link: "/media/library", also: ["/media/item"] },
];
