import { createElement } from "react";
import { ConfirmDialogProvider, PortalRootProvider, ToastProvider } from "@repro/design";
import { applyResetStyles } from "@repro/theme";
import { criticalA11yRules } from "./a11y-critical-rules.js";

const globalStyleRoot = document.getElementById("global-styles");

applyResetStyles("", globalStyleRoot);

/** @type { import('@storybook/react').Preview } */
const preview = {
  tags: ["autodocs"],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "Neutral",
      values: [
        { name: "Neutral", value: "#f5f5f5" },
        { name: "Light", value: "#ffffff" },
        { name: "Dark", value: "#1a1a2e" },
      ],
    },
    // REP-1648: the test-runner fails a story when axe reports violations.
    // `test: 'error'` upgrades violations from todo-warnings to failures.
    // The axe config enables only critical-impact rules (see
    // a11y-critical-rules.js), which is the issue's "zero critical
    // violations" contract. Using `options.impactLevels: ['critical']`
    // instead would hang the runner on any story whose violations filter
    // down to zero: expectToHaveNoViolations returns { long: null } and
    // truncate(null) throws inside the rendered-event listener, so the test
    // promise never settles (test-runner 0.24.5). With rule-level filtering
    // a non-critical-only story simply reports zero violations and passes.
    a11y: {
      test: "error",
      config: {
        disableOtherRules: true,
        rules: criticalA11yRules.map(id => ({ id, enabled: true })),
      },
    },
  },
  decorators: [
    (Story) =>
      createElement(
        PortalRootProvider,
        null,
        createElement(
          ToastProvider,
          null,
          createElement(
            ConfirmDialogProvider,
            null,
            // eslint-disable-next-line react/forbid-elements
            createElement("div", { style: { padding: "1rem" } }, createElement(Story))
          )
        )
      ),
  ],
};

export default preview;

