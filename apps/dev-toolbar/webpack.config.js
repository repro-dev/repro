const { EsbuildPlugin } = require('esbuild-loader')
const path = require('path')
const webpack = require('webpack')

const EnvironmentPlugin = webpack.EnvironmentPlugin
const mode = process.env.MODE || 'extension'
const buildVersion = process.env.BUILD_VERSION || 'unknown'

module.exports = {
  mode: process.env.BUILD_ENV === 'production' ? 'production' : 'development',

  entry:
    mode === 'standalone'
      ? { 'toolbar-standalone': path.resolve(__dirname, 'src/index.tsx') }
      : {
          background: path.resolve(__dirname, 'src/extension/background.ts'),
          content: path.resolve(__dirname, 'src/extension/content.ts'),
          page: path.resolve(__dirname, 'src/index.tsx'),
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
    new webpack.DefinePlugin({
      __BUILD_VERSION__: JSON.stringify(buildVersion),
    }),

    new EnvironmentPlugin({
      AUTH_STORAGE: 'local-storage',
      BUILD_ENV: 'production',
      MODE: 'extension',
      REPRO_API_URL: '',
      STATS_LEVEL: 'debug',
    }),
  ],

  devtool: process.env.BUILD_ENV === 'development' ? 'source-map' : false,
}
