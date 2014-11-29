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

In that case the author of bundle expects that "e" to satisfy. However, the loader lifecycle provider wants to know about all loader lifecycle calls. That provider should win. They are given enough info to know to not change the value, via refererName. It does require in-depth knowledge of nested modules if wanting to not handle them, but that is fine, that is what loader hooks are for.

However, there is a tension with the purposes of scope: local modules should be used if possible, and when the inlined modules are inlined, the assumption is that those where the preferred providers.

So is it possible to allow local name resolution, does that work out? Seems like the rules are different than normal resolution:

1) Only handle './' resolution, otherwise treat as a direct module ID.

2) No alias config applied, since it was likely not known when the bundle was created. But what about an app bundle, where the alias config is expected to live? That should be a flat bundle in that case. This is about nested resolution.

3) No package config applied: the inlining should create the right adapter module.

4) Favor local scope or parent scope entries, unless the top scope, as that is the one that gets the dynamically loaded stuff.

5) What about plugin references though? What would be the rules?

* Only if plugin is already inlined. If not inlined, then a check for `plugin![regularly normalized resource ID]` is tried and used if it exists.
* moduleNormalize is called on the plugin for sync resolution.

Why the restriction on sync resolution? Because for local scope it is either there or it isn't, and the top loader lifecycle should be used.

What about allowing for the loader plugin to be dynamically loaded? Let's not get crazy here. The purpose of nested inlining is to have a self-contained bundle. Either it is there or it is not. It is fine for it delegate out for some dependencies, but for these resolution issues, needs to favor local definitions.

## todos

* test for useExtension for plugins.
* module.id instead of module.name since browser wants to claim .name. Cannot reconfigure a non-configurable property.
* implement module.address
* entry objects have a lot of data on them now, restrict for lifecycle calls?
* bundles config?
* plugin support/tests

