#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
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

const filesToCheck = [
  'server.js',
  path.join('modules', 'pam', 'routes.js'),
  path.join('modules', 'crm', 'routes.js')
];

for (const file of filesToCheck) {
  runCheck(process.execPath, ['--check', file], `syntax check for ${file}`);
}

runCheck(process.execPath, ['-e', "require('./modules/pam/routes'); require('./modules/crm/routes');"], 'module load verification');

console.log('\nAll syntax checks and module load verifications passed successfully.');
