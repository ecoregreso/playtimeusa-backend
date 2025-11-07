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

      const assetPath = path.join('public', src.replace(/^\.\//, ''));
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

function ensureCriticalFilesStartClean() {
  const criticalFiles = [
    'server.js',
    path.join('modules', 'crm', 'migrations.js'),
    path.join('modules', 'crm', 'routes.js'),
    path.join('modules', 'pam', 'migrations.js'),
    path.join('modules', 'pam', 'routes.js'),
    path.join('modules', 'index.js')
  ];

  const allowedStarts = [
    /^['"]use strict['"];?$/,
    /^const\s+/,
    /^module\.exports/,
    /^async\s+function/,
    /^function\s+/,
    /^class\s+/,
    /^require\(/
  ];

  const forbiddenTokens = ['<<<<<<<', '=======', '>>>>>>>'];

  for (const file of criticalFiles) {
    const absolute = path.join(repoRoot, file);
    const content = fs.readFileSync(absolute, 'utf8');
    const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);

    let firstMeaningful = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('//')) continue;
      if (trimmed.startsWith('/*')) continue;
      if (trimmed.startsWith('*')) continue;
      if (trimmed.startsWith('#!')) continue;
      firstMeaningful = trimmed;
      break;
    }

    if (forbiddenTokens.some((token) => content.includes(token))) {
      throw new Error(`Merge conflict marker detected in ${file}. Clean the file before committing.`);
    }

    if (!firstMeaningful) {
      throw new Error(`File ${file} appears to be empty or contains only comments.`);
    }

    if (!allowedStarts.some((pattern) => pattern.test(firstMeaningful))) {
      throw new Error(
        `Unexpected leading content in ${file}. First non-comment line was: "${firstMeaningful}"`
      );
    }
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

ensureCriticalFilesStartClean();
ensureStaticAssetCoverage();

console.log('\nAll syntax checks, module loads, and asset verifications passed successfully.');
