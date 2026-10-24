import { Pipe, PipeTransform } from '@angular/core';
import { plural } from '@vivek/browser';

@Pipe({ name: 'plural', standalone: true })
export class PluralPipe implements PipeTransform {
  transform(count: number | null | undefined, singular: string, pluralForm?: string): string {
    return plural(count ?? 0, singular, pluralForm);
  }
}
