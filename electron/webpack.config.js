const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv'); // <-- Add this

// Load .env file from the current directory (electron/.env)
const env = dotenv.config({ path: path.resolve(__dirname, '.env') }).parsed || {};

// Create an object to hold environment variables for DefinePlugin
const envKeys = Object.keys(env).reduce((prev, next) => {
  // Only include REACT_APP_ prefixed variables for security and convention
  if (next.startsWith('REACT_APP_')) {
    prev[`process.env.${next}`] = JSON.stringify(env[next]);
  }
  return prev;
}, {});

module.exports = {
    mode: process.env.NODE_ENV || 'development', // Use NODE_ENV or default to development
    entry: './src/index.js',
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist'),
        publicPath: '/', // Important for routing/assets in dev server
    },
    devServer: {
        static: {
            directory: path.join(__dirname, 'public'),
        },
        port: 8080,
        hot: true, // Enable Hot Module Replacement
        historyApiFallback: true, // Correctly handle client-side routing if you add it
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
            // Updated CSP for Dev Server to match index.html
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:8080; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.amazonaws.com ws://localhost:8080 http://localhost:8080; img-src 'self' data:;"
        },
        client: {
            webSocketURL: 'ws://localhost:8080/ws',
            overlay: {
                errors: true,
                warnings: false,
            },
        },
         // setupMiddlewares is deprecated, use devMiddleware and onBeforeSetupMiddleware/onAfterSetupMiddleware if complex setup needed
         // For simple CORS, headers above are usually sufficient.
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-react'],
                    },
                },
            },
            {
                // Updated CSS rule to only include CSS from src, excluding node_modules CSS
                test: /\.css$/i,
                use: ["style-loader", "css-loader"],
                include: path.resolve(__dirname, 'src'),
            },
             // Add rule for images/fonts if you use them directly
             {
                test: /\.(png|svg|jpg|jpeg|gif|woff|woff2|eot|ttf|otf)$/i,
                type: 'asset/resource',
             },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: path.join(__dirname, 'public', 'index.html'),
            // filename: 'index.html' // default is index.html
            // inject: true // default is true
        }),
        // **IMPORTANT**: Remove hardcoded credentials from DefinePlugin
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
            ...envKeys // <-- Spread the loaded REACT_APP_ variables here
        }),
        new webpack.ProvidePlugin({
            process: 'process/browser',
            Buffer: ['buffer', 'Buffer']
        })
    ],
    resolve: {
        extensions: ['.js', '.jsx'], // Removed .json, .css (handled by loaders)
        // Removed alias and modules - usually not needed with standard src structure
        fallback: {
            // Keep necessary fallbacks for browser environment
            "buffer": require.resolve("buffer/"),
            "crypto": require.resolve("crypto-browserify"),
            "stream": require.resolve("stream-browserify"),
            "util": require.resolve("util/"),
            "process": require.resolve("process/browser"),
            "http": require.resolve("stream-http"),
            "https": require.resolve("https-browserify"),
            "url": require.resolve("url/"),
            "zlib": require.resolve("browserify-zlib"),
            "path": false, // Indicate path module is not needed/polyfilled
            "fs": false,   // Indicate fs module is not needed/polyfilled
            // Add others here if specific errors arise (e.g., 'os', 'assert')
        }
    },
    target: 'web', // Keep target as web for renderer
    // Add source maps for easier debugging in development
    devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'eval-source-map',
};
