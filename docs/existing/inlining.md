## Module inlining

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
  exportlocal something 'localid';
}
```

Local modules are only seen in the module-specific loader, and if a module is asked for in that set, parent loaders are asked for it, and if none have it, the top-most loader does the load for that module.

### Benefits

* Does not require extra HTML script tag variants. If an import happens top level, just throw (with a very specific error message mentioning how to fix, or a link that explains why).

* No need for package URLs to arrive. Package URLs are not a full solution anyway, as I have mentioned in the apparently /dev/null feedback I sent before, but trying to keep this shorter so will not repeat.

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

* Supports use cases where this sort of setup also needs to happen in multiple JS envs. In requirejs land, some people use the same setup (config block, any inline module setup, then load) in both browser and node.

* Supports use cases today where someone wants to use modules internally to create a library but ship one file for that library. Saying "package managers will fix this" is creating yet another dependency on an amorphous group for that to get settled. And frankly this front has been very disappointing so far. So I would not expect the desire for single file libraries built from aggregate modules to go away any time soon.

### Issues

It is unclear how to insert an inlined module into a specific loader instance. An illustration, using an AMD example that sets up a mock module in a testRequire loader instance:

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
// define calls and gives them to the first loader
// instance that does a require() call. In this case,
// that would be testRequire.
testRequire(['test']);
```

Maybe something like:

```javascript
var testLoader = new ModuleLoader({});

module 'dataSource' in testLoader (loader) {

}
```
