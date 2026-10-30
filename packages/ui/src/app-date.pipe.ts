import { Pipe, PipeTransform } from '@angular/core';
import { formatDate, formatOpenEndedRange } from '@vivek/browser';

@Pipe({ name: 'appDate', standalone: true })
export class AppDatePipe implements PipeTransform {
  transform(
    value: string | null | undefined,
    style: 'table' | 'heading' | 'timestamp' | 'time' | 'month' | 'range' = 'table',
  ): string {
    return formatDate(value, style);
  }
}

@Pipe({ name: 'appDateRange', standalone: true })
export class AppDateRangePipe implements PipeTransform {
  transform(start: string | null | undefined, end?: string | null): string {
    return formatOpenEndedRange(start, end);
  }
}
