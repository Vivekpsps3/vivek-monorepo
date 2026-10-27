import { Pipe, PipeTransform } from '@angular/core';
import {
  formatMoney,
  fromDollars,
  moneyAriaLabel,
  type MoneySign,
  type MoneyStyle,
} from '@vivek/browser';

/** Formats a stored dollar amount through integer cents. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(
    value: number | null | undefined,
    style: MoneyStyle = 'standard',
    sign: MoneySign = 'auto',
    approx = false,
  ): string {
    return formatMoney(fromDollars(value), { style, sign, approx });
  }
}

@Pipe({ name: 'moneyAria', standalone: true })
export class MoneyAriaPipe implements PipeTransform {
  transform(
    value: number | null | undefined,
    style: MoneyStyle = 'standard',
    sign: MoneySign = 'auto',
    approx = false,
  ): string | null {
    return moneyAriaLabel(fromDollars(value), { style, sign, approx });
  }
}
