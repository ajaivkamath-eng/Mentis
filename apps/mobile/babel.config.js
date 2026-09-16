/**
 * Babel — Expo preset + NativeWind's JSX import source.
 *
 * `jsxImportSource: 'nativewind'` is what makes `className` work on native
 * components; without it className is silently ignored. The Reanimated/worklets
 * plugin is added automatically by babel-preset-expo (SDK 54) when
 * react-native-worklets is installed, so it must NOT be listed again here.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
