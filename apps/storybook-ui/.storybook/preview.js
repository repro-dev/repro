import './tailwind.css';
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
      default: "Light",
      values: [
        { name: "Light", value: "#ffffff" },
        { name: "Dark", value: "#1a1a2e" },
        { name: "Neutral", value: "#f5f5f5" },
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
            createElement("div", { style: { padding: "1rem" } }, createElement(Story))
          )
        )
      ),
  ],
};

export default preview;

