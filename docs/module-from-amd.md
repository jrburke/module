# module from an AMD module perspective

See the [examples](https://github.com/jrburke/module/blob/master/docs/examples.md), but main difference is that you no longer need to use a `define()` wrapper in the source of a module in individual files.

Some translations:

`require(StringLiteral)` --> `module(StringLiteral)`

`require(['a', 'b'], function(a, b){})` --> `module.use('a', 'b', function(a, b) {})`. And the return value of `module.use` is a Promise.

Instead of using `return` to set the module export, use `module.export` instead. This is an unfortunate grammar restriction in the language. `return` would have been preferred, but JavaScript does not allow a top level return like this:

```javascript
var a = module('a');
return function speak() {};
```

even though in the loader it is wrapped in a function call. Too many linters and editors would also complain about this syntax.

So `module.export` is used instead. If you were using the [CommonJS sugar](http://requirejs.org/docs/whyamd.html#sugar) for module definitions, then you may be used to using `module.exports = function(){}` already.

Multiple module loader instances can be created via `new module.top.Loader({})`, so easy to set up isolated tests for example.

There are no ["special" module dependencies](https://github.com/jrburke/requirejs/wiki/Differences-between-the-simplified-CommonJS-wrapper-and-standard-AMD-define#wiki-magic).