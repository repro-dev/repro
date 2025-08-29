import { applyResetStyles } from "@repro/theme";

const globalStyleRoot = document.getElementById("global-styles");

applyResetStyles("", globalStyleRoot);

const preview = {
  tags: ["autodocs"],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;

