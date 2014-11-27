# Loader construction

## How should the internals of the loader be constructed? Some constraints:

* Want overriding of loader hooks, like normalize, locate and such, to be done
after initial creation, and to have that cascade to nested `module` instances.
* Need to hide much of the implementation from the `module` instance. Could use Symbols long term, but for now, use a `_private` type of property names to store private stuff, to make debugging and tracing easier.
* While want the details to be private, the public loader hooks normally need to access private information. Best for them to delegate to private methods on the private loader, with same names.
* At same time, the private APIs need to dynamically call the Loader.prototype methods to really allow for point 1.
* It is desirable for the APIs for `normalize` and `locate` to be different from the loader hook APIs:
    * Those APIs just want to pass a single string.
    * Ideally return synchronously (can throw if answer not known synchronously). They are used to set up pointers for assets via module IDs, or for creating DOM node names or classes. Requiring them to be async really complicates their use.
    * For `locate`, likely will be common that the ID needs to be normalized first.

## Lifecycle overrides, should they be applied to internal, nested module resolution:

Should lifecycle normalize occur for an inlined "e" if exportDefine asks for "e"?

In that case the author of bundle expects that "e" to satisfy. However, the loader lifecycle provider wants to know about all loader lifecycle calls. That provider should win. They are given enough info to know to not change the value, via refererName. It does require in-depth knowledge of nested modules if wanting to not handle them, but that is fine, that is what loader hooks are for, hooks into

* Should normalize inside nested modules really go to the top? Seems like the point of the scope thing is to allow local definitions to override. So, look up the nested loader chain for the module. If not found, then go to top logic.

* entry objects have a lot of data on them now, restrict for lifecycle calls?
* bundles config?
* plugin support/tests

Old design with stars. Still all covered?

```javascript
// With this config, these module IDs are found at these locations, all
// relative to baseUrl
// 'crypto'     -> '../vendor/crypto.js'
// 'crypto/aes' -> '../vendor/crypto/aes.js'
locations: {
  'crypto': '../vendor/*.js'
}

// 'db'        -> 'db.js', relative to baseUrl
// 'db/remote' -> '//example.com/services/db/remote'
locations: {
  'db/remote': '//example.com/services/*'
}

// 'config' -> '//example.com/services/*.js?cachebust=383844993922'
locations: {
  'config': '//example.com/services/*.js?cachebust=' + Date.now()
}

// 'lodash'          -> 'vendor/built/lodash.js'
// 'lodash/each'     -> 'vendor/built/lodash.js'
// 'lodash/filter'   -> 'vendor/built/lodash.js'
locations: {
  'lodash': 'vendor/built/lodash.js'
}
```