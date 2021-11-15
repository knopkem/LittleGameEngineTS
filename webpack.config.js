const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: {
        engine: ['./src/index.ts'],
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'library.esm.js',
        library: {
          type: 'module'
        }
    },
    devtool: "source-map",
    experiments: {
          outputModule: true
        },
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
        new CopyWebpackPlugin({
            patterns: [ 
              { from: "src/library.esm.d.ts", to: "library.esm.d.ts" },
                ] 
        })
    ]
};