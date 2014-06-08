# Relation to ECMAScript 6 efforts

It builds on the the ModuleLoader API from the current ES proposal, along with
some other work from the ES module effort so far, but uses a module API instead
of new syntax, in an effort to reduce the amount of effort and learning it will
take for people to implement and use the current ES module proposal.

It uses `module` as the API space, because it allows for specifying dependencies
by using a declarative sounding name, and all IDs lookups are based on the
module name-to-path semantics. `System` as an API space can be seen as too vague
of a name. For example, it could indicate the browser or operating system API.

However, much of the mechanics of `module` is based on the current design
thoughts around the ModuleLoader parts of the spec drafts.

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
