// babel.config.js in the 'electron' directory
module.exports = {
  presets: [
    // Preset for compiling modern JavaScript down to ES5
    '@babel/preset-env',
    // Preset for compiling JSX and other React features
    // Runtime 'automatic' avoids needing to import React in every file
    ['@babel/preset-react', { runtime: 'automatic' }]
  ]
};
