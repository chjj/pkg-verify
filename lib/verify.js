/*!
 * pkg-verify.js - package verifier
 * Copyright (c) 2017, Christopher Jeffrey (MIT License).
 * https://github.com/chjj/pkg-verify
 */

'use strict';

const fs = require('fs');
const Path = require('path');
const semver = require('./semver');

/*
 * Constants
 */

const fields = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies'
];

const DEBUG = /pkg-verify/.test(process.env.NODE_DEBUG);

const debug = msg => console.error(`pkg-verify: ${msg}`);

/**
 * Verifier
 */

class Verifier {
  constructor(options) {
    this.options = options || {};
    this.cache = Object.create(null);
    this.bindings = Object.create(null);
  }

  getPaths() {
    return Object.keys(this.cache);
  }

  getBindings() {
    return Object.keys(this.bindings);
  }

  debug(msg) {
    if (this.options.debug)
      this.options.debug(msg);
  }

  error(msg) {
    if (this.options.error) {
      this.options.error(msg);
      return;
    }

    throw new Error(msg);
  }

  verify(name, dirname) {
    const moddir = resolve(name, dirname);

    if (!moddir) {
      this.error('Missing package.json!');
      return;
    }

    this.debug(`Opening main package.json in ${moddir}.`);

    const pkg = read(moddir);

    if (pkg === -1) {
      this.error('Could not open package.json!');
      return;
    }

    if (pkg === -2) {
      this.error('Malformed package.json!');
      return;
    }

    if (pkg.name !== name) {
      this.error(`Package name mismatch: ${name} != ${pkg.name}.`);
      return;
    }

    if (!pkg || typeof pkg !== 'object') {
      this.error('Missing package.json!');
      return;
    }

    this.debug(`Opened package.json for ${pkg.name}.`);

    this.verifyPackage(pkg, moddir);

    return this;
  }

  verifyPackage(pkg, dirname) {
    if (this.cache[dirname])
      return;

    this.cache[dirname] = true;

    if (hasBinding(dirname))
      this.bindings[Path.basename(dirname)] = true;

    this.debug(`Verifying package ${pkg.name} at ${dirname}.`);

    for (const field of fields) {
      const deps = pkg[field];

      if (!deps)
        continue;

      if (typeof deps !== 'object') {
        this.error(`Invalid field in package.json: ${field}.`);
        continue;
      }

      this.verifyDeps(field, deps, dirname);
    }

    this.debug(`Package ${pkg.name} is valid!`);
  }

  verifyDeps(field, deps, dirname) {
    for (const name of Object.keys(deps)) {
      if (name.length === 0) {
        this.error(`Invalid name in ${field}.`);
        continue;
      }

      if (name[0] === '@')
        continue;

      if (name.indexOf('://') !== -1)
        continue;

      const expect = deps[name];

      if (typeof expect !== 'string') {
        this.error(`Invalid field in ${field}: ${name}.`);
        continue;
      }

      const moddir = resolve(name, dirname);

      if (!moddir) {
        if (field === 'optionalDependencies')
          this.debug(`Missing optional dependency: ${name}@${expect}.`);
        else
          this.error(`Missing dependency: ${name}@${expect}.`);
        continue;
      }

      this.debug(`Opening sub package.json in ${moddir}.`);

      const pkg = read(moddir);

      if (pkg === -1) {
        this.error(`Cannot access package.json: ${name}@${expect}.`);
        continue;
      }

      if (pkg === -2) {
        this.error(`Malformed package.json: ${name}@${expect}.`);
        continue;
      }

      if (!pkg || typeof pkg.version !== 'string') {
        this.error(`No version in package.json: ${name}@${expect}.`);
        continue;
      }

      const {version} = pkg;

      if (!semver.valid(version))
        this.error(`Invalid version for ${name}@${expect}: ${version}.`);
      else if (!semver.satisfies(version, expect))
        this.error(`Unmet dependency version ${name}@${expect}: ${version}.`);

      this.debug(`Valid version: ${name}@${version} satisfies ${expect}.`);

      this.verifyPackage(pkg, moddir);
    }
  }
}

/*
 * Verify
 */

function verify(dirname, name, shouldDebug = DEBUG) {
  const v = new Verifier({
    debug: shouldDebug ? debug : null
  });
  return v.verify(name, dirname);
}

/*
 * Warn
 */

function warn(dirname, name, shouldDebug = DEBUG) {
  const v = new Verifier({
    debug: shouldDebug ? debug : null,
    error: (msg) => {
      console.warn(`pkg-verify: ${msg}`);
    }
  });
  return v.verify(name, dirname);
}

/*
 * Exit
 */

