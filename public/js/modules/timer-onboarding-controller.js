class TimerOnboardingController {
    constructor({ api, navigation, logger = console } = {}) {
        this.api = api;
        this.navigation = navigation || {
            goToSchedule: () => { window.location.href = '/schedule.html'; }
        };
        this.logger = logger;
        this.draft = null;
        this.sessionId = null;
    }

    async init(sessionId) {
        this.sessionId = sessionId;

        if (!this.api || !sessionId) {
            return;
        }

        try {
            const result = await this.api.fetchDraft(sessionId);
            if (result && result.draft) {
                this.draft = result.draft;
                this.applyDraft(result.draft);
            }
        } catch (error) {
            this.logger.error('TimerOnboardingController: failed to hydrate draft', error);
        }

        this._bindCompletionCta();
    }

    applyDraft(draft) {
        this.draft = draft;
        if (!draft) {
            return;
        }

        // Only apply when timer is idle
        const activeFastState = document.getElementById('activeFastState');
        const isActiveVisible = activeFastState && window.getComputedStyle(activeFastState).display !== 'none';
        if (isActiveVisible) {
            return;
        }

        const protocolLabel = draft.protocol?.label || 'Suggested Protocol';
        const durationHours = draft.protocol?.durationHours;

        // Update welcome copy
        const welcomeEl = document.getElementById('newUserWelcome');
        if (welcomeEl) {
            welcomeEl.style.display = 'block';
            const subtitle = welcomeEl.querySelector('.welcome-subtitle');
            if (subtitle) {
                subtitle.textContent = `Your ${protocolLabel} is ready—start when you feel prepared.`;
            }
        }

        const hintEl = document.getElementById('newUserHint');
        if (hintEl) {
            hintEl.style.display = 'block';
            hintEl.textContent = 'You can tweak the duration below or tap start when you are ready.';
        }

        const preFastState = document.getElementById('preFastState');
        if (preFastState) {
            preFastState.classList.add('draft-ready');
        }

        if (durationHours && window.selectDuration) {
            try {
                window.selectDuration(durationHours);
                if (window.updateStartButtonText) {
                    window.updateStartButtonText();
                }
            } catch (error) {
                this.logger.warn('TimerOnboardingController: failed to apply preselected duration', error);
            }
        }

        const startBtn = document.getElementById('startFastBtn');
        if (startBtn && durationHours) {
            startBtn.textContent = `Start ${durationHours}h Fast`;
        }
    }

    _bindCompletionCta() {
        const completionCta = document.getElementById('addToScheduleBtn');
        if (!completionCta) {
            return;
        }

        completionCta.addEventListener('click', (event) => {
            event.preventDefault();
            this._navigateToScheduleFromCompletion();
        });
    }

    _navigateToScheduleFromCompletion() {
        try {
            sessionStorage.setItem('ff_schedule_from_timer', '1');
        } catch (error) {
            this.logger.warn('TimerOnboardingController: unable to persist schedule entry intent', error);
        }

        this.navigation.goToSchedule();
    }
}

window.FastingForecastTimerOnboardingController = TimerOnboardingController;
