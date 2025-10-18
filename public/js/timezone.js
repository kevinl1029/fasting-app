(function(global) {
    function resolveBrowserTimeZone() {
        if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
            return null;
        }
        try {
            const options = Intl.DateTimeFormat().resolvedOptions();
            return options && typeof options.timeZone === 'string' ? options.timeZone : null;
        } catch (error) {
            return null;
        }
    }

    function normalizeTimeValue(timeStr) {
        if (typeof timeStr !== 'string') {
            throw new Error('Time value must be a string');
        }
        if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
            return timeStr;
        }
        if (/^\d{2}:\d{2}$/.test(timeStr)) {
            return `${timeStr}:00`;
        }
        throw new Error('Time must be in HH:MM or HH:MM:SS format');
    }

    function buildIsoWithZone(dateStr, timeStr, explicitTimeZone) {
        if (!dateStr || !timeStr) {
            throw new Error('Both date and time are required');
        }

        const normalizedTime = normalizeTimeValue(timeStr);
        const localDate = new Date(`${dateStr}T${normalizedTime}`);

        if (Number.isNaN(localDate.getTime())) {
            throw new Error('Invalid date/time combination');
        }

        const offsetMinutes = -localDate.getTimezoneOffset();
        const absoluteOffset = Math.abs(offsetMinutes);
        const offsetHoursPart = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
        const offsetMinutesPart = String(absoluteOffset % 60).padStart(2, '0');
        const sign = offsetMinutes >= 0 ? '+' : '-';

        const isoString = `${dateStr}T${normalizedTime}${sign}${offsetHoursPart}:${offsetMinutesPart}`;
        const timeZone = explicitTimeZone || resolveBrowserTimeZone();

        return {
            isoString,
            timezoneOffsetMinutes: offsetMinutes,
            timeZone: timeZone || null
        };
    }

    function formatInstantInTimeZone(isoString, options = {}) {
        if (!isoString) {
            return null;
        }

        const timeZone = options.timeZone || resolveBrowserTimeZone();
        const date = new Date(isoString);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        const formatOptions = options.formatOptions || {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        };

        try {
            return new Intl.DateTimeFormat(undefined, {
                timeZone: timeZone || undefined,
                ...formatOptions
            }).format(date);
        } catch (error) {
            return new Intl.DateTimeFormat(undefined, formatOptions).format(date);
        }
    }

    const api = {
        resolveBrowserTimeZone,
        buildIsoWithZone,
        formatInstantInTimeZone
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (global) {
        global.TimezoneUtils = api;
    }
})(typeof window !== 'undefined' ? window : global);
