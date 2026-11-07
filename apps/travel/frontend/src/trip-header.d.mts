export function showSubtitle(title: string, cities: readonly string[]): boolean;
export function nightsWord(nights: number): string;
export function ptoText(value: string | number | null | undefined): string;

export interface TransportSide {
  date: string;
  time: string;
}

export interface TransportWhen {
  depart: TransportSide | null;
  arrive: TransportSide | null;
  sameDay: boolean;
}

export function transportWhen(
  departAt: string | null | undefined,
  arriveAt: string | null | undefined,
): TransportWhen;
