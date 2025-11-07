#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const process = require('process');

const repoRoot = path.resolve(__dirname, '..');
process.chdir(repoRoot);

function runCheck(command, args, description) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Failed while executing ${description}`);
  }
}

function ensureStaticAssetCoverage() {
  const htmlFiles = [
    path.join('public', 'login.html'),
    path.join('public', 'cashier.html')
  ];

  const missingAssets = new Set();

  const scriptPattern = /<script[^>]+src="(.+?)"/g;

  for (const htmlFile of htmlFiles) {
    const htmlPath = path.join(repoRoot, htmlFile);
    const markup = fs.readFileSync(htmlPath, 'utf8');

    for (const match of markup.matchAll(scriptPattern)) {
      const src = match[1];
      if (!src || !src.startsWith('./')) continue;

      const assetPath = path.join('public', src.replace(/^\.\/, ''));
      const resolved = path.join(repoRoot, assetPath);
      if (!fs.existsSync(resolved)) {
        missingAssets.add(assetPath);
      }
    }
  }

  if (missingAssets.size) {
    const formatted = Array.from(missingAssets).join('\n  - ');
    throw new Error(`The following script assets referenced in HTML are missing:\n  - ${formatted}`);
  }
}

const filesToCheck = [
  'server.js',
  path.join('modules', 'pam', 'routes.js'),
  path.join('modules', 'crm', 'routes.js')
];

for (const file of filesToCheck) {
  runCheck(process.execPath, ['--check', file], `syntax check for ${file}`);
}

runCheck(
  process.execPath,
  ['-e', "require('./modules/pam/routes'); require('./modules/crm/routes');"],
  'module load verification'
);

ensureStaticAssetCoverage();

console.log('\nAll syntax checks, module loads, and asset verifications passed successfully.');
