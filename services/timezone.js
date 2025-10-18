const OFFSET_PATTERN = /([+-])(\d{2}):?(\d{2})$/;

function parseOffsetFromIso(value) {
  if (typeof value !== 'string') {
    return null;
  }

  if (/[zZ]$/.test(value)) {
    return 0;
  }

  const match = value.match(OFFSET_PATTERN);
  if (!match) {
    return null;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return sign * (hours * 60 + minutes);
}

function toDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('Invalid Date instance provided');
    }
    return new Date(value.getTime());
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Unable to parse loggedAt value');
    }
    return parsed;
  }

  throw new Error('loggedAt must be a Date or ISO-8601 string');
}

function pickNumeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getOffsetFromTimeZone(instant, timeZone) {
  if (!timeZone) {
    return null;
  }

  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = dtf.formatToParts(instant).reduce((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const second = Number(parts.second);

    if ([year, month, day, hour, minute, second].some((n) => Number.isNaN(n))) {
      return null;
    }

    const localUtcMillis = Date.UTC(year, month - 1, day, hour, minute, second, instant.getUTCMilliseconds());
    const diffMinutes = Math.round((localUtcMillis - instant.getTime()) / 60000);
    return diffMinutes;
  } catch (error) {
    return null;
  }
}

function ensureOffsetMinutes(instant, offsetMinutes, timeZone) {
  if (timeZone) {
    const zoneOffset = getOffsetFromTimeZone(instant, timeZone);
    if (zoneOffset !== null) {
      return zoneOffset;
    }
  }

  if (typeof offsetMinutes === 'number' && Number.isFinite(offsetMinutes)) {
    return offsetMinutes;
  }

  return 0;
}

function formatLocalDate(instant, offsetMinutes) {
  const adjusted = new Date(instant.getTime() + offsetMinutes * 60000);
  const year = adjusted.getUTCFullYear();
  const month = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalTime(instant, offsetMinutes) {
  return new Date(instant.getTime() + offsetMinutes * 60000);
}

function normalizeTimestamp({ loggedAt, timezoneOffsetMinutes, timeZone } = {}) {
  if (!loggedAt) {
    throw new Error('normalizeTimestamp requires a loggedAt value');
  }

  const instant = toDate(loggedAt);
  const offsetFromInput = pickNumeric(timezoneOffsetMinutes);
  const offsetFromIso = typeof loggedAt === 'string' ? parseOffsetFromIso(loggedAt) : null;
  const resolvedTimeZone = typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : null;

  const resolvedOffset = ensureOffsetMinutes(
    instant,
    offsetFromInput !== null ? offsetFromInput : offsetFromIso,
    resolvedTimeZone
  );

  return {
    instant,
    isoString: instant.toISOString(),
    offsetMinutes: resolvedOffset,
    timeZone: resolvedTimeZone
  };
}

function getLocalContext({ instant, offsetMinutes, timeZone } = {}) {
  if (!(instant instanceof Date)) {
    throw new Error('getLocalContext requires a Date instance');
  }

  const resolvedOffset = ensureOffsetMinutes(instant, pickNumeric(offsetMinutes), timeZone);
  const localTime = getLocalTime(instant, resolvedOffset);

  return {
    offsetMinutes: resolvedOffset,
    timeZone: typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : null,
    localTime,
    localDate: formatLocalDate(instant, resolvedOffset)
  };
}

module.exports = {
  parseOffsetFromIso,
  getOffsetFromTimeZone,
  normalizeTimestamp,
  getLocalContext,
  formatLocalDate,
  getLocalTime
};
