/**
 * Shared capture/recording test environment.
 *
 * Keep this preload as the single source of truth for tests that need DOM
 * globals and idle-callback behavior. It installs jsdom before any test file
 * runs and provides the async requestIdleCallback/cancelIdleCallback fallback
 * used by buffer eviction and other idle-time code paths.
 *
 * Future capture/recording tests should rely on this preload instead of adding
 * ad hoc shims so the runtime contract stays consistent across suites.
 */
import "global-jsdom/register";

type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining(): number;
};

type IdleRequestCallback = (deadline: IdleDeadline) => void;

function installIdleCallback(target: Record<string, unknown>) {
  if (typeof target.requestIdleCallback !== "function") {
    target.requestIdleCallback = (callback: IdleRequestCallback) => {
      return setTimeout(() => {
        callback({
          didTimeout: false,
          timeRemaining: () => 0,
        });
      }, 0);
    };
  }

  if (typeof target.cancelIdleCallback !== "function") {
    target.cancelIdleCallback = (handle: ReturnType<typeof setTimeout>) => {
      clearTimeout(handle);
    };
  }
}

installIdleCallback(globalThis as Record<string, unknown>);

if (typeof globalThis.window !== "undefined") {
  installIdleCallback(globalThis.window as Record<string, unknown>);
}
