'use strict';

const fs = require('fs');
const path = require('path');

const modulesDir = __dirname;

function loadModule(directory) {
  const modulePath = path.join(modulesDir, directory);
  const entryPath = path.join(modulePath, 'index.js');

  if (!fs.existsSync(entryPath)) {
    throw new Error(
      `Feature module "${directory}" is missing an index.js entry point. Each module must export { migrate, register }.`
    );
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const featureModule = require(entryPath);
  const moduleName = featureModule?.name || directory;

  if (typeof featureModule.migrate !== 'function') {
    throw new Error(`Feature module "${moduleName}" must export an async migrate(dbApi) function.`);
  }

  if (typeof featureModule.register !== 'function') {
    throw new Error(`Feature module "${moduleName}" must export a register(app, dbApi, middlewares) function.`);
  }

  return {
    priority: Number.isFinite(featureModule.priority) ? featureModule.priority : 0,
    module: featureModule,
    name: moduleName
  };
}

const loadedModules = fs
  .readdirSync(modulesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => loadModule(dirent.name))
  .sort((a, b) => a.priority - b.priority);

const featureModules = Object.freeze(loadedModules.map((entry) => entry.module));
const moduleMetadata = Object.freeze(
  loadedModules.map(({ name, priority }) => Object.freeze({ name, priority }))
);

module.exports = featureModules;
Object.defineProperty(module.exports, 'metadata', {
  value: moduleMetadata,
  enumerable: false,
  configurable: false,
  writable: false
});
