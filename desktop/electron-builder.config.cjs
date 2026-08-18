'use strict';

// Signed with a Developer ID when one is configured, ad-hoc otherwise. The two
// paths differ in more than the identity: the hardened runtime is required for
// notarization but cannot be used with an ad-hoc signature, so it follows the
// same switch.
const identity = process.env.CSC_NAME || process.env.CSC_LINK;
const signed = Boolean(identity);
const notarize =
  signed && process.env.APPLE_ID && process.env.APPLE_TEAM_ID
    ? { teamId: process.env.APPLE_TEAM_ID }
    : false;

module.exports = {
  appId: 'dev.ryanbekhen.dermaga',
  productName: 'Dermaga',
  copyright: 'MIT © ryanbekhen',

  directories: {
    output: 'release',
    buildResources: 'build',
  },

  afterPack: 'build/afterPack.cjs',

  // The renderer is loaded from disk and the agent rides along as a resource,
  // so app.asar only needs the Electron shell and the built UI.
  files: ['electron/**/*', 'dist/**/*', 'package.json', '!node_modules/**/*'],

  // The whole point of the DMG: the agent is inside it, so installing the app
  // installs everything Dermaga needs.
  extraResources: [
    { from: '../bin/dermaga-agent', to: 'dermaga-agent' },
  ],

  mac: {
    category: 'public.app-category.developer-tools',
    target: [{ target: 'dmg', arch: ['arm64'] }],
    darkModeSupport: true,
    // null tells electron-builder to skip signing; build/afterPack.cjs then
    // ad-hoc signs, which Apple Silicon requires in order to launch at all.
    identity: signed ? undefined : null,
    hardenedRuntime: signed,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    notarize,
  },

  dmg: {
    title: 'Dermaga ${version}',
    contents: [
      { x: 140, y: 200, type: 'file' },
      { x: 400, y: 200, type: 'link', path: '/Applications' },
    ],
  },
};
