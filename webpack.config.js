const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    entry: {
        engine: ['./src/index.ts'],
    },
    mode: 'production',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'library.umd.js',
        library: '@knopkem/little-game-engine-ts',
        libraryTarget: 'umd',
    },
    devtool: 'source-map',
    resolve: {
        extensions: ['.ts', '.tsx']
    },
    module: {
      rules: [
        {
          test: /\.ts(x)?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    optimization: {
        minimize: true,
    },
    plugins: [
        new CleanWebpackPlugin(),
    ]
};