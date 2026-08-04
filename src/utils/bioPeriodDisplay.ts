import type { BiodataPeriodEntry } from "../models/User";
import { Gender } from "../models/enums";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type BioPeriodRow = BiodataPeriodEntry & { isCurrent?: boolean };

export function formatMonthYear(month?: number, year?: number): string | undefined {
  if (month == null || year == null) return undefined;
  const m = Math.round(Number(month));
  const y = Math.round(Number(year));
  if (Number.isNaN(m) || Number.isNaN(y) || m < 1 || m > 12) return undefined;
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

/** PDF biodata: MM.YYYY (e.g. 07.2007) */
export function formatMonthYearPdf(month?: number, year?: number): string | undefined {
  if (month == null || year == null) return undefined;
  const m = Math.round(Number(month));
  const y = Math.round(Number(year));
  if (Number.isNaN(m) || Number.isNaN(y) || m < 1 || m > 12) return undefined;
  return `${String(m).padStart(2, "0")}.${y}`;
}

/**
 * Period string for biodata PDF only (MM.YYYY – MM.YYYY / since MM.YYYY).
 */
export function formatBioPeriodPdf(entry: BioPeriodRow, opts: { allowSince: boolean }): string {
  const startFromStrings = (entry.startDate && String(entry.startDate).trim()) || "";
  const endFromStrings = (entry.endDate && String(entry.endDate).trim()) || "";
  const start = formatMonthYearPdf(entry.startMonth, entry.startYear) ?? startFromStrings;
  const end = formatMonthYearPdf(entry.endMonth, entry.endYear) ?? endFromStrings;

  if (opts.allowSince && entry.isCurrent) {
    if (start) return `since ${start}`;
    if (entry.startDate?.trim()) return `since ${entry.startDate.trim()}`;
    return "since —";
  }

  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  if (end) return end;
  return "";
}

/**
 * Human-readable period for biodata PDFs.
 * Prefers numeric month/year; falls back to legacy startDate/endDate strings.
 */
export function formatBioPeriod(entry: BioPeriodRow, opts: { allowSince: boolean }): string {
  const startFromStrings = (entry.startDate && String(entry.startDate).trim()) || "";
  const endFromStrings = (entry.endDate && String(entry.endDate).trim()) || "";
  const start = formatMonthYear(entry.startMonth, entry.startYear) ?? startFromStrings;
  const end = formatMonthYear(entry.endMonth, entry.endYear) ?? endFromStrings;

  if (opts.allowSince && entry.isCurrent) {
    if (start) return `since ${start}`;
    if (entry.startDate?.trim()) return `since ${entry.startDate.trim()}`;
    return "since —";
  }

  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  if (end) return end;
  return "";
}

const GENDER_PDF_LABEL: Record<string, string> = {
  [Gender.MALE]: "Male",
  [Gender.FEMALE]: "Female",
  [Gender.TRANSGENDER]: "Transgender",
  [Gender.NON_BINARY]: "Non-binary",
  [Gender.PREFER_NOT_TO_SAY]: "Prefer not to say",
  [Gender.OTHER]: "Other",
};

/** Inquiry PDF: enum label or legacy free-text. */
export function formatGenderForPdf(gender?: string, legacySex?: string): string {
  const g = gender?.trim();
  if (g && GENDER_PDF_LABEL[g]) return GENDER_PDF_LABEL[g];
  const legacy = legacySex?.trim();
  if (legacy) return legacy;
  if (g) return g;
  return "—";
}
