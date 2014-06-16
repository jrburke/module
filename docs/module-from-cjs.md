# module from a CommonJS module perspective

If you are used to CommonJS or Node modules, then the top level syntax for `module` should feel familiar. However, this an important semantic difference:

Module dependencies are fetched and executed before the current module body. Module fetching and execution is not delayed until the `require()` is hit.

Most modules should not notice a difference as long as they were using the `require(StringLiteral)` form of dependency references at the top of their module bodies. However, there are some cycle cases, and cases that use `require(someExpression)` that will notice the difference.

These are generally solvable by some code adjustments if translating code to the new form.

For this sort of code:

```javascript
var id = 'speak';
if (someCondition) {
  id = 'speak2';

var speak = require(id);
speak('hello');
```

That would fail if a mechanically replaced `require` --> `module` was done, since module fetching is async. Instead, it would need to look like this:

```javascript
var id = 'speak';
if (someCondition) {
  id = 'speak2';

module.use(id, function(speak) {
  // This function is async called
  speak('hello');
});
```

If you like Browserify, you should welcome this change as it will allow more modules to work with that sort of bundling system, if they were converted to this new `module` syntax.

Only one reserved variable name is needed now, `module`. How this maps to the reserved variabled in CommonJS/Node systems:

`require(StringLiteral)` --> `module(StringLiteral)`

`exports.propName` --> `module.export.propName`

`module.id` --> `module.id`

`__filename` --> `module.uri` (name TBD, but can easily be made available)

`__dirname` --> `module.dir` (name TBD, but can easily be made available)


There is a stronger separation of module ID to module paths/URLs. This is due to how module IDs are separate entities and record IDs internal to the loader. So something like `require('some/local.js')` may need to be replaced with `module('some/local')`.

It will still be possible to support Node's nested node_modules traversal with the loader hooks, and old modules can still use Node's old system. More work needs to be done to prove this out, but that should be achievable.

However, there may be a restriction that while `module` modules can consume old Node `require`-based modules, those old modules may not be able to depend on `module`-based modules. This is due to the async loader pipeline in `module`, so if the `require`-based module does a dynamic `require(varName)` for a `module`-based module, that may not work. Statically declared `require(StringLiteral)` may work out though. A similar restriction is in place for browserify use cases, so this is not an unheard of issue in the Node world. More investigation needed though. At a minimum though, new code could reuse existing node packages that all had legacy module dependencies.

[Nested inline module definitions](https://github.com/jrburke/module/blob/master/docs/api.md#multiple-local-modules) are allowed. This will allow browserified nested node_modules to work well without Browserify needing to deliver a module resolver.
