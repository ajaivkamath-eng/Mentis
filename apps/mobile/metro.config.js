/**
 * Metro — monorepo resolution for the shared core package.
 *
 * The mobile app imports `@mentis/core` (tokens, RBAC, offline merge rules,
 * register state machine). That package lives outside the app directory, so
 * Metro needs to watch it and resolve it explicitly; otherwise the app builds
 * but crashes at runtime on the first import.
 */
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const coreSrc = path.resolve(workspaceRoot, 'packages/core/src');

const config = getDefaultConfig(projectRoot);

// Watch the shared package so edits hot-reload instead of silently using a stale copy.
config.watchFolders = [path.resolve(workspaceRoot, 'packages/core')];

// Resolve @mentis/core to its TypeScript source — Metro transpiles TS directly.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@mentis/core': coreSrc,
};

// Prefer the app's own node_modules, then the workspace root (hoisted deps):
// a single React instance is what keeps hooks from exploding.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
