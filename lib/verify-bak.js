/*!
 * pkg-verify.js - package verifier
 * Copyright (c) 2017, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/pkg-verify
 */

'use strict';

const semver = require('./semver');

/*
 * Constants
 */

const fields = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies'
];

const cache = Object.create(null);

/*
 * Verify
 */

function verify(require, file) {
  if (file.slice(-12) !== 'package.json') {
    if (file[file.length - 1] === '/')
      file = file.slice(0, -1);
    file = `${file}/package.json`;
  }

  let key;
  try {
    key = require.resolve(file);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND')
      throw new Error('Missing package.json!');
    throw e;
  }

  if (cache[key])
    return;

  let pkg;

  try {
    pkg = require(file);
  } catch (e) {
    throw new Error('Malformed package.json!');
  }

  if (!pkg || typeof pkg !== 'object')
    throw new Error('Missing package.json!');

  for (const field of fields) {
    const deps = pkg[field];

    if (!deps)
      continue;

    if (typeof deps !== 'object')
      throw new Error(`Invalid field in package.json: ${field}.`);

    verifyDeps(field, require, deps);
  }

  cache[key] = true;
}

/*
 * Verify Deps
 */

function verifyDeps(field, require, deps) {
  for (const name of Object.keys(deps)) {
    if (name[0] === '@')
      continue;

    if (name.indexOf('://') !== -1)
      continue;

    const version = deps[name];

    if (typeof version !== 'string')
      throw new Error(`Invalid field in ${field}: ${name}.`);

    try {
      require.resolve(name);
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        if (field !== 'optionalDependencies')
          throw new Error(`Missing dependency: ${name}@${version}.`);
        continue;
      }
      throw new Error('Error accessing dependency.');
    }

    let pkg;
    try {
      pkg = require(`${name}/package.json`);
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND')
        throw new Error(`Missing package.json for ${name}${version}.`);
      throw new Error(`Malformed package.json for ${name}${version}.`);
    }

    if (!pkg || typeof pkg.version !== 'string')
      throw new Error(`No version in package.json: ${name}@${version}.`);

    if (!semver.valid(pkg.version))
      throw new Error('Invalid version for'
        + ` ${name}@${version}: ${pkg.version}.`);

    if (!semver.satisfies(pkg.version, version)) {
      throw new Error('Unmet dependency version for'
        + ` ${name}@${version}: ${pkg.version}.`);
    }
  }
}

/*
 * Warn
 */

function warn(require, file) {
  try {
    verify(require, file);
  } catch (e) {
    console.error(`pkg-verify: ${e.message}.`);
  }
}

/*
 * Exit
 */

function exit(require, file) {
  try {
    verify(require, file);
  } catch (e) {
    console.error(`pkg-verify: ${e.message}.`);
    process.exit(1);
  }
}

/*
 * Expose
 */

exports = verify;
exports.verify = verify;
exports.warn = warn;
exports.exit = exit;

module.exports = exports;
