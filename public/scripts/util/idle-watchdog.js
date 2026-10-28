/**
 * Default timeout budgets for a single streaming response, in milliseconds.
 * Tune these if a backend legitimately needs longer than this to produce any output.
 */
export const STREAM_TIMEOUTS = {
    /** Time allowed for the request to be accepted and start yielding data. */
    connectMs: 180000,
    /** Time allowed for the first token to arrive. */
    firstTokenMs: 180000,
    /** Time allowed between two consecutive chunks once the stream has started. */
    idleMs: 120000,
};

/**
 * Delay after a manual stop before the UI is force-unlocked, in milliseconds.
 */
export const GENERATION_STOP_FALLBACK_MS = 3000;

/**
 * @returns {boolean} Whether the document is currently hidden.
 */
function defaultIsHidden() {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Wall-clock based idle watchdog.
 *
 * A single long `setTimeout` is not reliable on mobile: browsers throttle or suspend timers while
 * the page is hidden, so a stalled stream could return from the background still holding the
 * generation lock. This watchdog stores a deadline, evaluates it on a short interval, and
 * re-checks immediately when the page becomes visible again. Time spent hidden does not count
 * towards the idle budget, so a legitimately backgrounded generation is not killed on return.
 */
export class IdleWatchdog {
    /**
     * @param {object} options Watchdog options
     * @param {number | (() => number)} options.timeoutMs Idle budget in milliseconds. Values <= 0 disable the watchdog.
     * @param {() => void} options.onExpire Called once when the idle budget is exhausted.
     * @param {() => number} [options.now] Clock source, injectable for tests.
     * @param {() => boolean} [options.isHidden] Visibility probe, injectable for tests.
     * @param {number} [options.checkIntervalMs] How often the deadline is evaluated.
     */
    constructor({ timeoutMs, onExpire, now = () => Date.now(), isHidden = defaultIsHidden, checkIntervalMs = 1000 }) {
        this.getTimeoutMs = typeof timeoutMs === 'function' ? timeoutMs : () => timeoutMs;
        this.onExpire = onExpire;
        this.now = now;
        this.isHidden = isHidden;
        this.checkIntervalMs = checkIntervalMs;
        this.deadline = 0;
        this.hiddenAt = null;
        this.intervalId = null;
        this.visibilityHandler = null;
    }

    /**
     * @returns {boolean} Whether the watchdog is currently running.
     */
    get isArmed() {
        return this.intervalId !== null;
    }

    /**
     * Starts (or restarts) the watchdog.
     */
    arm() {
        this.dispose();

        if (!(this.getTimeoutMs() > 0)) {
            return;
        }

        this.deadline = this.now() + this.getTimeoutMs();
        this.hiddenAt = this.isHidden() ? this.now() : null;
        this.intervalId = setInterval(() => this.check(), this.checkIntervalMs);

        if (typeof document !== 'undefined') {
            this.visibilityHandler = () => this.check();
            document.addEventListener('visibilitychange', this.visibilityHandler);
        }
    }

    /**
     * Resets the idle budget. Call on every sign of progress.
     */
    touch() {
        if (!this.isArmed) {
            return;
        }

        this.deadline = this.now() + this.getTimeoutMs();
    }

    /**
     * Evaluates the deadline right now.
     */
    check() {
        if (!this.isArmed) {
            return;
        }

        const now = this.now();

        if (this.isHidden()) {
            this.hiddenAt ??= now;
            return;
        }

        if (this.hiddenAt !== null) {
            this.deadline += now - this.hiddenAt;
            this.hiddenAt = null;
        }

        if (now < this.deadline) {
            return;
        }

        this.dispose();
        this.onExpire();
    }

    /**
     * Stops the watchdog without firing.
     */
    dispose() {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        if (this.visibilityHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
        }

        this.visibilityHandler = null;
        this.hiddenAt = null;
    }
}

/**
 * @typedef {object} WithTimeoutOptions
 * @property {() => void} [options.onTimeout] Called before rejecting. Use it to abort the underlying request.
 * @property {string} [options.message] Error message used when the timeout fires.
 */

/**
 * Rejects with a timeout error if the promise does not settle in time.
 * The underlying operation is not cancelled automatically: pass `onTimeout` to abort it.
 * @template T
 * @param {Promise<T>} promise Promise to wait for.
 * @param {number} timeoutMs Timeout in milliseconds. Values <= 0 return the original promise.
 * @param {WithTimeoutOptions} [options] Extra options.
 * @returns {Promise<T>} The original promise, raced against the timeout.
 */
export function withTimeout(promise, timeoutMs, { onTimeout, message = 'Operation timed out' } = {}) {
    if (!(timeoutMs > 0)) {
        return promise;
    }

    // The underlying promise can settle after the timeout has already won the race.
    // Attach a handler so that late rejection is not reported as unhandled.
    if (typeof promise?.catch === 'function') {
        promise.catch(() => {});
    }

    let timer = null;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            try {
                onTimeout?.();
            } catch (error) {
                console.error('Timeout callback failed', error);
            }
            reject(new Error(message));
        }, timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
