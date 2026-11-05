// The app's entry. The crash reporter goes in first, before any app module
// loads, so a throw while the app starts up is reported too. require() rather
// than import, so the order below is the order things run (imports are hoisted).
const { installGlobalErrorHandler } = require("./src/lib/error-reporting");

try {
  installGlobalErrorHandler();
} catch {
  // Reporting must never stop the app from starting.
}

require("expo-router/entry");
