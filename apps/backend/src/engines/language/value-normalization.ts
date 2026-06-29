import type { FieldType } from './sjbl-dictionary';

/**
 * Parses a human-entered number or money value into a finite number.
 * Handles thousands separators, currency symbols/codes and accounting-style
 * negatives in parentheses. Returns null when no number can be recovered.
 */
export function parseDecimal(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (text === '') return null;

  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  // Strip currency codes/symbols and spaces, keep digits, separators and minus.
  text = text.replace(/[^0-9.,-]/g, '');
  if (text === '' || text === '-' || text === '.') return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // The right-most separator is the decimal separator.
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    // A lone comma is a decimal separator only when it looks like one.
    text = /,\d{1,2}$/.test(text) ? text.replace(',', '.') : text.replace(/,/g, '');
  }
  text = text.replace(/(?!^)-/g, '');

  const parsed = Number(text);
  return Number.isFinite(parsed) ? sign * parsed : null;
}

/**
 * Parses a date into an ISO `yyyy-mm-dd` string. Day-first formats (common
 * outside the US) are interpreted as day/month/year. Returns null when the
 * value cannot be parsed.
 */
export function parseDateToIso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : toIsoDate(value);
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : toIsoDate(fromNumber);
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '') return null;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return buildIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }
  const slashMatch = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (slashMatch) {
    let [day, month] = [Number(slashMatch[1]), Number(slashMatch[2])];
    // If the first component cannot be a day, treat the input as month-first.
    if (day > 12 && month <= 12) {
      // already day-first
    } else if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    const year = normalizeYear(Number(slashMatch[3]));
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return buildIso(year, month, day);
  }
  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : toIsoDate(fallback);
}

export function coerceValue(value: unknown, type: FieldType, enumValues?: string[]): unknown {
  if (value === null || value === undefined || value === '') return undefined;
  switch (type) {
    case 'number':
    case 'currency':
      return parseDecimal(value) ?? undefined;
    case 'date':
      return parseDateToIso(value) ?? String(value).trim();
    case 'enum': {
      const normalized = String(value).trim().toLowerCase();
      if (enumValues && enumValues.includes(normalized)) return normalized;
      return normalized || undefined;
    }
    default:
      return String(value).trim();
  }
}

function normalizeYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function buildIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toIsoDate(date: Date): string {
  return buildIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}
