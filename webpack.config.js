const path = require('path');
const HtmlWebPackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: {
        engine: ['./src/index.ts'],
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.umd.min.js',
        libraryTarget: 'umd',
        umdNamedDefine: true,
        globalObject: 'this'
    },
    devtool: "source-map",
    resolve: {
        extensions: [".ts"]
    },
    externals: {
      cryptojs: 'crypto-js',
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
        new HtmlWebPackPlugin({
            template: "./public/index.html"
        })
    ]
};