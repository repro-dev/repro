import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: [
    "../../../packages/*/src/**/*.stories.@(ts|tsx)",
    "../../../packages/*/src/**/*.mdx",
    "../../../apps/*/src/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(config) {
    config.define = {
      ...config.define,
      "process.env.REPRO_APP_URL": JSON.stringify(""),
    };

    const tailwindcss = (await import("@tailwindcss/vite")).default;

    config.plugins = [
      tailwindcss(),
      ...(config.plugins ?? []),
      {
        name: "resolve-file-urls",
        resolveId(source) {
          if (source.startsWith("file://")) {
            return fileURLToPath(source);
          }
        },
      },
    ];

    // Dedupe React and Storybook packages across the monorepo.
    config.resolve = {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        "~": resolve(__dirname, "../../../packages/design/src"),
      },
      dedupe: [
        ...(config.resolve?.dedupe ?? []),
        "@storybook/addon-docs",
        "@storybook/react",
        "react",
        "react-dom",
      ],
    };

    return config;
  },
};
export default config;
