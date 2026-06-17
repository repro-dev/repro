import { createElement } from "react";
import { ConfirmDialogProvider, PortalRootProvider, ToastProvider } from "@repro/design";
import { applyResetStyles } from "@repro/theme";

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

