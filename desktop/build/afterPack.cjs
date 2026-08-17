'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Runs after electron-builder assembles the bundle, before the DMG is made.
 *
 * Two jobs. First, prove the agent actually shipped -- a DMG without it
 * installs an app that cannot do anything, and that failure would only surface
 * on someone else's machine. Second, ad-hoc sign unsigned builds: electron-
 * builder renames the Electron binary and adds resources after Electron's own
 * signature was applied, and Apple Silicon refuses to launch a bundle whose
 * signature does not verify.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  verifyAgent(appPath);

  // A real identity means electron-builder signs it properly; do not overwrite
  // that with an ad-hoc signature.
  if (process.env.CSC_NAME || process.env.CSC_LINK) return;

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed  file=${appPath}`);
};

function verifyAgent(appPath) {
  const agent = path.join(appPath, 'Contents', 'Resources', 'dermaga-agent');

  if (!fs.existsSync(agent)) {
    throw new Error(
      'dermaga-agent is missing from the bundle. Run `make agent` before packaging.'
    );
  }

  // Executable, or the app ships something it cannot spawn.
  fs.accessSync(agent, fs.constants.X_OK);

  const described = execFileSync('file', ['-b', agent]).toString().trim();
  if (!described.includes('arm64')) {
    throw new Error(`dermaga-agent is not an arm64 binary: ${described}`);
  }

  // It has to answer, not merely exist.
  const version = execFileSync(agent, ['--version']).toString().trim();
  console.log(`  • agent verified  version=${version}  ${described}`);
}
