# Cycles

## Experiments in this repo

The master branch supports cycles by allowing `module(StringLiteral)` in expressions, so cycles work out via that indirection:

```javascript
// in even.js
module.export = function even(n) {
  return n == 0 || module('odd')(n - 1);
}

// in odd.js
module.export = function odd(n) {
  return n != 0 && module('even')(n - 1);
}
```

It also supports modules using the `module.export` to just attach properties to it, so that the default object created for the `module.export` can be held onto by other modules. This is similar support to what is in CommonJS and AMD modules today. The master branch also has information that it could give the user a very specific error and remedies to fix cycles that were a problem.

The [cycles branch](https://github.com/jrburke/module/tree/config) has more experimental cycle support that allows more flexibility:

**Only if a cycle is detected**, just for the module that needs a cycle reference, mark that dependency as a cycle.

When it comes time to evaluate the module body, before doing so, parse the text of the module body and replace variable identifiers that receive a `module('')` value with an expanded `module('')` reference, and then evaluate that code.

If the source of the module body looked like this:

```javascript
var calc = module('calc');

module.export = function(a) {
  return calc(a, 5);
};
```

It is transformed to this:

```javascript
var calc = undefined;

module.export = function(a) {
  return (module('calc'))(a, 5);
};
```

For first level property access:

```javascript
var add = module('calc').add;

module.export = function(a) {
  return add(a, 5);
};
```

Transforms to this:

```javascript
var add = undefined;

module.export = function(a) {
  return (module('calc').add)(a, 5);
};
```

For destructuring assignment:

```javascript
var { prefix, suffix } = module('parts');

var four = function (arg) {
  return 'FOUR called with ' + arg;
};

four.prefix = function () {
  return prefix();
};

four.suffix = function () {
  return suffix();
};

module.export = four;
```

Transforms to this:

```javascript
var { prefix, suffix } = {prefix: undefined, suffix: undefined};

var four = function (arg) {
  return 'FOUR called with ' + arg;
};

four.prefix = function () {
  return (module('parts').prefix)();
};

four.suffix = function () {
  return (module('parts').suffix)();
};

module.export = four;
```

While that works this sort of source rewrite is probably unsavory for a language solution. Some thoughts on other possibilities in the language are below, but they are just sketches and have sharp edges.

## In ECMAScript

This is how I believe `import` in the current ES module draft would work: it is just an indirection token. So for this:

```javascript
import calc from 'calc';

export default function(a) {
  return calc(a, 5);
};
```

Just for this module body, when `calc` is resolved by the JS engine, it really just does the equivalent of `moduleObject.get('calc')` under the covers. This `import` special reference only holds true though within that module body. So, for this example, if calc was a cycle and not actually defined when the export was done, the `myCalc` property would be `undefined` for outside consumers of this module:

```javascript
import calc from 'calc';

export something {
  // myCalc will have the value `undefined`
  myCalc: calc
};
```

So the scope of the problem to solve is how to get this same level of indirection for just the current module body.

### Possibility 1: Smarter identifier tagging

With `import`, the JS engine is tagging the identifier used for that import as special, something that gets a level of indirection for resolving the reference. The `import` syntax makes this easy for the JS engine to find these references.

However, the engine could find the assignments above, it uses the `module(StringLiteral)` form as the marker.

It does take a bit more parsing, since `module(StringLiteral)` is at the end of an expression. It could just handle variable assignments.

What about this form though, at runtime what is done for `module('calc').add`:

```
var add = module('calc').add;
```

**Only if it is a cycle to be broken** the loader can return a Proxy for module('calc') that returns `undefined` for any property access.

This seems weird though because normally, if `add` was not a specially tagged identifier, `add` would have the value of `undefined` if that expression ran normally. If it is a specially tagged identifier though, it it would not really be `undefined`, at least not for the whole life of the module.

Something similar happens with the `import` mutable slot, but with the declarative `import` statement, where it cannot be part of other expressions, may make that seem like a clearer separation.

### Possibility 2: Proxies with a new type

Could proxies for cycle cases instead of the JS engine tracking identifiers that need indirection?

Just for when there is a cycle, use a Proxy for the return value of `module('')`. This gives the proper indirection support if the result is called as a function, or a property is accessed dynamically later:

```javascript
// Suppose both dependencies are cycles to be broken
// and so the local variables are actually referencing
// proxies
var calc = module('calc');
var constrain = module('constrain');

module.export = function(a) {
  // These still work via proxy indirection
  return constrain.toBounds(calc(a, 5), 10);
};
```

The hard one to handle is this form:

```javascript
var add = module('calc').add;
// or
var { add } = module('calc');

module.export = function(a) {
  return add(a, 5);
};
```

So it seems the engine parsing for identifiers that need indirection seems useful for this case.

Perhaps introduce a specialized Proxy type for this. Call it ScopedReferenceProxy. It acts like a Proxy but just has one trap `reference`, and is called whenever a reference to that proxy is done.

If that would even work is just a guess, and it is probably awkward as it would require something like a `ScopeReferenceProxy.returnProxy(possibleProxyIdentifier)` and for APIs between the loader internals and the module body to all know to use that type of method.

## Summary

No cycle support solution avoids all issues with cycles. There are cases where `import` would fail, as the property value assignment example in the background section shows. The goal is to work for most usual use cases, but weighting the solutions appropriate to other design factors and the frequency of dependency relationships that are cycles.

