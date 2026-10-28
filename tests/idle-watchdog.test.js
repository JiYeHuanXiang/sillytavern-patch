import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { IdleWatchdog, withTimeout } from '../public/scripts/util/idle-watchdog.js';

describe('IdleWatchdog', () => {
    let now;
    let hidden;

    const clock = () => now;

    beforeEach(() => {
        jest.useFakeTimers();
        now = 1000;
        hidden = false;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    /**
     * @param {object} [options] Extra constructor options
     * @returns {{ watchdog: IdleWatchdog, onExpire: jest.Mock }}
     */
    function createWatchdog(options = {}) {
        const onExpire = jest.fn();
        const watchdog = new IdleWatchdog({
            timeoutMs: 5000,
            onExpire,
            now: clock,
            isHidden: () => hidden,
            checkIntervalMs: 1000,
            ...options,
        });
        return { watchdog, onExpire };
    }

    /**
     * Advances both the fake timers and the injected wall clock in interval-sized steps, so every
     * timer callback observes the matching wall-clock time.
     * @param {number} ms Milliseconds to advance
     */
    function advance(ms) {
        let remaining = ms;

        while (remaining > 0) {
            const step = Math.min(1000, remaining);
            now += step;
            jest.advanceTimersByTime(step);
            remaining -= step;
        }
    }

    test('fires when the idle budget is exhausted', () => {
        const { watchdog, onExpire } = createWatchdog();
        watchdog.arm();

        advance(5000);

        expect(onExpire).toHaveBeenCalledTimes(1);
        expect(watchdog.isArmed).toBe(false);
    });

    test('does not fire while progress is reported', () => {
        const { watchdog, onExpire } = createWatchdog();
        watchdog.arm();

        advance(4000);
        expect(onExpire).not.toHaveBeenCalled();

        watchdog.touch();
        advance(4000);
        expect(onExpire).not.toHaveBeenCalled();

        advance(1000);
        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    test('does not count time spent hidden', () => {
        const { watchdog, onExpire } = createWatchdog();
        watchdog.arm();

        hidden = true;
        advance(60000);
        expect(onExpire).not.toHaveBeenCalled();

        // What the visibilitychange listener does when the page comes back.
        hidden = false;
        watchdog.check();

        advance(3999);
        expect(onExpire).not.toHaveBeenCalled();

        advance(1);
        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    test('fires after returning from hidden once the remaining budget runs out', () => {
        const { watchdog, onExpire } = createWatchdog();
        watchdog.arm();

        hidden = true;
        advance(30000);
        hidden = false;
        watchdog.check();

        advance(3000);
        expect(onExpire).not.toHaveBeenCalled();

        advance(1000);
        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    test('dispose stops the watchdog without firing', () => {
        const { watchdog, onExpire } = createWatchdog();
        watchdog.arm();
        watchdog.dispose();

        advance(60000);

        expect(onExpire).not.toHaveBeenCalled();
        expect(watchdog.isArmed).toBe(false);
    });

    test('a zero budget disables the watchdog', () => {
        const { watchdog, onExpire } = createWatchdog({ timeoutMs: 0 });
        watchdog.arm();

        advance(60000);

        expect(watchdog.isArmed).toBe(false);
        expect(onExpire).not.toHaveBeenCalled();
    });

    test('supports a dynamic budget', () => {
        let budget = 1000;
        const { watchdog, onExpire } = createWatchdog({ timeoutMs: () => budget });
        watchdog.arm();

        advance(900);
        expect(onExpire).not.toHaveBeenCalled();

        budget = 3000;
        watchdog.touch();
        advance(2000);
        expect(onExpire).not.toHaveBeenCalled();

        advance(1000);
        expect(onExpire).toHaveBeenCalledTimes(1);
    });
});

describe('withTimeout', () => {
    test('resolves with the original value when the promise wins', async () => {
        await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
    });

    test('passes through non-positive timeouts', async () => {
        const promise = Promise.resolve('untouched');
        expect(withTimeout(promise, 0)).toBe(promise);
    });

    test('rejects when the timeout wins and calls onTimeout', async () => {
        const onTimeout = jest.fn();
        const never = new Promise(() => { });

        await expect(withTimeout(never, 5, { onTimeout, message: 'too slow' })).rejects.toThrow('too slow');
        expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    test('a rejection arriving after the timeout is handled', async () => {
        let rejectLater;
        const late = new Promise((_resolve, reject) => {
            rejectLater = reject;
        });

        await expect(withTimeout(late, 5, { message: 'timeout' })).rejects.toThrow('timeout');

        // Without the handler attached by withTimeout this would surface as an unhandled rejection.
        rejectLater(new Error('late failure'));
        await new Promise(resolve => setTimeout(resolve, 10));
    });
});
