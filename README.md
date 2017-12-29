# pkg-verify

Node.js module which will recursively walk your package.json at runtime,
verifying that all required dependencies satisfy their semver versions.

## Usage

``` js
// Must pass your current `__dirname` as
// well as the relative path to the root
// directory of your module (where the
// package.json resides).

// Throws on unsatisfied dependency.
require('pkg-verify')(__dirname, '../');

// Throws on unsatisfied dependency.
require('pkg-verify').verify(__dirname, '../');

// Warns on unsatisfied dependency.
require('pkg-verify').warn(__dirname, '../');

// Exits with an error code of 1 on unsatisfied dependency.
require('pkg-verify').exit(__dirname, '../');
```

## Contribution and License Agreement

If you contribute code to this project, you are implicitly allowing your code
to be distributed under the MIT license. You are also implicitly verifying that
all code is your original work. `</legalese>`

## License

- Copyright (c) 2017, Christopher Jeffrey (MIT License).

See LICENSE for more info.
