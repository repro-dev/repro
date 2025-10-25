const { EsbuildPlugin } = require('esbuild-loader')
const path = require('path')
const { EnvironmentPlugin } = require('webpack')

module.exports = {
  mode: process.env.BUILD_ENV === 'production' ? 'production' : 'development',

  entry: {
    background: path.resolve(__dirname, 'src/extension/background.ts'),
    content: path.resolve(__dirname, 'src/extension/content.ts'),
    bridge: path.resolve(__dirname, 'src/extension/bridge.ts'),
    capture: path.resolve(__dirname, 'src/index.tsx'),
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'esbuild-loader',
        options: {
          minify: true,
          target: 'esnext',
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },

  optimization: {
    minimizer: [
      new EsbuildPlugin({
        target: 'esnext',
      }),
    ],
  },

  plugins: [
    new EnvironmentPlugin({
      BUILD_ENV: 'production',
      MIXPANEL_API_URL: '',
      MIXPANEL_TOKEN: '',
      REPRO_APP_URL: 'http://localhost:8080',
      REPRO_API_URL: 'http://localhost:8181',
      AUTH_STORAGE: 'memory',
      STATS_LEVEL: 'debug',
    }),
  ],

  devtool: process.env.BUILD_ENV === 'development' ? 'source-map' : false,
}
