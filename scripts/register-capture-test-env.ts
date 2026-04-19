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
