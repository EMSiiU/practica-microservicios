import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'mxn',
  standalone: true,
})
export class MxnPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '$0.00';
    }
    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `$${formatted}`;
  }
}
