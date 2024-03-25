const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    popup: ['./src/popup/popup.ts', './src/popup/styles.css'],
    background: ['./src/background/background.ts', './src/background/nostr-actions.ts'],
    content: './src/content/content.ts',
    nip07: './src/content/nip07.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/[name].bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup/popup.html',
      chunks: ['popup'],
      inject: false,
    }),
    new MiniCssExtractPlugin({
      filename: '[name]/[name].bundle.css',
    }),
    new CopyPlugin({
      patterns: [
        { from: 'src/assets', to: 'assets' },
        { from: 'src/manifest.json', to: 'manifest.json' }
      ],
    }),
  ],
  devtool: 'inline-source-map',
};