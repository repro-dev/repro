const path = require('path')

const { EsbuildPlugin } = require('esbuild-loader')
const HtmlWebpackPlugin = require('html-webpack-plugin')

let baseURL = process.env.REPRO_APP_URL || '/'

if (!baseURL.endsWith('/')) {
  baseURL += '/'
}

module.exports = {
  mode: process.env.BUILD_ENV === 'production' ? 'production' : 'development',

  entry: {
    index: path.resolve(__dirname, 'src/index.tsx'),
    apiBridge: path.resolve(__dirname, 'src/apiBridge.tsx'),
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
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: path.resolve(__dirname, 'src/templates/index.html'),
      base: baseURL,
      hash: true,
      chunks: ['index'],
      templateParameters: {
        env: {
          BUILD_ENV: process.env.BUILD_ENV,
          REPRO_APP_URL: process.env.REPRO_APP_URL,
          REPRO_API_URL: process.env.REPRO_API_URL,
        },
      },
    }),

    new HtmlWebpackPlugin({
      filename: 'apiBridge.html',
      template: path.resolve(__dirname, 'src/templates/apiBridge.html'),
      base: baseURL,
      hash: true,
      chunks: ['apiBridge'],
      templateParameters: {
        env: {
          BUILD_ENV: process.env.BUILD_ENV,
          REPRO_APP_URL: process.env.REPRO_APP_URL,
          REPRO_API_URL: process.env.REPRO_API_URL,
        },
      },
    }),
  ],

  devServer: {
    port: process.env.PORT,
    allowedHosts: 'all',
    historyApiFallback: true,
    static: path.resolve(__dirname, 'dist'),
    webSocketServer: false,
  },

  devtool: process.env.BUILD_ENV === 'development' ? 'eval-source-map' : false,
}
