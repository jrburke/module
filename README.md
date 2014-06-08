# module

This is an experiment around ECMAScript (ES) modules. Not going to go anywhere,
just an experiment.

For a discussion of module inlining in the context of the existing ES
syntax, instead of this experiment, see [existing/inlining](https://github.com/jrburke/module/blob/master/docs/existing/inlining.md).

It builds on the the ModuleLoader API from the current ES proposal, along with
some other work from the ES module effort so far, but uses a module API instead
of new syntax, in an effort to reduce the amount of effort and learning it will
take for people to implement and use the current ES module proposal.

It uses `module` as the API space, because it allows for specifying dependencies
by using a declarative sounding name, and all IDs lookups are based on the
module name-to-path semantics. `System` as an API space can be seen as too vague
of a name. For example, it could indicate the browser or operating system API.

However, much of the mechanics of `module` is based on the current design
thoughts around `System` and the ModuleLoader API, so the name change is really
surface syntax, and could easily be changed based on feedback.

## ES module work reused

* The ModuleLoader API and hooks.
* The concept of a "mutable slot" that is used for module export values.

## Differences from current ES module effort

No import/export language syntax. APIs are used instead.

It seems the primary goal for the import/export syntax was to compile/link time
capabilities around export name checks and to allow other compile/link time
features later.

However, this new syntax has nontrivial cost:

* It leads to also needing changes to HTML to support this work. This increases
the learning curve for HTML and JS use with it. Needing to couple the ES and
HTML changes together is a sign of a more complicated design.
* It is hard to support a REPL or jsbin-style "just type JS" with the syntax
forms.
* There are complications around default export and named export, and how that
looks like to `System.import`: for example, it would be ugly if a user had to
reference a `.default` property in the import success callback, where in the
import syntax form it is not necessary.
* The syntax leads to harder expectations around lexical modules. This is hard
to reconcile with the dynamic parts of ES module loading.
* There is a need for
[a per-module `System` construct](https://github.com/jorendorff/js-loaders/issues/89#issuecomment-31975797),
to make sure modules loaded via `System.import` are stored in the correct module
loader instance. Plus, the practical usefulness, as demonstrated in AMD, of a
module being able to know its module name and address (`module.id` and
`module.uri` in AMD, originally specified in CommonJS modules).
* Because of the uncertainty around lexical modules, the bundling API is not
optimal: passing JS strings to `System.define` looks ugly, and causes
practical complications around concatenation and minification steps used in
code today.

On the proposed benefits:

**Export name checking is a very shallow benefit**

It is expected that once modules are available in the language, the use of
default exports, and splitting modules into fine grained, single export modules
will be very common. This will be done for practical concerns:

* It is easier to reason about the code while developing it.
* For browser bundling, it creates very clear, easy boundaries to make it easy
to exclude code from a collection of modules to the amount that is actually
used. "Advanced" minifiers like closure compiler are difficult to use to
get the same benefit.

Plus, the export checking will not help with any secondary level property
references. For example, if the default export is a constructor function, none
of the prototype properties can be checked.

On an `import *` or export `* capability`, these have not been needed in
CommonJS/Node/AMD systems to build large codebases.

It is not to say these capabilities are not useful. Their benefits though are
viewed as not justifying the other costs.

If these capabilities are really desired, code editors can provide shortcuts to
do the equivalent of inserting code to match import/export *, and code editors
or linters can help with the property checking. They can do a deeper check too.

**Adding other compile time features later are still possible**

This is just a sketch, using the experimental sweet.js macro work as an example.
The API syntax shown is just used as illustration, not real, just something to
help when describing the semantics.

The main idea is to rely on
[a reader](https://github.com/mozilla/sweet.js/wiki/design#wiki-reading)
for JS to pull out sections from a function that need to wait for final
compilation until later, and then in the place of that token stream, use a
function placeholder that has the reader tokens attached to it, and that
function is not fully compiled until later when any dependency compile time
forms are known.

Example:

```javascript
/***** module 'a' ******/
// get dependencies
var c = module('c');

// create exportable macro
module.exportMacro('unless', {/* macro definition here*/});

// export module value that is used at runtime.
module.export = {
  name: 'a'
};

/***** module 'b' ******/
// b wants to use a macro from 'a'
module.useMacro('a', 'unless');

// export module value for b
module.export = function b(x) {
  return true unless x > 42;
  return false;
};
```

The reader parses 'a' and sees the module APIs in play, and
`module.exportMacro`. It pulls out the token section for
`module.exportMacro`, and since module bodies in the `module` approach are just
functions, it annotates the function with the pieces of information:

* module dependencies referenced.
* set of macros found.

The module system can then use this annotated function for the "factory
function" used for module 'a'.

When 'b' is parsed by the reader, it notices the `module.exportMacro` reference,
so it does not let the function continue to the grammar parsing stage, and
instead, creates a function placeholder, perhaps with a new type, call it a
PartialParsedFunction.

A PartialParsedFunction can be thought of a function that if called before
final parsing has been done has a definition something like this:

```javascript
function() {
  throw new Error('function is not fully parsed');
}
```

That PartialParsedFunction is annotated with these
pieces of information:

* module dependencies referenced.
* list of macros needed.
* reader tokens waiting for final compile forms to be available.

The module loader runs a's factory function to create the runtime exports for
a. Now that it is complete, the module loader comes to b's factory function.

Since that factory function is a PartialParsedFunction, it grabs 'unless' from
'a', then completes the final parsing of the function, and uses that function
in place of the PartialParsedFunction, and then executes that function.

## ES spec changes

`module` relies on the following ES spec changes to work:

* Defining the ModuleLoader API (similar amounts of work as existing proposal).
* Uses parsing for a module API use instead of new language tokens.
* Uses the mutable slot from existing proposal, and expands on it.

And later, when compile-time forms, like macros, might be used, a reader
concept and something like the PartialParsedFunction described above. However,
those do not need to be specified now. Hopefully enough has been illustrated to
show that they could be supported later through without needing to cause
backward-incompatible changes to the module APIs.

So for ES6, the new language work is primarily around the mutable slots. Work
for it was already required for ES6, but the `module` proposal extends it.

But it is important to note that no new HTML changes are needed, just work in
JavaScript.

### mutable slots

The current ES proposal relies on a "mutable slot" concept for exports. This
allows circular dependencies to work well. That concept is reused for `module`,
and expanded a bit, to first level properties in the module export value.

How I have viewed the mutable slot, in terms of the existing ES module proposal.
Suppose a module imports paint from a brush module.

```javascript
import paint from 'brush';

// some time later
paint();
```

What I envision happens in the engine when `paint` is referenced: it results in
a call similar to `(System.get('brush').paint)`.

So mutable exports for the existing ES module proposal could be polyfilled today
by using an AST parser, like Esprima, to replace all uses of `paint` with
`(System.get('brush').paint)`, then evaluate the code.

A mutable export reference can be seen somewhat analagous to a getter.

For this `module` proposal, this is same mechanism would be used, except using
a module API with destructuring:

```javascript
var { paint } = module('brush');

// some time later
paint();
```

In a polyfill, this would work by replacing the `paint` reference in the AST
with `(module('brush').paint)`, and rewriting the destructure to just be
`module('brush')`.

If it was hard to specify this mutable slot in this way, it could be delayed
until a later ES version: cycles happen but they are rare, and the module system
could instead give very informative, targeted error messages on how to fix the
cycle for now.

Since the module API allows placement of `module(StringLiteral)` anywhere in the
module body (they are still found by static analysis and loaded/executed before
current module body is executed), there are easy ways to solve cycles in the
meantime by the user choosing to do the `module('brush')` substitutions
themselves.

## `module` API description

The `module` API was chosen such that the API names have a declarative feel, to
indicate these are used for static, declarative tracing of dependencies.

Since an API is used it allows the equivalent of import expressions. This has
been useful in AMD and node code to reduce the amount of code needed to use a
dependency.

However, since the API has a declarative feel to it, it will help set
expectations that all dependencies are fetched and executed, and expression
evaluation does not affect that fetching and execution.

### import and export

The module system parses the text of a module for module API use, then loads and
executes dependencies before executing the module.

Dependencies are specified by using `module(StringLiteral)`. A module sets the
export using `module.export = value`, where `value` is the export value.
It must be set before the end of the module body execution.

Alternatively, module.export is originally set to an empty object, which can
be used to attach properties for the export value,
`module.export.route = function() {}`.

```javascript
// A module that depends on two other modules
var { paint } = module('brush');
var pixelate = module('pixelate');

var someData = {};

pixelate(someData);

module.export = {
  paint: paint,
  pixelate: pixelate
};
```

### Multiple, local modules

Multiple modules can be inlined in a file by using `module.define`, where
the module body is stored in a function.

```javascript
module.define('colorize', function(module) {
  module.export = function colorize() {};
});

module.define('blur', function(module) {
  module.export = function blur() {};
});

module.define('effects', function(module) {
  module.export = {
    colorize: module('colorize'),
    blur: module('blur')
  };
});
```

For files that contain one module, `module.define` is not used, but the loader
can conceptually treat this as executing a `module.define` with the contents
of the file as the body of the factory function passed to `module.define`.

Each module gets its own instance of `module` that is customized to that
module.

`module.define` modules can be nested, and the nested modules are only visible
to each other on the same level, and to the module containing them.

However, given the async resolution of dependencies (even local modules could
need dynamically loaded dependencies), `module(StringLiteral)` in the same
module cannot be used to grab a local module and use it in its export.

Instead, there should be a local module that does a `module.define()` to set up
the desired export, and `module.exportFromLocal()` should be used to
specify the factory function that will give the final module value.

```javascript
module.define('colorize', function(module) {
  module.export = function colorize() {};
});

module.define('blur', function(module) {
  module(function blur() {});
});

module.define('effects', function(module) {
  module.export = {
    colorize: module('colorize'),
    blur: module('blur')
  };
});

// THE FOLLOWING COMMENTED OUT CODE WOULD FAIL because
// 'effects' may not be available yet, and 'effects' is
// only fully resolved once it is part of an active
// dependency tree.
// var effects = module('effects');
// var $ = module('jquery');

// THIS WILL WORK, since the factory function can be called once
// all dependencies are met.
// and then use `module.exportFromLocal()` to use that module value as
// the export value.
module.exportFromLocal(function(module) {
  var effects = module('effects');
  var $ = module('jquery');
  module.export = function applyEffectsToDom(selector) {
    return effects.colorize(effects.blur($(selector)[0]));
  };
});
```

If a module does not need a local module for immediate module export, then
`module.exportFromLocal` does not need to be used.

Additionally, if this is not a module body, but just a script in an HTML script
tag, `module.use()` can be used to get access to these local modules.

When a module is not present at the immediate module's loader level, it is
searched for up the chain of nested module loader instances. If it is not
available in any of the parents, the topmost loader will dynamically load it.

### `module.use`

`module.use()` allows dynamically using any modules that may or may not be
loaded. This will most commonly be used in web pages to start module loading,
but could also be used inside a module for dependencies that are only known
at runtime.

It takes a list of modules and a callback function. It returns a Promise.
The success promise value is an array of module exports, but the callback
function receives them as individual callback arguments. The promise returned
will hold any error generated by the callback function, if one is generated.

```javascript
module.use('a', 'b', function(a, b) {
})
.catch(function(error) {
});

```

## Concerns about existing `module` use in JS

While `module` is used today, notably in CommonJS/Node and AMD
module systems, that object is a second-tier object, and it appears as an
object and not a function. Script detection for those module systems usually
use `require`, `exports` and `define` for choosing what module system to invoke.

So it should be possible to use `module` without too much trouble. However,
a configuration option on the `module` loader could be provided to instruct the
loader to not provide a wrapping for its `module` object if a script was wanting
to use `module` in a different fashion.

In summary, the benefits of an API approach and the terse, declarative feel of
using `module('id')` are larger benefits than trying to avoid `module`.

## Library construction

The important implementation part is in **parts/m.js**. **parts/build.js**
builds **module.js** which can run in a modern browser. Latest versions of
Firefox, Chrome, Safari have all been tried and work.

Tests are run by opening **test/index.html** in a modern web browser.

On the implementation, it is just meant for illustration, to prove out the
concepts via tests, and not considered production worthy. Most notably, it just
uses a underscore-prefixed convention to indicate private properties. This is
just done for ease of implementation and introspection while debugging. However,
a real implementation would do fancier things to hide those details.

[esprima](http://esprima.org/) is used to parse the module text, so the JS
support in this implementation is limited to the support provided by esprima. I
would like to switch to using the sweetjs reader in the future, as it would
allow more flexibility in the level of JS support.

[prim](https://github.com/requirejs/prim) is used for promise support. It passes
the a+ promises 2.0.3 tests.

## Scratchpad

This section is just a collection of notes/todos, just for repo developer use.

Tests to write:

* return a promise for a module value, make sure that works, promise unwrapping not in the way.
* return a promise for a exportFromLocal case too, promise unwrapping not in the way.
* test that uses local modules top level and module.use().
* test interop with normal scripts that do globals.

Notes

* I prefer `return` to set module export, instead of module.export, as it more correctly enforces "end of factory function means export is considered set" but right now JS grammar does not consider a top level `return` as valid.

TODOS:

* exportLocal to exportFormLocal

* fix cycle test

* declarative config easier for tools to read, for autocomplete. add in loader.config() for top level module objects only, using AMD-inspired config as baseline. Accessible via module.top.config();

* Error APIs giving URLs to descriptions of how to fix. Use first for cycles.

* loader.introspect(function(on) {
  on('defined', function(module) {});
});

* new module.Loader({
  constrain: true,

  whitelist: {
    top: true,
    config: true,
  }
});


* create new module.Loader(), ability to reuse config from another loader. Also, be able to reuse module table? No, explicit population can be done by iterating and adding what is needed. Need iteration and event (when added) apis, security mode.

* specify module.uri for nested module, plus relative module IDs,
for it.

* one API entry point, `module`, always context-specific, allows nesting.

* Wire up waitInterval timeouts. Call reject on specific modules. Allow for a reset/remapping via paths array config in requirejs? Does the DepResolver now help with that indirection?

* Hmm, will AMD-style loader plugins really work with existing ModuleLoader API? AMD plugin load() method right now allows fetching some dependencies to finish loading of the resource. These can get associated with the load for that resource, to allow cycle breaking, in AMD systems. Does that hold together here?

* Store exportFromLocal factory in a special slot instead of using a special name.

* Generate useful errors with codes that can be looked up for fix advice.

* a "debug" mode that allows printing out dependency tree as a data structure?

* How best to do load cleanups. Given async nature, and code could grab a reference to a load in the middle of something like the pipeline that survives across async calls, need to cautious about cleaning up. Maybe it is enough to do it once all module loading has been known to complete for the current cycle, since the module cache would be warm by then.
