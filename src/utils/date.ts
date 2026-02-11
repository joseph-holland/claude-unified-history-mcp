/**
 * Normalize date string to ISO format for proper comparison with timezone support.
 */
export function normalizeDate(dateString: string, isEndDate: boolean = false, timezone?: string): string {
  if (dateString.includes('T')) {
    return dateString;
  }

  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    if (tz === 'UTC') {
      const timeStr = isEndDate ? '23:59:59.999' : '00:00:00.000';
      return `${dateString}T${timeStr}Z`;
    }

    const parts = dateString.split('-').map(Number);
    const year = parts[0] ?? 0;
    const month = parts[1] ?? 1;
    const day = parts[2] ?? 1;
    const hour = isEndDate ? 23 : 0;
    const minute = isEndDate ? 59 : 0;
    const second = isEndDate ? 59 : 0;
    const millisecond = isEndDate ? 999 : 0;

    // Create a reference date to calculate offset
    const referenceDate = new Date(year, month - 1, day, 12, 0, 0);

    // Calculate timezone offset for this specific date (handles DST)
    const offsetMs = referenceDate.getTimezoneOffset() * 60000;

    // Create the target time in the specified timezone
    const localTime = new Date(year, month - 1, day, hour, minute, second, millisecond);

    // Get what this local time would be in the target timezone
    const targetTzTime = new Date(localTime.toLocaleString('en-CA', { timeZone: tz }));
    const utcTime = new Date(localTime.toLocaleString('en-CA', { timeZone: 'UTC' }));

    // Calculate the difference between target timezone and UTC
    const tzOffsetMs = targetTzTime.getTime() - utcTime.getTime();

    // Adjust local time to get UTC equivalent
    const utcResult = new Date(localTime.getTime() + offsetMs - tzOffsetMs);

    return utcResult.toISOString();
  } catch {
    const fallback = `${dateString}T${isEndDate ? '23:59:59.999' : '00:00:00.000'}Z`;
    return fallback;
  }
}

/**
 * Get human-readable relative time string.
 */
export function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
