const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// openid-client is a server-only library (Node ESM, uses crypto APIs Metro
// can't bundle for React Native). The mobile auth flow uses
// expo-auth-session directly and posts to the server's
// /api/replit-auth/mobile-auth/* endpoints for token exchange, so this
// package must never be pulled into the mobile bundle. Block it (and its
// transitive runtime oauth4webapi) so the bundler fails fast instead of
// crashing at runtime if anything ever tries to import it.
config.resolver = config.resolver || {};
const extraBlocks = [
  /\/node_modules\/openid-client\/.*/,
  /\/node_modules\/oauth4webapi\/.*/,
];
config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, extraBlocks)
  : extraBlocks;

module.exports = config;
