import {
  createJsonErrorEnvelope,
  createJsonSuccessEnvelope,
} from "@repro/autobot-core";

import type {
  AutobotErrorEnvelopeInput,
  AutobotSuccessEnvelopeInput,
} from "../types";

export function renderJsonSuccessEnvelope<TData>(
  input: AutobotSuccessEnvelopeInput<TData>,
): string {
  return `${JSON.stringify(createJsonSuccessEnvelope(input))}\n`;
}

export function renderJsonErrorEnvelope(
  input: AutobotErrorEnvelopeInput,
): string {
  return `${JSON.stringify(createJsonErrorEnvelope(input))}\n`;
}
