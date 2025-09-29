class ScheduleDraftController {
    constructor({ api, selectors = {}, onConfirm, logger = console } = {}) {
        this.api = api;
        this.logger = logger;
        this.onConfirm = typeof onConfirm === 'function' ? onConfirm : () => {};
        this.selectors = Object.assign({
            container: '#draft-state',
            protocolLabel: '#draft-protocol-label',
            blocksList: '#draft-blocks-list',
            forecastSummary: '#draft-forecast-summary',
            confirmButton: '#draft-confirm-btn',
            dismissButton: '#draft-dismiss-btn',
            customizeButton: '#draft-customize-btn',
            emptyState: '#empty-state'
        }, selectors);

        this.draft = null;
        this.metadata = null;
        this.sessionId = null;
        this._wireEventHandlers();
    }

    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }

    setDraft(draft, metadata) {
        this.draft = draft;
        this.metadata = metadata || null;
    }

    renderDraftIfNeeded(scheduleData) {
        if (scheduleData && scheduleData.schedule && scheduleData.blocks && scheduleData.blocks.length > 0) {
            this.hideDraft();
            return false;
        }

        if (!this.draft) {
            this.hideDraft();
            return false;
        }

        this._renderDraft();
        return true;
    }

    hideDraft() {
        const container = this._getElement('container');
        if (container) {
            container.style.display = 'none';
        }
    }

    _renderDraft() {
        const container = this._getElement('container');
        if (!container) {
            return;
        }

        container.style.display = 'block';
        this._renderProtocol();
        this._renderBlocks();
        this._renderForecastSummary();
        this._applyEntryHighlight();

        const emptyState = this._getElement('emptyState');
        if (emptyState) {
            emptyState.style.display = 'none';
        }
    }

    async handleConfirm() {
        if (!this.api || !this.draft) {
            return;
        }

        try {
            const result = await this.api.confirmDraft(this.sessionId, {
                blocks: this.draft.blocks,
                weekAnchor: 1
            });

            this.logger.info('Schedule draft confirmed', result);
            this.draft = null;
            this.metadata = null;
            this.hideDraft();
            this.onConfirm(result);
        } catch (error) {
            this.logger.error('Failed to confirm schedule draft', error);
            alert('Unable to confirm schedule draft. Please try again.');
        }
    }

    async handleDismiss() {
        if (!this.api) {
            return;
        }

        try {
            await this.api.dismissDraft(this.sessionId);
            this.logger.info('Schedule draft dismissed');
            this.draft = null;
            this.metadata = null;
            this.hideDraft();
            this._showEmptyState();
            this.onConfirm(null);
        } catch (error) {
            this.logger.error('Failed to dismiss schedule draft', error);
            alert('Unable to dismiss schedule draft. Please try again.');
        }
    }

    _showEmptyState() {
        const emptyState = this._getElement('emptyState');
        const scheduleContent = this._getElement('scheduleContent');

        if (scheduleContent) {
            scheduleContent.style.display = 'none';
        }

        if (emptyState) {
            emptyState.style.display = 'block';
        }
    }

    _wireEventHandlers() {
        const attachHandlers = () => {
            const confirmButton = this._getElement('confirmButton');
            if (confirmButton && !confirmButton.dataset.ffDraftHandler) {
                confirmButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    this.handleConfirm();
                });
                confirmButton.dataset.ffDraftHandler = 'true';
            }

            const dismissButton = this._getElement('dismissButton');
            if (dismissButton && !dismissButton.dataset.ffDraftHandler) {
                dismissButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    this.handleDismiss();
                });
                dismissButton.dataset.ffDraftHandler = 'true';
            }

            const customizeButton = this._getElement('customizeButton');
            if (customizeButton && !customizeButton.dataset.ffDraftHandler) {
                customizeButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    this._openCreateModal();
                });
                customizeButton.dataset.ffDraftHandler = 'true';
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attachHandlers);
        } else {
            attachHandlers();
        }
    }

    _renderProtocol() {
        const labelEl = this._getElement('protocolLabel');
        if (labelEl && this.draft?.protocol) {
            labelEl.textContent = this.draft.protocol.label || 'Your Suggested Plan';
        }
    }

    _renderBlocks() {
        const listEl = this._getElement('blocksList');
        if (!listEl) {
            return;
        }

        listEl.innerHTML = '';

        if (!this.draft?.blocks || this.draft.blocks.length === 0) {
            const emptyItem = document.createElement('li');
            emptyItem.textContent = 'No fasting blocks suggested in this draft.';
            listEl.appendChild(emptyItem);
            return;
        }

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        this.draft.blocks.forEach((block, index) => {
            const item = document.createElement('li');
            const startDay = days[block.start_dow] || `Day ${block.start_dow}`;
            const endDay = days[block.end_dow] || `Day ${block.end_dow}`;
            item.innerHTML = `
                <div class="draft-block">
                    <div class="draft-block-title">
                        ${block.name || `Fast ${index + 1}`} • ${Math.round(block.duration_hours || 0)}h
                    </div>
                    <div class="draft-block-time">
                        ${startDay} ${block.start_time} → ${endDay} ${block.end_time}
                    </div>
                </div>
            `;
            listEl.appendChild(item);
        });
    }

    _renderForecastSummary() {
        const summaryEl = this._getElement('forecastSummary');
        if (!summaryEl) {
            return;
        }

        const summary = this.draft?.forecastSummary;
        if (!summary) {
            summaryEl.textContent = 'Forecast data unavailable. Confirm to finalize your schedule.';
            return;
        }

        const goalText = summary.goalDate && summary.targetBodyFat
            ? `On track to reach ${summary.targetBodyFat}% by ${this._formatDate(summary.goalDate)}`
            : 'Forecast goal: maintain momentum with this plan.';

        let sparklineText = '';
        if (Array.isArray(summary.sparkline) && summary.sparkline.length > 1) {
            const firstPoint = summary.sparkline[0];
            const lastPoint = summary.sparkline[summary.sparkline.length - 1];
            if (firstPoint && lastPoint && firstPoint.bodyFat != null && lastPoint.bodyFat != null) {
                const delta = (firstPoint.bodyFat - lastPoint.bodyFat).toFixed(1);
                sparklineText = `Projected body fat change over next ${summary.sparkline.length - 1} weeks: −${delta}%`;
            }
        }

        summaryEl.innerHTML = `
            <div class="draft-forecast-headline">${goalText}</div>
            ${sparklineText ? `<div class="draft-forecast-detail">${sparklineText}</div>` : ''}
        `;
    }

    _applyEntryHighlight() {
        try {
            const cameFromTimer = sessionStorage.getItem('ff_schedule_from_timer');
            if (cameFromTimer) {
                const container = this._getElement('container');
                if (container) {
                    container.classList.add('from-timer');
                }
                sessionStorage.removeItem('ff_schedule_from_timer');
            }
        } catch (error) {
            this.logger.warn('ScheduleDraftController: failed to read timer entry flag', error);
        }
    }

    _openCreateModal() {
        if (typeof window.openCreateModal === 'function') {
            window.openCreateModal();
        } else {
            alert('Customization tools are coming soon. For now you can confirm the suggested plan.');
        }
    }

    _getElement(key) {
        const selector = this.selectors[key];
        if (!selector) {
            return null;
        }
        return document.querySelector(selector);
    }

    _formatDate(dateStr) {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (_) {
            return dateStr;
        }
    }
}

window.FastingForecastScheduleDraftController = ScheduleDraftController;
