import type { ItemState } from "./contracts";

export type ForwardSourceState = Exclude<
  ItemState,
  "awaiting" | "failed" | "escalated" | "completed" | "canceled"
>;

export type InProgressState = Exclude<
  ItemState,
  "queued" | "awaiting" | "failed" | "escalated" | "completed" | "canceled"
>;

export type ImmediateCancellationState = "queued" | "failed" | "awaiting";

export type CancellationTransition =
  | {
      kind: "canceled";
      from: ImmediateCancellationState;
      to: "canceled";
      cancellation_requested: false;
    }
  | {
      kind: "cancellation-requested";
      from: InProgressState;
      to: InProgressState;
      cancellation_requested: true;
    }
  | {
      kind: "rejected";
      from: Exclude<ItemState, ImmediateCancellationState | InProgressState>;
      cancellation_requested: false;
      reason: string;
    };

const forwardTransitionMap: Record<ForwardSourceState, ItemState> = {
  queued: "claimed",
  claimed: "preparing",
  preparing: "planning",
  planning: "developing",
  developing: "testing",
  testing: "reviewing",
  reviewing: "reconciling",
  reconciling: "completed",
};

const inProgressStates: readonly InProgressState[] = [
  "claimed",
  "preparing",
  "planning",
  "developing",
  "testing",
  "reviewing",
  "reconciling",
] as const;

const immediateCancellationStates: readonly ImmediateCancellationState[] = [
  "queued",
  "failed",
  "awaiting",
] as const;

export function isTerminalState(state: ItemState): boolean {
  return state === "escalated" || state === "completed" || state === "canceled";
}

export function isInProgressState(state: ItemState): state is InProgressState {
  return (inProgressStates as readonly ItemState[]).includes(state);
}

export function isImmediateCancellationState(
  state: ItemState,
): state is ImmediateCancellationState {
  return (immediateCancellationStates as readonly ItemState[]).includes(state);
}

export function getForwardTransition(state: ItemState): ItemState | null {
  return state in forwardTransitionMap
    ? forwardTransitionMap[state as ForwardSourceState]
    : null;
}

export function getFailureTransition(state: ItemState): "failed" | null {
  return isInProgressState(state) ? "failed" : null;
}

export function getRetryTransition(state: ItemState): "queued" | null {
  return state === "failed" ? "queued" : null;
}

export function getCancellationTransition(
  state: ItemState,
): CancellationTransition {
  if (isImmediateCancellationState(state)) {
    return {
      kind: "canceled",
      from: state,
      to: "canceled",
      cancellation_requested: false,
    };
  }

  if (isInProgressState(state)) {
    return {
      kind: "cancellation-requested",
      from: state,
      to: state,
      cancellation_requested: true,
    };
  }

  return {
    kind: "rejected",
    from: state,
    cancellation_requested: false,
    reason:
      "cancellation is only immediate for queued, failed, and awaiting items",
  };
}
