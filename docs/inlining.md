# The case for module inlining

What is module inlining? It is the ability to place more than one module in a file, or to define a module as part of script that may not be modular. Examples

**More than one  module in a file**

For distributing a piece of functionality that was original a set of smaller,
private modules for use by others as just a single module with a specific
public API

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

module.exportDefine(function(module) {
  var effects = module('effects');
  var $ = module('jquery');
  module.export = function applyEffectsToDom(selector) {
    return effects.colorize(effects.blur($(selector)[0]));
  };
});
```

**Defining a module in a non-modular script**

The usual use case for this is to set up tests or a top level module to be
used by the rest of the app, after setting up a baseline config.

```javascript
module.top.config({});

module.define('jquery', function(module) {
  // If jQuery already exists in the page, use that, otherwise
  // fall back to querySelectorAll for basic querying.
  var query = function(selector) {
    return document.querySelector(selector);
  };

  if (typeof jQuery === 'function') {
    query = jQuery;
  }

  module.export = query;
});

// Now start loading the app
module.top.use('app');
```

## Arguments against it

A few arguments are suggested for not considering this sort of behavior in a module system:

### SPDY/HTTP2

Inlining is seen as a way to get bundling. However, with SPDY/HTTP2, it gives the same effect as bundling, and allows individual assets to be cached. The separate cache entries are useful when the total set of modules is not known up front, and changes as the user navigates to different pages on the site.

There are definitely types of web apps/sites that will benefit from SPDY/HTTP2, but they will need specialized server setups. Besides just baseline support, the SPDY/HTTP2 pipeline will need specialized adapters to know how to trace module dependencies so that it can push the nested dependencies to the client.

For use cases that want to flexibility in deployment, and the cheapest hosting options, bundling will still give the easiest, most straightforward way to improve performance related to reduced HTTP requests. It can even be done offline, as part of initial deployment, so that the server just needs to be a simple file server.

There are also deployments that do not use a server at all, like local app installs on mobile devices that work offline. Those use cases are still under file IO speed constraints. For FirefoxOS, the device IO profile still benefitted from module bundling because multiple local file reads are still slower than one file read with inlined modules.

The push mechanism of SPDY/HTTP2 just seeds cache entries in the browser, it will still result in multiple file reads. For some use cases (dynamic site entry points that need different sets of overlapping module cross-sections), the SPDY/HTTP2 may still be beneficial. However, for other types, a single page web app that wants async JS logic to complete as fast as possible to choose a UI path, bundling will still be more effective.

### Archive URLs

What about  archive URLs? A bundle format, like zip (although likely different from it), that allows grouping more than just text files. Images and other binary assets can be bundled.

This pathway is still very speculative and under development. It is also unclear how an app avoids needing to either rewrite or reroute URL references it might have in source form to the archive form.

There will be overhead in the format for things like headers and content types. For mobile device IO, where memory and processing is more at a premium, reading in a plain JS file with the module definitions will likely have lower overhead.

The same caveats about SPDY/HTTP2 just seeding a local file cache still apply here. For many offline-capable single page web apps, the goal is to load the JS logic for doing async DB/state detection up front before choosing what UI to show. This means the app will want that JS logic loading to be as fast as possible.

Furthermore, archive URLs are still very speculative, still needs more time to get specified and built. In the meantime, bundling JS based on module ID boundaries is a well known practice today.

### People inline awful things like image data

Lots of things are inlined in regular functions and variables. The existence of data URLs. They show up in CSS too. This is not a criticism of inlined modules specifically, but how the style of optimized delivery the person prefers. Plus, note in the section below that there are very legitimate reasons for transpiling other text formats into units of JS code.

## Arguments for it

The arguments against are more around inlining used for performance bundling. This section addresses arguments not related to performance bundling.

### Nested code unit referencing, like function

Modules are a way to reuse units of code. They can be loaded dynamically, and can be provided by others, allowing easier reuse of those code units.

Functions are also reusable units of code. Just as nested functions are possible, to limit visibility of that reuse, modules should be limited in visibility.

A great example of this is how Node installs dependencies in nested node_modules directories, and how Browserify combines those modules into a package. If nested modules were available, the browserified file would match the same type of scoping as reflected in the nested node_modules file layout.

As it works now, Browserify needs to keep a registry of "if this module asks for "a", give it the module in this slot". Same situation for AMD module use case (but expressed in [map config](https://github.com/amdjs/amdjs-api/blob/master/CommonConfig.md#map-).

The trouble is that these registry/config setups are hard to bundle up together, and to do multiple layers of them.

The suggestion may be "only layer at the final app layer, not at library levels in between". Some people just like to distribute one JS file for a library though, for easier consumption. It also assumes a lot on what kind of package manager (if any) is used. The JS community is just not that unified on those topics.

### Transpiling

It is very common in AMD projects to use a templating system for segments of HTML. These normally load an HTML or HTML with a DSL, and then either converting that to a JS string or into a function to be used in JavaScript.

However, for deployment reasons, doing these transforms on the fly can be avoided, and the generated JS string or function can just be inlined in the built, optimized output.

Inlining module values for these transpiled forms is a very common practice for AMD projects, and is not met by SPDY/HTTP2 or Archive URLs.

### Non-module script setup

As mentioned in the [story time section about inline modules](https://github.com/jrburke/module/blob/master/docs/story-time.md#inline-modules), sometimes a module may want to be inlined right after setting up the loader config, based on environment detects or a test scenario. While a `module.set('moduleId', moduleValue)` might help simple cases, by allowing an inline form of a full module body, it means those module bodies can have dependencies too.

## Summary

Inlining makes a logic sense as scoped code unit reuse. To help understand this point, view module IDs as addresses to code units instead of addresses to file paths.

Inlining also makes sense for performance. The suggested alternatives are just focused on local cache setup, but still suffer from local IO that can be slow for multiple file reads, and does not fully address the benefits of transpiling.
