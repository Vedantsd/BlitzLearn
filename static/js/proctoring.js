class BlitzProctor {
    constructor(options = {}) {
        this.maxViolations = options.maxViolations || 3;
        this.testType = options.testType || 'test'; 
        this.badgeContainer = options.badgeContainer || null;
        this.onDisqualify = options.onDisqualify || null;
        this.onViolation = options.onViolation || null;
        this.onStart = options.onStart || null;
        this.onStop = options.onStop || null;

        this.violationCount = 0;
        this.isActive = false;
        this.isDisqualified = false;
        this.isModalOpen = false;
        this.lastViolationTimestamp = 0;
        this.resumeGraceUntil = 0;
        this.cooldownMs = 2500; 

        this._boundHandleFullscreenChange = this._handleFullscreenChange.bind(this);
        this._boundHandleVisibilityChange = this._handleVisibilityChange.bind(this);
        this._boundHandleBlur = this._handleBlur.bind(this);

        this._initOverlay();
    }

    _initOverlay() {
        let overlay = document.getElementById('blitz-proctor-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'blitz-proctor-overlay';
            overlay.className = 'proctor-overlay';
            overlay.innerHTML = `
                <div class="proctor-modal" id="blitz-proctor-modal">
                    <div class="proctor-modal-icon warning" id="proctor-modal-icon">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <h3 class="proctor-modal-title" id="proctor-modal-title">Anti-Cheating Warning</h3>
                    <p class="proctor-modal-message" id="proctor-modal-message">
                        You have exited fullscreen or switched away from the test screen. Fullscreen is mandatory during the assessment.
                    </p>
                    <div class="proctor-count-box">
                        <span class="proctor-count-label">Tab Switch / Screen Exit Count</span>
                        <span class="proctor-count-value" id="proctor-modal-count">1 / 3</span>
                        <span class="proctor-count-detail">If you exceed 3 tab switches, the test will be auto-submitted with 0 marks!</span>
                    </div>
                    <button type="button" class="proctor-btn-resume" id="proctor-resume-btn">
                        Return to Fullscreen & Resume Test
                    </button>
                </div>
            `;
            document.body.appendChild(overlay);

            document.getElementById('proctor-resume-btn').addEventListener('click', () => {
                if (this.isDisqualified) {
                    this._hideOverlay();
                    return;
                }

                this.resumeGraceUntil = Date.now() + 2500;
                this._hideOverlay();
                this.enterFullscreen().catch(() => {});
            });
        }
        this.overlayEl = overlay;
    }

    static requestFullscreen() {
        const elem = document.documentElement;
        try {
            if (elem.requestFullscreen) {
                return elem.requestFullscreen().catch(() => {});
            } else if (elem.webkitRequestFullscreen) {
                return elem.webkitRequestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                return elem.mozRequestFullScreen();
            } else if (elem.msRequestFullscreen) {
                return elem.msRequestFullscreen();
            }
        } catch (err) {
            console.warn('Fullscreen request failed:', err);
        }
    }

    async start() {
        if (this.isActive) return;
        this.isActive = true;
        this.violationCount = 0;
        this.isDisqualified = false;
        this.lastViolationTimestamp = 0;

        this.renderBadge();

        document.addEventListener('fullscreenchange', this._boundHandleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', this._boundHandleFullscreenChange);
        document.addEventListener('mozfullscreenchange', this._boundHandleFullscreenChange);
        document.addEventListener('MSFullscreenChange', this._boundHandleFullscreenChange);

        document.addEventListener('visibilitychange', this._boundHandleVisibilityChange);
        window.addEventListener('blur', this._boundHandleBlur);

        if (!this.isFullscreen()) {
            await this.enterFullscreen();
        }

        if (!this.isFullscreen()) {
            this._showFullscreenRequiredModal();
        }

        if (typeof this.onStart === 'function') {
            this.onStart();
        }
    }

    stop() {
        if (!this.isActive) return;
        this.isActive = false;

        document.removeEventListener('fullscreenchange', this._boundHandleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', this._boundHandleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', this._boundHandleFullscreenChange);
        document.removeEventListener('MSFullscreenChange', this._boundHandleFullscreenChange);

        document.removeEventListener('visibilitychange', this._boundHandleVisibilityChange);
        window.removeEventListener('blur', this._boundHandleBlur);

        this._hideOverlay();
        this.exitFullscreen();

        if (typeof this.onStop === 'function') {
            this.onStop();
        }
    }

    async enterFullscreen() {
        const elem = document.documentElement;
        try {
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                await elem.webkitRequestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                await elem.mozRequestFullScreen();
            } else if (elem.msRequestFullscreen) {
                await elem.msRequestFullscreen();
            }
        } catch (err) {
            console.warn('Fullscreen request rejected or requires user gesture:', err);
        }
    }

    exitFullscreen() {
        try {
            if (
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement
            ) {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        } catch (err) {
            console.warn('Error exiting fullscreen:', err);
        }
    }

    isFullscreen() {
        return !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
        );
    }

    _handleFullscreenChange() {
        if (!this.isActive || this.isDisqualified) return;
        if (!this.isFullscreen()) {
            if (Date.now() < this.resumeGraceUntil) return;
            this._recordViolation('fullscreen_exit');
        } else {

            if (!this.isDisqualified) {
                this._hideOverlay();
            }
        }
    }

    _handleVisibilityChange() {
        if (!this.isActive || this.isDisqualified) return;
        if (document.hidden || document.visibilityState === 'hidden') {
            if (Date.now() < this.resumeGraceUntil) return;
            this._recordViolation('tab_switch');
        }
    }

    _handleBlur() {
        if (!this.isActive || this.isDisqualified) return;
        if (Date.now() < this.resumeGraceUntil) return;
        if (this.isModalOpen) return;
        this._recordViolation('window_blur');
    }

    _showFullscreenRequiredModal() {
        if (this.isDisqualified) return;
        this.isModalOpen = true;
        const modalIcon = document.getElementById('proctor-modal-icon');
        const modalTitle = document.getElementById('proctor-modal-title');
        const modalMsg = document.getElementById('proctor-modal-message');
        const countBox = this.overlayEl ? this.overlayEl.querySelector('.proctor-count-box') : null;
        const resumeBtn = document.getElementById('proctor-resume-btn');

        if (modalIcon) {
            modalIcon.className = 'proctor-modal-icon warning';
            modalIcon.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                </svg>
            `;
        }
        if (modalTitle) modalTitle.textContent = 'Fullscreen Mode Required';
        if (modalMsg) modalMsg.textContent = 'Fullscreen is required for this assessment. Please click below to enter fullscreen and begin.';
        if (countBox) countBox.style.display = 'none';
        if (resumeBtn) {
            resumeBtn.className = 'proctor-btn-resume';
            resumeBtn.textContent = 'Enter Fullscreen & Start Test';
        }

        if (this.overlayEl) {
            this.overlayEl.classList.add('active');
        }
    }

    _recordViolation(reason) {
        if (Date.now() < this.resumeGraceUntil) return;
        if (this.isModalOpen) return; 

        const now = Date.now();
        if (now - this.lastViolationTimestamp < this.cooldownMs) {
            return; 
        }
        this.lastViolationTimestamp = now;
        this.isModalOpen = true;

        this.violationCount += 1;
        this.renderBadge();

        if (typeof this.onViolation === 'function') {
            this.onViolation(this.violationCount, this.maxViolations, reason);
        }

        if (this.violationCount > this.maxViolations) {
            this._triggerDisqualification();
        } else {
            this._showWarningModal();
        }
    }

    _showWarningModal() {
        this.isModalOpen = true;
        const modalIcon = document.getElementById('proctor-modal-icon');
        const modalTitle = document.getElementById('proctor-modal-title');
        const modalMsg = document.getElementById('proctor-modal-message');
        const countValue = document.getElementById('proctor-modal-count');
        const countBox = this.overlayEl ? this.overlayEl.querySelector('.proctor-count-box') : null;
        const resumeBtn = document.getElementById('proctor-resume-btn');

        if (countBox) countBox.style.display = '';

        if (modalIcon) {
            modalIcon.className = 'proctor-modal-icon warning';
            modalIcon.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            `;
        }
        if (modalTitle) modalTitle.textContent = `Warning: Tab Switch Detected (${this.violationCount} / ${this.maxViolations})`;
        if (modalMsg) modalMsg.textContent = `You switched tabs, minimized the window, or exited fullscreen. Fullscreen mode is strictly required.`;
        if (countValue) countValue.textContent = `${this.violationCount} / ${this.maxViolations}`;
        if (resumeBtn) {
            resumeBtn.className = 'proctor-btn-resume';
            resumeBtn.textContent = 'Return to Fullscreen & Resume Test';
        }

        if (this.overlayEl) {
            this.overlayEl.classList.add('active');
        }
    }

    _triggerDisqualification() {
        this.isDisqualified = true;
        this.isModalOpen = true;
        this.stop(); 

        const modalIcon = document.getElementById('proctor-modal-icon');
        const modalTitle = document.getElementById('proctor-modal-title');
        const modalMsg = document.getElementById('proctor-modal-message');
        const countValue = document.getElementById('proctor-modal-count');
        const countBox = this.overlayEl ? this.overlayEl.querySelector('.proctor-count-box') : null;
        const resumeBtn = document.getElementById('proctor-resume-btn');

        if (countBox) countBox.style.display = '';

        if (modalIcon) {
            modalIcon.className = 'proctor-modal-icon danger';
            modalIcon.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            `;
        }
        if (modalTitle) modalTitle.textContent = '🚨 Test Terminated & Auto-Submitted';
        if (modalMsg) modalMsg.textContent = `You have exceeded the maximum limit of ${this.maxViolations} tab switches / fullscreen exits. Your test has been automatically submitted and 0 marks have been recorded.`;
        if (countValue) countValue.textContent = `${this.violationCount} / ${this.maxViolations} (Exceeded)`;
        if (resumeBtn) {
            resumeBtn.className = 'proctor-btn-disqualified';
            resumeBtn.textContent = 'View Results';
        }

        if (this.overlayEl) {
            this.overlayEl.classList.add('active');
        }

        if (typeof this.onDisqualify === 'function') {
            this.onDisqualify(this.violationCount);
        }
    }

    _hideOverlay() {
        this.isModalOpen = false;
        if (this.overlayEl) {
            this.overlayEl.classList.remove('active');
        }
    }

    renderBadge() {
        let badgeEl = document.getElementById('blitz-proctor-badge');

        if (!badgeEl) {
            const target = typeof this.badgeContainer === 'string'
                ? document.querySelector(this.badgeContainer)
                : this.badgeContainer;

            if (target) {
                badgeEl = document.createElement('div');
                badgeEl.id = 'blitz-proctor-badge';
                target.appendChild(badgeEl);
            }
        }

        if (!badgeEl) return;

        let statusClass = 'proctor-badge';
        if (this.violationCount === 1) {
            statusClass += ' warning';
        } else if (this.violationCount >= 2) {
            statusClass += ' danger';
        }

        badgeEl.className = statusClass;
        badgeEl.innerHTML = `
            <span class="proctor-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
            </span>
            <span>Tab Switches: <strong>${this.violationCount} / ${this.maxViolations}</strong></span>
        `;
    }
}

window.BlitzProctor = BlitzProctor;
