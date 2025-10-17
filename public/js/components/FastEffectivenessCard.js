class FastEffectivenessCard {
    constructor(options = {}) {
        const {
            container = null,
            subtitleElement = null,
            context = 'dashboard'
        } = options;

        this.container = container;
        this.subtitleElement = subtitleElement;
        this.context = context;
        this.currentFastId = null;
        this.fluidExpanded = false;
        this.boundClickHandler = null;
        this.tooltipButtons = [];
        this.activeTooltip = null;
        this.activeTooltipTrigger = null;
        this.windowHandlersBound = false;
        this.justShown = false;

        this.handleTooltipFocus = (event) => this.showTooltipForTrigger(event.currentTarget);
        this.handleTooltipBlur = () => this.hideTooltip();
        this.handleTooltipClick = (event) => this.onTooltipClick(event);
        this.handleWindowScroll = () => this.hideTooltip();
        this.handleWindowResize = () => this.hideTooltip();
        this.handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                this.hideTooltip();
            }
        };

        if (this.container) {
            this.bindInteractions();
        }
    }

    setContainer(container) {
        if (this.container && this.boundClickHandler) {
            this.container.removeEventListener('click', this.boundClickHandler);
        }

        this.container = container;
        if (this.container) {
            this.bindInteractions();
        }
    }

    setSubtitleElement(element) {
        this.subtitleElement = element;
    }

    bindInteractions() {
        if (!this.container) {
            return;
        }

        if (!this.boundClickHandler) {
            this.boundClickHandler = (event) => {
                const toggleBtn = event.target.closest('[data-action="toggle-fluid-breakdown"]');
                if (toggleBtn && this.container.contains(toggleBtn)) {
                    event.preventDefault();
                    this.toggleFluidBreakdown(toggleBtn);
                }
            };
        }

        this.container.addEventListener('click', this.boundClickHandler);

        if (!this.windowHandlersBound) {
            window.addEventListener('scroll', this.handleWindowScroll, true);
            window.addEventListener('resize', this.handleWindowResize);
            window.addEventListener('keydown', this.handleKeyDown, true);
            this.windowHandlersBound = true;
        }
    }

    destroy() {
        if (this.container && this.boundClickHandler) {
            this.container.removeEventListener('click', this.boundClickHandler);
        }
        this.detachTooltipHandlers();
        this.hideTooltip();

        if (this.windowHandlersBound) {
            window.removeEventListener('scroll', this.handleWindowScroll, true);
            window.removeEventListener('resize', this.handleWindowResize);
            window.removeEventListener('keydown', this.handleKeyDown, true);
            this.windowHandlersBound = false;
        }

        this.container = null;
        this.subtitleElement = null;
        this.boundClickHandler = null;
    }

    renderLoading(options = {}) {
        const { subtitle = 'Sizing up your fast…' } = options;
        this.updateSubtitle(subtitle);
        if (this.container) {
            this.hideTooltip();
            this.detachTooltipHandlers();
            this.container.innerHTML = '<div class="insight-placeholder">Loading fast effectiveness…</div>';
        }
    }

    renderMessage(message, options = {}) {
        const {
            subtitle = 'Log start and post-fast weights to see the breakdown.',
            tone = 'placeholder'
        } = options;

        this.updateSubtitle(subtitle);
        if (!this.container) {
            return;
        }

        const safeMessage = this.escapeHtml(message || 'Complete a fast with start and post-fast weights to size up effectiveness.');
        const className = tone === 'error' ? 'insight-error' : 'insight-placeholder';
        this.hideTooltip();
        this.detachTooltipHandlers();
        this.container.innerHTML = `<div class="${className}">${safeMessage}</div>`;
    }

    renderEffectiveness(effectiveness, options = {}) {
        const {
            fasts = [],
            subtitleForOk = 'Based on your completed fast.',
            subtitleForStatus = 'Log start and post-fast weights to see the breakdown.'
        } = options;

        if (!this.container) {
            return;
        }

        if (!effectiveness || !effectiveness.status) {
            this.renderMessage('Complete a fast with start and post-fast weights to size up effectiveness.', {
                subtitle: subtitleForStatus
            });
            return;
        }

        if (effectiveness.status !== 'ok') {
            const message = effectiveness.message || 'We need a start and post-fast weight to size up this fast.';
            this.renderMessage(message, { subtitle: subtitleForStatus });
            this.currentFastId = effectiveness.fastId ?? null;
            this.fluidExpanded = false;
            return;
        }

        this.currentFastId = effectiveness.fastId ?? null;
        this.fluidExpanded = false;

        const asNumber = (value, fallback = 0) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : fallback;
        };

        const startWeightLabel = this.formatWeight(effectiveness.startWeight);
        const postWeightLabel = this.formatWeight(effectiveness.postWeight);
        const weightDeltaLabel = this.formatDelta(effectiveness.weightDelta);

        let durationHours = effectiveness.durationHours ? Number(effectiveness.durationHours) : null;
        if (!durationHours && Array.isArray(fasts) && fasts.length > 0) {
            const matchedFast = fasts.find((fast) => fast && Number(fast.id) === Number(effectiveness.fastId));
            if (matchedFast) {
                durationHours = matchedFast.durationHours ? Number(matchedFast.durationHours) : durationHours;
                if ((!durationHours || Number.isNaN(durationHours)) && matchedFast.startTime && matchedFast.endTime) {
                    const start = new Date(matchedFast.startTime);
                    const end = new Date(matchedFast.endTime);
                    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
                        durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                    }
                }
            }
        }

        const durationLabel = durationHours ? this.formatFastDuration(durationHours) : '—';
        const subtitleParts = [];
        if (durationLabel && durationLabel !== '—') {
            subtitleParts.push(`${durationLabel} fast`);
        }
        if (subtitleForOk) {
            subtitleParts.push(subtitleForOk);
        }
        this.updateSubtitle(subtitleParts.join(' • '));

        const postLogged = effectiveness.postFastLoggedAt ? this.formatShortDateTime(effectiveness.postFastLoggedAt) : '';

        const isMeasured = effectiveness.breakdownSource === 'measured';
        const bodyFatDeltaLabel = (effectiveness.bodyFatChange !== null && effectiveness.bodyFatChange !== undefined && !Number.isNaN(effectiveness.bodyFatChange))
            ? this.formatPercentDelta(effectiveness.bodyFatChange)
            : '—';
        const modePrimary = isMeasured ? 'Measured' : 'Estimated';
        const modeSecondary = isMeasured
            ? (bodyFatDeltaLabel !== '—' ? `${bodyFatDeltaLabel} BF` : 'Body fat logged')
            : 'Metabolic estimate';

        const totalLossValue = Math.max(0, asNumber(effectiveness.totalWeightLost ?? effectiveness.weightLost));
        const fatLossValue = Math.max(0, asNumber(effectiveness.fatLoss));
        const muscleLossValue = Math.max(0, asNumber(effectiveness.muscleLoss));
        const fluidLossValue = Math.max(0, asNumber(effectiveness.fluidLoss ?? effectiveness.waterLoss));
        const leanWaterValue = Math.max(0, asNumber(effectiveness.leanWater ?? effectiveness.fluidBreakdown?.leanWater));

        const fluidBreakdown = effectiveness.fluidBreakdown || {};
        const glycogenMassValue = Math.max(0, asNumber(fluidBreakdown.glycogenMass));
        const glycogenBoundWaterValue = Math.max(0, asNumber(fluidBreakdown.glycogenBoundWater));
        const gutContentValue = Math.max(0, asNumber(fluidBreakdown.gutContent));
        const residualWaterShiftValue = asNumber(fluidBreakdown.residualWaterShift);
        const otherFluidRaw = (effectiveness.otherFluidLoss !== null && effectiveness.otherFluidLoss !== undefined)
            ? asNumber(effectiveness.otherFluidLoss)
            : (fluidLossValue - leanWaterValue);
        const otherFluidValue = Math.max(0, otherFluidRaw);

        const fatLossLabel = this.formatWeight(fatLossValue);
        const muscleLossLabel = this.formatWeight(muscleLossValue);
        const fluidLabel = this.formatWeight(fluidLossValue);
        const leanWaterLabel = this.formatWeight(leanWaterValue);
        const otherFluidLabel = this.formatWeight(otherFluidValue);

        const summaryHtml = `
            <div class="effectiveness-summary">
                <div class="summary-item">
                    <span class="summary-label">Scale</span>
                    <span class="summary-value">${weightDeltaLabel}</span>
                    <span class="summary-note">(${startWeightLabel} → ${postWeightLabel})</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Mode</span>
                    <span class="summary-value">${this.escapeHtml(modePrimary)}</span>
                    ${modeSecondary ? `<span class="summary-note">${this.escapeHtml(modeSecondary)}</span>` : ''}
                </div>
            </div>
        `;

        const barHtml = totalLossValue > 0.05
            ? `
                <div class="effectiveness-bar" role="presentation" aria-hidden="true">
                    <div class="bar-segment bar-fat" style="flex: ${fatLossValue};"></div>
                    <div class="bar-segment bar-muscle" style="flex: ${muscleLossValue};"></div>
                    <div class="bar-segment bar-fluid" style="flex: ${fluidLossValue};"></div>
                </div>
                <div class="effectiveness-bar-legend">
                    <span class="legend-item"><span class="legend-chip fat"></span>Fat ${fatLossLabel}</span>
                    <span class="legend-item"><span class="legend-chip muscle"></span>Muscle ${muscleLossLabel}</span>
                    <span class="legend-item"><span class="legend-chip fluid"></span>Transient ${fluidLabel}</span>
                </div>
            `
            : '';

        const breakdownHtml = `
            <div class="composition-row">
                <div class="component-card component-fat">
                    <div class="component-top">
                        <span class="component-icon">🔥</span>
                        <button class="component-info" type="button" data-tooltip="Permanent body fat reduction — the progress that stays after refeeding." aria-label="Fat loss info" tabindex="0">i</button>
                    </div>
                    <span class="component-label">Fat Loss</span>
                    <span class="component-value">${fatLossLabel}</span>
                </div>
                <div class="component-card component-muscle">
                    <div class="component-top">
                        <span class="component-icon">🧬</span>
                        <button class="component-info" type="button" data-tooltip="Structural lean tissue loss — typically minimal with solid protein and resistance training." aria-label="Muscle loss info" tabindex="0">i</button>
                    </div>
                    <span class="component-label">Muscle Loss</span>
                    <span class="component-value">${muscleLossLabel}</span>
                </div>
                <div class="component-card component-fluid">
                    <div class="component-top">
                        <span class="component-icon">💧</span>
                        <button class="component-info" type="button" data-tooltip="Temporary shifts from muscle water, glycogen, and gut content. Expect most to rebound within 24–72 hours. Muscle water ${leanWaterLabel}; Glycogen + gut ${otherFluidLabel}." aria-label="Fluid info" tabindex="0">i</button>
                    </div>
                    <span class="component-label">Transient Loss</span>
                    <span class="component-value">${fluidLabel}</span>
                </div>
            </div>
        `;

        let fluidDetailsHtml = '';
        if (fluidLossValue > 0.05 || leanWaterValue > 0.05 || glycogenMassValue > 0.05 || glycogenBoundWaterValue > 0.05 || gutContentValue > 0.05) {
            const isExpanded = this.fluidExpanded;
            const toggleText = isExpanded ? 'Hide fluid breakdown' : 'Show fluid breakdown';
            const toggleIcon = isExpanded ? '▲' : '▼';
            const displayStyle = isExpanded ? 'flex' : 'none';

            fluidDetailsHtml = `
                <div class="effectiveness-fluid">
                    <button type="button" class="fluid-toggle-btn" data-action="toggle-fluid-breakdown" aria-expanded="${isExpanded}">
                        <span data-role="fluid-toggle-text">${toggleText}</span>
                        <span data-role="fluid-toggle-icon">${toggleIcon}</span>
                    </button>
                    <div class="fluid-breakdown" data-role="fluid-breakdown" style="display: ${displayStyle};">
                        <div class="fluid-breakdown-item">
                            <div class="fluid-breakdown-left">
                                <span class="fluid-icon">💦</span>
                                <div>
                                    <div class="fluid-label">Muscle water</div>
                                    <div class="fluid-note">Water stored in lean tissue that rebounds with rehydration.</div>
                                </div>
                            </div>
                            <span class="fluid-value">${leanWaterLabel}</span>
                        </div>
                        <div class="fluid-breakdown-item">
                            <div class="fluid-breakdown-left">
                                <span class="fluid-icon">⚡️</span>
                                <div>
                                    <div class="fluid-label">Glycogen</div>
                                    <div class="fluid-note">Stored carbs burned during the fast.</div>
                                </div>
                            </div>
                            <span class="fluid-value">${this.formatWeight(glycogenMassValue)}</span>
                        </div>
                        <div class="fluid-breakdown-item">
                            <div class="fluid-breakdown-left">
                                <span class="fluid-icon">💧</span>
                                <div>
                                    <div class="fluid-label">Bound water</div>
                                    <div class="fluid-note">Water released alongside glycogen usage.</div>
                                </div>
                            </div>
                            <span class="fluid-value">${this.formatWeight(glycogenBoundWaterValue)}</span>
                        </div>
                        <div class="fluid-breakdown-item">
                            <div class="fluid-breakdown-left">
                                <span class="fluid-icon">⚙️</span>
                                <div>
                                    <div class="fluid-label">Gut content</div>
                                    <div class="fluid-note">Digestive contents cleared during the fast.</div>
                                </div>
                            </div>
                            <span class="fluid-value">${this.formatWeight(gutContentValue)}</span>
                        </div>
                        <div class="fluid-breakdown-item">
                            <div class="fluid-breakdown-left">
                                <span class="fluid-icon">↔️</span>
                                <div>
                                    <div class="fluid-label">Residual shifts</div>
                                    <div class="fluid-note">Hydration & sodium balance changes.</div>
                                </div>
                            </div>
                            <span class="fluid-value">${this.formatWeight(residualWaterShiftValue)}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        const tags = [];
        if (modePrimary) {
            tags.push(modePrimary);
        }
        if (bodyFatDeltaLabel !== '—' && isMeasured) {
            tags.push(`${bodyFatDeltaLabel} BF`);
        }

        const tagsHtml = tags.length
            ? `<div class="effectiveness-tags">${tags.map((tag) => `<span class="effectiveness-tag">${this.escapeHtml(tag)}</span>`).join('')}</div>`
            : '';

        const bodyFatCopy = (effectiveness.startBodyFat !== null && effectiveness.startBodyFat !== undefined
            && effectiveness.postBodyFat !== null && effectiveness.postBodyFat !== undefined)
            ? `Body fat ${this.formatBodyFat(effectiveness.startBodyFat)} → ${this.formatBodyFat(effectiveness.postBodyFat)}`
            : '';

        const metaParts = [];
        if (postLogged) {
            metaParts.push(`Post-fast weigh-in ${postLogged}`);
        }
        if (bodyFatCopy) {
            metaParts.push(bodyFatCopy);
        }
        if (!metaParts.length) {
            metaParts.push('Keep logging morning weigh-ins to refine this breakdown.');
        }
        const metaText = metaParts.map((part) => this.escapeHtml(part)).join(' • ');

        const message = this.escapeHtml(effectiveness.message || 'Most of the rapid scale drop is fluid. Keep logging to see what sticks.');

        this.hideTooltip();
        this.detachTooltipHandlers();

        this.container.innerHTML = `
            ${summaryHtml}
            ${barHtml}
            ${breakdownHtml}
            ${fluidDetailsHtml}
            ${tagsHtml}
            <div class="effectiveness-message">${message}</div>
            <div class="effectiveness-meta">${metaText}</div>
        `;

        this.attachTooltipHandlers();
    }

    toggleFluidBreakdown(toggleBtn) {
        this.fluidExpanded = !this.fluidExpanded;
        if (!this.container) {
            return;
        }

        const breakdown = this.container.querySelector('[data-role="fluid-breakdown"]');
        const toggleText = this.container.querySelector('[data-role="fluid-toggle-text"]');
        const toggleIcon = this.container.querySelector('[data-role="fluid-toggle-icon"]');

        if (breakdown) {
            breakdown.style.display = this.fluidExpanded ? 'flex' : 'none';
        }
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', String(this.fluidExpanded));
        }
        if (toggleText) {
            toggleText.textContent = this.fluidExpanded ? 'Hide fluid breakdown' : 'Show fluid breakdown';
        }
        if (toggleIcon) {
            toggleIcon.textContent = this.fluidExpanded ? '▲' : '▼';
        }
    }

    attachTooltipHandlers() {
        if (!this.container) {
            return;
        }

        this.detachTooltipHandlers();

        const buttons = this.container.querySelectorAll('.component-info[data-tooltip]');
        this.tooltipButtons = Array.from(buttons);

        this.tooltipButtons.forEach((button) => {
            button.addEventListener('focus', this.handleTooltipFocus);
            button.addEventListener('blur', this.handleTooltipBlur);
            button.addEventListener('click', this.handleTooltipClick);
        });
    }

    detachTooltipHandlers() {
        if (!Array.isArray(this.tooltipButtons) || this.tooltipButtons.length === 0) {
            this.tooltipButtons = [];
            return;
        }

        this.tooltipButtons.forEach((button) => {
            button.removeEventListener('focus', this.handleTooltipFocus);
            button.removeEventListener('blur', this.handleTooltipBlur);
            button.removeEventListener('click', this.handleTooltipClick);
        });

        this.tooltipButtons = [];
    }

    onTooltipClick(event) {
        event.preventDefault();
        const trigger = event.currentTarget;
        if (!trigger) {
            return;
        }

        if (this.activeTooltipTrigger === trigger) {
            if (this.justShown) {
                this.justShown = false;
                return;
            }
            this.hideTooltip();
        } else {
            this.showTooltipForTrigger(trigger);
        }
    }

    showTooltipForTrigger(trigger) {
        if (!trigger) {
            return;
        }

        const text = trigger.getAttribute('data-tooltip');
        if (!text) {
            return;
        }

        if (this.activeTooltipTrigger === trigger && this.activeTooltip) {
            this.positionTooltip(this.activeTooltip, trigger);
            this.justShown = true;
            window.setTimeout(() => { this.justShown = false; }, 0);
            return;
        }

        this.hideTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'effectiveness-tooltip';
        tooltip.textContent = text;
        tooltip.style.visibility = 'hidden';
        document.body.appendChild(tooltip);

        this.activeTooltip = tooltip;
        this.activeTooltipTrigger = trigger;
        trigger.setAttribute('data-tooltip-active', 'true');

        this.positionTooltip(tooltip, trigger);
        tooltip.style.visibility = 'visible';
        this.justShown = true;
        window.setTimeout(() => { this.justShown = false; }, 0);
    }

    positionTooltip(tooltip, trigger) {
        if (!tooltip || !trigger) {
            return;
        }

        const rect = trigger.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;

        let top = rect.top + scrollY - tooltipRect.height - 8;
        let left = rect.left + scrollX + rect.width / 2 - tooltipRect.width / 2;

        const minLeft = scrollX + 8;
        const maxLeft = scrollX + viewportWidth - tooltipRect.width - 8;
        left = Math.min(Math.max(left, minLeft), maxLeft);

        const minTop = scrollY + 8;
        if (top < minTop) {
            top = rect.bottom + scrollY + 8;
        }

        const maxTop = scrollY + viewportHeight - tooltipRect.height - 8;
        top = Math.min(Math.max(top, minTop), maxTop);

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }

    hideTooltip() {
        if (this.activeTooltip && this.activeTooltip.parentNode) {
            this.activeTooltip.parentNode.removeChild(this.activeTooltip);
        }

        if (this.activeTooltipTrigger) {
            this.activeTooltipTrigger.removeAttribute('data-tooltip-active');
        }

        this.activeTooltip = null;
        this.activeTooltipTrigger = null;
        this.justShown = false;
    }

    updateSubtitle(text) {
        if (this.subtitleElement && typeof text === 'string') {
            this.subtitleElement.textContent = text;
        }
    }

    formatWeight(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
            return '—';
        }
        return `${Number(value).toFixed(1)} lb`;
    }

    formatDelta(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
            return '—';
        }
        const numeric = Number(value);
        if (Math.abs(numeric) < 0.05) {
            return '0.0 lb';
        }
        const sign = numeric > 0 ? '+' : '';
        return `${sign}${numeric.toFixed(1)} lb`;
    }

    formatPercentDelta(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
            return '—';
        }
        const numeric = Number(value);
        if (Math.abs(numeric) < 0.05) {
            return '0.0%';
        }
        const sign = numeric > 0 ? '+' : '';
        return `${sign}${numeric.toFixed(1)}%`;
    }

    formatBodyFat(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
            return '—';
        }
        return `${Number(value).toFixed(1)}%`;
    }

    formatFastDuration(hours) {
        if (!hours && hours !== 0) {
            return '—';
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

    formatShortDateTime(value) {
        const date = value instanceof Date ? value : (value ? new Date(value) : null);
        if (!date || Number.isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    escapeHtml(value) {
        if (value === null || value === undefined) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FastEffectivenessCard;
} else {
    window.FastEffectivenessCard = FastEffectivenessCard;
}
