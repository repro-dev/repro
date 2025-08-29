/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: ["../../../packages/*/src/**/*.stories.@(ts|tsx)"],
  addons: ["@chromatic-com/storybook", "@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};
export default config;

