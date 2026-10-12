// Metro for an npm-workspaces monorepo (root package.json: packages/*, web, mobile).
//
// Expo's default config already watches the workspace root and resolves
// hoisted packages, and transpiles @jsmf/core (TypeScript source, no build
// step) like any other module.
//
// One thing it cannot know: web pins react 19.2.8 while this Expo SDK needs
// the exact react its renderer was built against (see package.json). npm
// hoists web's copy to the root and nests ours in mobile/node_modules, so a
// hoisted package (@jsmf/core, @tanstack/react-query, expo-router's deps...)
// importing "react" would get web's copy — two Reacts at runtime, and an
// "Invalid hook call" or a renderer version mismatch. Every import of the
// packages below is therefore resolved as if it came from this app's root, so
// the bundle holds exactly one copy of each.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const SINGLETONS = [
  "react",
  "react-dom",
  "react-native",
  "react-native-web",
  "@tanstack/react-query",
  "react-native-reanimated",
  "react-native-safe-area-context",
  "react-native-svg",
];
const appOrigin = path.join(projectRoot, "package.json");
const upstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  const singleton = SINGLETONS.some((name) => moduleName === name || moduleName.startsWith(`${name}/`));
  return resolve(singleton ? { ...context, originModulePath: appOrigin } : context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
