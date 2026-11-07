import { formatDay } from "@vivek/browser";

export function showDay(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  return formatDay(value);
}
