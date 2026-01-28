/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: [
    "../../../packages/*/src/**/*.stories.@(ts|tsx|mdx)",
    "../../../apps/*/src/**/*.stories.@(ts|tsx|mdx)",
  ],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(config) {
    config.define = {
      ...config.define,
      "process.env.REPRO_APP_URL": JSON.stringify(""),
    };
    return config;
  },
};
export default config;
