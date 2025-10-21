import { format as dateFnsFormat } from "date-fns";
import { id } from "date-fns/locale";

/**
 * Formats a date to YYYY-MM-DD format for database storage
 * Ensures consistent timezone handling
 */
export function formatDateForDb(date: Date): string {
  return dateFnsFormat(date, "yyyy-MM-dd");
}

/**
 * Formats a date for display in Indonesian locale
 */
export function formatDateForDisplay(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateFnsFormat(dateObj, "PPP", { locale: id });
}

/**
 * Formats a date for display in short format
 */
export function formatDateShort(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateFnsFormat(dateObj, "dd MMM yyyy", { locale: id });
}

/**
 * Gets today's date at midnight in local timezone
 */
export function getTodayAtMidnight(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Converts a date string from database to Date object
 * Handles timezone conversion properly
 */
export function parseDbDate(dateString: string): Date {
  return new Date(dateString + 'T00:00:00');
}

