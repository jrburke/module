# module from an ECMAScript perspective

This project reuses a lot of thinking that has gone into the ECMAScript 6 modules effort so far, but suggests these changes:

* [Parse for module instead of import/export](parse-for-module-instead-of-importexport)
* [Each module body gets its own unique module object](each-module-body-gets-its-own-unique-module-object)
* [Use function wrapping for module scope](use-function-wrapping-for-module-scope)

They are motivated by the following reasons:

* [import syntax disparity with System.import](#import-syntax-disparity-with-systemimport)
* [Solves the moduleMeta problem](#solves-the-modulemeta-problem)
* [Solves nested modules and allows inlining](#solves-nested-modules-and-allows-inlining)
* [Easy for base libraries to opt in to ES modules](#easy-for-base-libraries-to-opt-in-to-es-modules)

It has these tradeoffs:

* [Cycle support](#cycle-support)
* [Export name checking](#export-name-checking)

## Changes

### Parse for module instead of import/export

To find dependencies, parse for `module(StringLiteral)` instead of `import` syntax. Fetch and execute the dependencies first before the current module body, as `import` would do.

Instead of `export` syntax, `module.export = ` is used to assign a default export, and `module.export.something = {}` is used if an export object created by the loader is desired for reuse, and that type of property assignment is preferred by the module author.

End result is no longer needing new syntax to express module relationships, but the module API is used instead.

### Each module body gets its own unique module object

Each module body will get its own unique `module` object to use at runtime for these reasons:

* So that relative module ID references work at runtime. This is important for `module.use()`.
* Getting "moduleMeta" module metadata, like the ID of the module, the URL and the directory. This are used regularly by modules. For Node code, `__dirname` and `__filename` are examples of this kind of data, and in AMD code, `module.id` is useful for setting up prefixes for DOM elements, names of custom elements, items that end up in the global space.

During runtime execution of the module body, `module(StringLiteral)` behaves similar to `System.get`. However there is no more `System`, each unique `module` object handles the equivalent API, and there is a top `module` object.

### Use function wrapping for module scope

In source form for a module that is in a file, no function wrapping is used. This is a valid module body for an individual module loaded by the loader:

```javascript
// in a.js, referenced via module ID 'a'
module.export = {
  color: 'blue',
  b: module('b')
};
```

The loader wraps that body before executing in a function wrapper like so:

```javascript
// This is what the module loader executes internally.
// The `module` in `module.define` is the loader that owns
// this module, the `module` passed in to the define factory
// function is the unique module object for module 'a'
module.define('a', function(module) {
  // Up for discussion, but if it is desired that the loader is by
  // default strict, add a 'use strict':
  'use strict';
  module.export = {
    color: 'blue',
    b: module('b')
  };
});
```

This gives the module its own scope, but then also specifies a way to inline modules now. This is useful for some module bootstrapping situations, like tests, and for use in bundling.

It also makes sense conceptually: module definitions can be nested now just like function definitions can be inlined. This has now a real world case: some libraries are now bundles of AMD or browserified modules internally, but provide an aggregated single module view to modules consuming that file.

The nested definitions are discussed more in the [Story Time document](https://github.com/jrburke/module/blob/master/docs/story-time.md).

## Reasons

These changes are done for the following reasons:

### import syntax disparity with System.import

The `import` syntax does not match well with the `System.import` syntax.

```javascript
import defaultExport from 'a';
import { propExport from 'a' };

System.import('a', function(m) {
  // The user has to use `m.default` to get to the default export.
});
```

The main issue is reserving a special spot for the default case. It makes the assumption that `default` is just one of many other possible exports, just one you do not have to give a unique name.

However, as export setting has been used in CommonJS and AMD modules, it just mean "this is all I ever want to export", and usually the construction of just that one export is more easily done via something like an object literal syntax than having to break out each object literal than expanding it out to `export name value` syntax. That, or it is just one function, like a constructor function.

`import` and `System.import` are imbalanced. The suggestion of this form highlights this imbalance even more:

```javascript
import "a";
// `this` in this example is the "moduleMeta" object
let a = this.get('a');
a.propExport();
```

### Solves the moduleMeta problem

The existing ES6 module draft has been missing this for a while. Trying to use `this` for that object is risky. It is too easily affected by internal scope changes in a module body. A named variable that has a unique value for each module is better, and it has already been used in practice for CommonJS and AMD modules, so the concept has some fairly extensive field testing.

By formalizing the internal function wrapping that is done, it also makes it clear from an execution standpoint how that module object comes into being.

As to the choice of `module` and concerns about conflicts with other code: the `module` API has been chosen to avoid conflicts with that definition in CommonJS and AMD as far as module relationship APIs, so as far as a library trying to capability detect for a module system, it should work out.

For the rare script that has a conflict in meaning, the Loader API can have a configuration option to skip module wrapping in that case and evaluate that script as a global.

Since each `module`-based module gets its own function wrapping, even if that script clobbers some global definition, the individual modules still work and are loaded correctly in the module loader, since they have their own function wrapping and are scoped to see the loader.

QUnit was given as an example of a problematic script. However, QUnit does not work if async loaded, so likely will need to be a plain blocking script tag, and it also provides is `module` API at `QUnit.module`. Modules are free to still use `module` even when QUnit is already loaded. There is an example in test/demo/qunit.

### Solves nested modules and allows inlining

Nested inlining of modules has not been solved for the current ES6 module draft. It is a bit silly it is not allowed -- modules are really just async-resolved code unit reuse, so similar to functions. Functions can be inlined, modules should be too.

More details on how that can work is in the [Story Time document](https://github.com/jrburke/module/blob/master/docs/story-time.md).

This also means effective optimization of modules does not need to have dependencies on other speculative specs like archive URLs and will slipstream more easily into existing module use cases.

### Easy for base libraries to opt in to ES modules

This is one of the biggest benefits to this API approach. Base libraries (examples: jQuery, underscore, Backbone), can opt into supporting ES6 modules without needing two separate versions of their library. Two separate files complicates their release, distribution and consumption patterns, just creates more confusion.

I believe the existing solution for ES6 modules is to suggest a smart loader bootstrap script which can either provide an AMD/CommonJS API, or do other loader tricks.

However, developers will prefer to the libraries to be ES6 ready as a baseline and will open bug reports/issues for the base libraries. This happened with libraries and the AMD/CommonJS wave of module APIs.

The API approach allows the base libraries to opt in, and it also gives ES6 modules a great vote of confidence, "all these libraries are ES6 ready, no special work needed".

## Tradeoffs

Every design has tradeoffs. For the `module` design:

### Cycle support

The `import` syntax allowed for a very special, module body-local indirection of identifiers associated with an import. There are still cases where that fails for a cycle, but it is better support than what is currently in the master branch for this project.

It would be good to see more language thinking around how some sort of indirection approach could still be adapted for `module`. The [Cycles document](https://github.com/jrburke/module/blob/master/docs/cycles.md) goes into some speculation about that.

However, even if it does not work out, cycles are a minority use case module relationship. The above benefits outweigh the cost of this tradeoff. Plus, the loader has targeted information about a cycle case, and if it is a problem, give specific advice on how to fix.

Since `module()` can be used in expressions, the solution is often to just use that form directly in the expressions that need the module reference. See the Cycles document for more information.

### Export name checking

With statically identifiable `import` and `export` use, the names of export properties can be checked with their `import` references.

This is a very small benefit, and is even less useful with default exports, which will be a common module pattern. Linters and editors can still provide some of these benefits by looking at common code patterns.

It is also a very shallow benefit, and does not allow checking of second order poperties, like constructor function prototype methods. Again, linters and editors are likely to provide more value there.
