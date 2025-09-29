class FastDurationResolver {
    constructor({ upcoming = null, recent = null, defaultDurationHours = 24, now = null } = {}) {
        this.upcoming = upcoming;
        this.recent = recent;
        this.defaultDurationHours = this._coerceDuration(defaultDurationHours, 24);
        this.referenceTime = now instanceof Date ? now : new Date();
        this.manualOverride = false;
    }

    updateData({ upcoming = null, recent = null, defaultDurationHours = 24, now = null } = {}) {
        this.upcoming = upcoming;
        this.recent = recent;
        this.defaultDurationHours = this._coerceDuration(defaultDurationHours, 24);

        if (now instanceof Date) {
            this.referenceTime = now;
        }
    }

    setReferenceTime(date) {
        if (date instanceof Date) {
            this.referenceTime = date;
        }
    }

    markManualSelection() {
        this.manualOverride = true;
    }

    clearManualSelection() {
        this.manualOverride = false;
    }

    hasManualSelection() {
        return this.manualOverride;
    }

    getRecommendedDuration({ respectManual = true } = {}) {
        if (respectManual && this.manualOverride) {
            return this.defaultDurationHours;
        }

        return this._computeRecommendation();
    }

    peekRecommendedDuration() {
        return this._computeRecommendation();
    }

    getDefaultDuration() {
        return this.defaultDurationHours;
    }

    _computeRecommendation() {
        const currentTime = this.referenceTime instanceof Date ? this.referenceTime : new Date();

        const recentDuration = this._getRecentDuration(currentTime);
        if (recentDuration) {
            return recentDuration;
        }

        const upcomingDuration = this._getUpcomingDuration(currentTime);
        if (upcomingDuration) {
            return upcomingDuration;
        }

        return this.defaultDurationHours;
    }

    _getRecentDuration(currentTime) {
        if (!this.recent || !this.recent.start_at_utc) {
            return null;
        }

        const start = new Date(this.recent.start_at_utc);
        const sixHoursInMs = 6 * 60 * 60 * 1000;

        if (start > currentTime) {
            return null;
        }

        if ((currentTime - start) > sixHoursInMs) {
            return null;
        }

        return this._coerceDuration(this.recent.duration_hours, this.defaultDurationHours);
    }

    _getUpcomingDuration(currentTime) {
        if (!this.upcoming || !this.upcoming.start_at_utc) {
            return null;
        }

        const start = new Date(this.upcoming.start_at_utc);
        const twelveHoursInMs = 12 * 60 * 60 * 1000;

        if (start < currentTime) {
            return null;
        }

        if ((start - currentTime) > twelveHoursInMs) {
            return null;
        }

        return this._coerceDuration(this.upcoming.duration_hours, this.defaultDurationHours);
    }

    _coerceDuration(value, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return fallback;
        }

        return Math.round(parsed);
    }
}

window.FastingForecastFastDurationResolver = FastDurationResolver;