function exit(dirname, name, shouldDebug = DEBUG) {
  const v = new Verifier({
    debug: shouldDebug ? debug : null,
    error: (msg) => {
      console.error(`pkg-verify: ${msg}`);
      process.exit(1);
    }
  });
  return v.verify(name, dirname);
}

/*
 * Stop
 */

function stop(dirname, name, shouldDebug = DEBUG) {
  const v = new Verifier({
    debug: shouldDebug ? debug : null,
    error: function error(msg) {
      const err = new Error(msg);

      err.name = 'PackageVerifyError';
      err.type = 'PackageVerifyError';
      err.code = 'ERR_PKGVERIFY';

      if (Error.captureStackTrace)
        Error.captureStackTrace(err, error);

      throw err;
    }
  });
  return v.verify(name, dirname);
}

/*
 * Helpers
 */

const getModulePaths = (() => {
  const globalPaths = (() => {
    const windows = process.platform === 'win32';

    let home, prefix;
    if (windows) {
      home = process.env.USERPROFILE;
      prefix = Path.resolve(process.execPath, '..');
    } else {
      home = process.env.HOME;
      prefix = Path.resolve(process.execPath, '..', '..');
    }

    let paths = [Path.resolve(prefix, 'lib', 'node')];

    if (home) {
      paths.unshift(Path.resolve(home, '.node_libraries'));
      paths.unshift(Path.resolve(home, '.node_modules'));
    }

    const node = process.env['NODE_PATH'];

    if (node) {
      let parts = node.split(Path.delimiter);
      parts = parts.filter(p => Boolean(p));
      paths = parts.concat(paths);
    }

    return paths;
  })();

  const nmChars = [115, 101, 108, 117, 100, 111, 109, 95, 101, 100, 111, 110];
  const nmLen = 12;

  if (DEBUG) {
    debug('Found global paths...');
    debug(JSON.stringify(globalPaths));
  }

  if (process.platform === 'win32') {
    return function getModulePaths(from) {
      from = Path.resolve(from);

      if (from.charCodeAt(from.length - 1) === 92 &&
          from.charCodeAt(from.length - 2) === 58)
        return [from + 'node_modules'].concat(globalPaths);

      const paths = [];

      let last = from.length;
      let p = 0;

      for (let i = from.length - 1; i >= 0; --i) {
        const code = from.charCodeAt(i);
        if (code === 92 || code === 47 || code === 58) {
          if (p !== nmLen)
            paths.push(from.slice(0, last) + '\\node_modules');
          last = i;
          p = 0;
        } else if (p !== -1) {
          if (nmChars[p] === code)
            p += 1;
          else
            p = -1;
        }
      }

      return paths.concat(globalPaths);
    };
  }

  return function getModulePaths(from) {
    from = Path.resolve(from);

    if (from === '/')
      return ['/node_modules'].concat(globalPaths);

    const paths = [];

    let last = from.length;
    let p = 0;

    for (let i = from.length - 1; i >= 0; --i) {
      const code = from.charCodeAt(i);
      if (code === 47) {
        if (p !== nmLen)
          paths.push(from.slice(0, last) + '/node_modules');
        last = i;
        p = 0;
      } else if (p !== -1) {
        if (nmChars[p] === code)
          p += 1;
        else
          p = -1;
      }
    }

    paths.push('/node_modules');

    return paths.concat(globalPaths);
  };
})();

function stat(filename) {
  let s;

  try {
    s = fs.statSync(filename);
  } catch (e) {
    return e.errno || -1;
  }

  return s.isDirectory() ? 1 : 0;
}

function resolve(name, dirname) {
  if (name.length > 0) {
    if (name[0] === '.' || name[0] === '/') {
      const base = Path.resolve(dirname, name);
      if (stat(base) < 0)
        return null;
      return base;
    }
  }

  const paths = getModulePaths(dirname);

  for (const path of paths) {
    if (stat(path) < 1)
      continue;

    const base = Path.resolve(path, name);

    if (stat(base) < 0)
      continue;

    return base;
  }

  return null;
}

function read(moddir) {
  const filename = Path.resolve(moddir, 'package.json');

  let data;
  try {
    data = fs.readFileSync(filename, 'utf8');
  } catch (e) {
    return -1;
  }

  try {
    return JSON.parse(data);
  } catch (e) {
    return -2;
  }
}

function hasBinding(moddir) {
  const filename = Path.resolve(moddir, 'binding.gyp');

  let stat;
  try {
    stat = fs.lstatSync(filename, 'utf8');
  } catch (e) {
    return false;
  }

  return stat.isFile();
}

/*
 * Expose
 */

exports = verify;
exports.Verifier = Verifier;
exports.verify = verify;
exports.warn = warn;
exports.exit = exit;
exports.stop = stop;

module.exports = exports;
