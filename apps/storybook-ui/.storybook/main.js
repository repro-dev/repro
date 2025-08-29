/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: ["../../../packages/*/src/**/*.stories.@(ts|tsx|mdx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};
export default config;
