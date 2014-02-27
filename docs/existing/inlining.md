## Module inlining.

A sketch of module inlining using existing language keyword approach that also support a module-specific `loader` object that holds module-specific data and allows relative ID resolving of any modules fetched locally.

```javascript
module 'id' (loader) {

  // Existing import/export works in here
  import ...
  export ...

  // module specific properties
  var id = loader.module.id;
  var loader = loader.module.url;

  // For dynamically determined modules. Was System.import,
  // but uses module-specific variable. './b' is resolved
  // relative to 'id', the module ID for this module.
  var firstDep = 'a';
  loader.import(firstDep, './b', function(a, b) {

  })
  .catch(function(e){});

  // A local, nested module
  module 'localid' (loader) {

  }

  // using a local module as the default export:
  exportlocal default 'localid';

  // OR
  //using local module as a named export:
  exportlocal something 'localid'
}
```

### Benefits

* Does not require extra HTML script tag variants. If an import happens top level, just throw (with a very specific error message mentioning how to fix, or a link that explains why).

* No need for package URLs to arrive. Package URLs are not a slam dunk either, as I have mentioned in the apparently /dev/null feedback I have sent before.

* Avoids complicating code setup by needing to install custom package formats via Loader API hooks.

* Supports use cases where developer sets up some config and may seed a module value based on an environment detect. In AMD dialect:

```javascript
// set up basic config
requirejs.config({});

// If new platform feature is available, just use that, otherwise rely on
// loading a polyfill for it
if (typeof newPlatformFeature !== undefined) {
  define('newPlatformFeature', function() {
    return newPlatformFeature;
  });
}
// start up the app
require(['app/main']);
```

* Supports use cases where this sort of setup also needs to happen in multiple JS envs. This has been a surprising, but welcome, use case in requirejs: people want to use the same setup (config block, any inline module setup, then load) in both browser and node.

* Supports use cases today where someone wants to use modules internally to create a library but ship one file for that library. Saying "package managers will fix this" is creating yet another dependency on an amorphous group for that to get settled. And frankly this front has been very disappointing. So I would not expect the desire for single file libraries built from aggregate modules to go away any time soon.

### Issues

It is unclear how to insert a module into a loader instance. An illustration, using an AMD example that sets up a mock module in a testRequire loader instance:

```javascript
var testRequire = requirejs.config({
  // context arg creates separate loader instance
  context: 'test1'
});

// Mock the dataSource module locally.
define('dataSource', function() {
  return {};
});

// in AMD, only one global define, so it just collects
// define calls and gives them to the first loader that
// does a require() call. In this case, testRequire.
testRequire(['test']);
```

For the language keyword-based module design, this may be difficult to do: the language parts for declaring a module may not mix well with a runtime loader object?

However, with an API-based `module` design in this repo, it would just be
`testLoader.define('dataSource', function(module) {})`.

But to try to bridge that gap, give some way to specify the loader target for
the module definition:

```javascript
var testLoader = new ModuleLoader({});

module 'dataSource' in testLoader (loader) {

}
```

#### Summary

My impression was that it was too hard to get that sorted with the current language keyword approach, so I thought an API approach instead of language keywords would have avoided those issues.

Maybe not though? In either case, a system with inline modules is simpler than one without inline modules. That seems worth taking more time to work out inlining and more time effective instead of needing multiple other standards groups to fill in the gaps to get the whole story sorted.

