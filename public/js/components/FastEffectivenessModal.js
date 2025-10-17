class FastEffectivenessModal {
    constructor(options = {}) {
        const {
            modalElement = null,
            contentElement = null,
            titleElement = null,
            subtitleElement = null,
            statusElement = null,
            api = null,
            card = null
        } = options;

        this.modalElement = modalElement;
        this.contentElement = contentElement;
        this.titleElement = titleElement;
        this.subtitleElement = subtitleElement;
        this.statusElement = statusElement;
        this.api = api || new (window.FastEffectivenessApi || FastEffectivenessApi)();
        this.card = card || new (window.FastEffectivenessCard || FastEffectivenessCard)({ container: contentElement });

        this.activeFastId = null;
        this.focusedElementBeforeOpen = null;

        this.handleKeyDown = this.handleKeyDown.bind(this);

        if (this.modalElement) {
            this.bindModalEvents();
        }
    }

    bindModalEvents() {
        if (!this.modalElement) {
            return;
        }

        this.modalElement.addEventListener('click', (event) => {
            if (event.target === this.modalElement) {
                this.close();
            }
        });

        const dismissButtons = this.modalElement.querySelectorAll('[data-modal-dismiss]');
        dismissButtons.forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                this.close();
            });
        });
    }

    async open(fast) {
        if (!fast) {
            console.warn('FastEffectivenessModal.open called without a fast record');
            return;
        }

        const normalizedFast = this.normalizeFast(fast);
        if (!normalizedFast) {
            console.warn('FastEffectivenessModal.open could not normalize fast record', fast);
            return;
        }

        this.activeFastId = normalizedFast.id;
        this.updateHeader(normalizedFast);
        this.setStatus('Loading effectiveness…');
        this.card.renderLoading();
        this.showModal();

        try {
            const report = await this.api.getEffectiveness(normalizedFast.id);
            if (this.activeFastId !== normalizedFast.id) {
                return;
            }
            this.card.renderEffectiveness(report, {
                fasts: [normalizedFast],
                subtitleForOk: 'Based on this fast.',
                subtitleForStatus: 'Add start and post-fast weigh-ins to size up effectiveness.'
            });
            this.setStatus('');
        } catch (error) {
            console.error('FastEffectivenessModal failed to load effectiveness:', error);
            const message = error?.payload?.error || error?.message || 'Unable to load effectiveness right now.';
            this.card.renderMessage(message, { tone: 'error', subtitle: '' });
            this.setStatus('');
        }
    }

    close() {
        this.activeFastId = null;
        if (this.modalElement) {
            this.modalElement.classList.remove('active');
        }
        document.body.style.overflow = '';
        document.removeEventListener('keydown', this.handleKeyDown);

        if (this.focusedElementBeforeOpen && typeof this.focusedElementBeforeOpen.focus === 'function') {
            try {
                this.focusedElementBeforeOpen.focus();
            } catch (error) {
                // Ignore focus restoration errors
            }
        }
        this.focusedElementBeforeOpen = null;
    }

    showModal() {
        if (!this.modalElement) {
            return;
        }

        this.focusedElementBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        this.modalElement.classList.add('active');
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', this.handleKeyDown);

        const firstFocusable = this.modalElement.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable && typeof firstFocusable.focus === 'function') {
            firstFocusable.focus();
        }
    }

    handleKeyDown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
        }
    }

    updateHeader(fast) {
        if (this.titleElement) {
            this.titleElement.textContent = 'Fast Effectiveness';
        }

        if (this.subtitleElement) {
            const range = this.formatFastWindow(fast);
            const duration = fast.durationHours ? this.formatFastDuration(fast.durationHours) : '';
            const parts = [];
            if (range) parts.push(range);
            if (duration) parts.push(duration);
            this.subtitleElement.textContent = parts.join(' • ');
        }
    }

    setStatus(message) {
        if (this.statusElement) {
            this.statusElement.textContent = message || '';
        }
    }

    normalizeFast(fast) {
        if (!fast || typeof fast !== 'object') {
            return null;
        }

        const id = Number(fast.id);
        if (!Number.isFinite(id)) {
            return null;
        }

        let durationHours = null;
        if (fast.durationHours !== undefined && fast.durationHours !== null) {
            durationHours = Number(fast.durationHours);
        } else if (fast.duration_hours !== undefined && fast.duration_hours !== null) {
            durationHours = Number(fast.duration_hours);
        }

        if ((!durationHours || Number.isNaN(durationHours)) && fast.start_time && fast.end_time) {
            const start = new Date(fast.start_time);
            const end = new Date(fast.end_time);
            if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
                durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
            }
        }

        return {
            id,
            durationHours: Number.isFinite(durationHours) ? durationHours : null,
            startTime: fast.start_time || fast.startTime || null,
            endTime: fast.end_time || fast.endTime || null
        };
    }

    formatFastWindow(fast) {
        if (!fast) {
            return '';
        }

        const start = fast.startTime ? new Date(fast.startTime) : null;
        const end = fast.endTime ? new Date(fast.endTime) : null;

        if (start && !Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
            return `${this.formatDateTime(start)} → ${this.formatDateTime(end)}`;
        }
        if (start && !Number.isNaN(start.getTime())) {
            return `Started ${this.formatDateTime(start)}`;
        }
        if (end && !Number.isNaN(end.getTime())) {
            return `Ended ${this.formatDateTime(end)}`;
        }
        return '';
    }

    formatDateTime(date) {
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    formatFastDuration(hours) {
        if (!hours && hours !== 0) {
            return '';
        }
        const numeric = Number(hours);
        if (numeric < 24) {
            return `${numeric.toFixed(1)}h`;
        }
        const wholeHours = Math.floor(numeric);
        const days = Math.floor(wholeHours / 24);
        const remainingHours = wholeHours % 24;
        return `${days}d ${remainingHours}h`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FastEffectivenessModal;
} else {
    window.FastEffectivenessModal = FastEffectivenessModal;
}
