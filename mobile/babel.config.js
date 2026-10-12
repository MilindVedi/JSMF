module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind's JSX transform turns `className` into styles; babel-preset-expo
    // also adds the Reanimated/worklets plugin itself.
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
