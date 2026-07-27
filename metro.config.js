const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-google-mobile-ads': path.resolve(__dirname, 'mocks/react-native-google-mobile-ads.js'),
};

module.exports = config;