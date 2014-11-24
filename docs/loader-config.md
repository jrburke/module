# Loader configuration options

By default, the loader will load items from `baseUrl + module ID + '.js'`, and all scripts that use the module system will be evaluated in strict mode.

The following configuration options allow some declarative ways to modify that default behavior, as well as a `loaderHooks` capability to provide imperative overrides.

For some environments, like Node, the default loader in that environment can provide `loaderHooks` overrides to these base config values, and delegate to them when/if they seem appropriate.

## Config API

Configuration is only possible on a "top" loader, one that does not have a parent loader. Each module gets its own `module` object, and that module object is effectively a loader tied to a parent loader. However, there are loaders that do not have parents:

* `module.top` is the topmost, default loader.
* Calling `new module.Loader({})` creates a new loader with no parent.

In the `new module.Loader({})` form, the object passed to the constructor is a configuration object.

Additionally, these top loaders have a `loader.config({})` API to pass in config after their initial creation. The configuration object passed in to this method is merged with the existing configuration.

For a web page, it will be typical to call `module.top.config({})` before loading any modules, if any configuration needs to be set up for the default loader.

## Config options

First, some common terms:

* **module ID prefix**: means part of a module ID that starts from the beginning of a string, and stop on any of the slash delimiters, up to and including the full name. So, for the complete module ID `some/very/long/name`, these are all module ID prefixes:
    * `some`
    * `some/very`
    * `some/very/long`
    * `some/very/long/name`
* **first segment of a module ID prefix**: the part of a module ID up to the first slash, or the whole name if there are no slashes in the module ID. For the example above, `some` is the first segment.

### baseUrl

This sets the baseUrl for the loader. By default, set the directorty where execution starts. For a web page, this is the web page's directory. For a command line script, it would be the directory in which the top level script is run.

### locations

Sets the URLs/paths to files, as well as specifying if a module ID prefix is a package that contains a "main" module inside of it.

The reasoning behind the choice of format for the locations is explored more in [design-background/locations-config](https://github.com/jrburke/module/blob/master/docs/design-background/loader-config.md).

The general format for a "locations" config entry. The < > parts indicate logical names for parts that may show up. Three types of ID-segment specifiers can be used

    <id-segment> : <urlpath-segment> - Matches id-segment and id-segment/sub, unless second form is set
    <id-segment>/ : <urlpath-segment> - Matches only id-segment/sub IDs
    <id-segment>{main-sub-id} : <urlpath-segment> - package config

Passing a a value that is `null` or `false`, will be the way to clear a locations entry from a loader, in the case of a reset.

Location values can be relative paths, and in those cases, they are relative to the baseUrl. For package config, if the package can be found at the baseUrl, then an empty string can be used for the locations value.

Examples

```javascript
module.top.config({
  locations: {
    // Basic module ID prefix setup
    'crypto': 'vendor/crypto',

    // Only a submodule ID under 'db' gets a remote URL
    'db/remote': '//example.com/services/db/remote',

    // jQuery from vendor, plugins from another area
    'jquery': 'vendor/jquery',
    'jquery/': 'plugins/jquery',

    // A "package" setup
    'lodash{main}': 'vendor/lodash'
  }
});

// Basic module ID prefix setup
module.locate('crypto', 'js') // 'vendor/crypto.js'
module.locate('crypto/aes', 'js') // 'vendor/crypto/aes.js'

// Only a submodule ID under 'db' gets a remote URL
module.locate('db', 'js') // 'db.js'
module.locate('db/remote', 'js') // '//example.com/services/db/remote.js'

// jQuery from vendor, plugins from another area
module.locate('jquery', 'js') // 'vendor/jquery.js'
module.locate('jquery/jquery.scroll', 'js') // 'plugins/jquery/jquery.scroll.js'

// A "package" setup
module.locate('lodash', 'js') // 'vendor/lodash/main.js'
module.locate('jquery/each', 'js') // 'plugins/lodash/each.js'
```

**Notes on package config**:

The special configuration is needed for packages that have a main config to allow modules inside the package to reference on the main module via a relative ID.

In the above example, if 'lodash/filter' wanted to use something in 'lodash/main', it should just be able to use `module('./main')` to access it. With a plain `locations` config, it would result in two module entries, one for 'lodash' and 'lodash/main', which would be separate module instances of the same module, an undesirable and confusing result.

The "main" value, specified in the `{}` part of the property hame, should not include a file extension, like '.js'. It is actually a module ID segment that is based on the directory name. So, in the above example, if the main module was actually at 'vendor/lodash/lib/main.js', then the 'main' value would be 'lib/main'.

### alias

Specifies for a given module ID prefix, what module ID prefix to use in place of another module ID prefix. For example, how to express "when 'bar' asks for module ID 'foo', actually use module ID 'foo1.2'".

This sort of capability is important for larger projects which may have two sets of modules that need to use two different versions of 'foo', but they still need to cooperate with each other.

This is different from `locations` config. `locations` is only for setting up root paths for module IDs, not for aliasing one module ID to another one.

```javascript
{
  alias: {
    'some/newmodule': {
      'foo': 'foo1.2'
    },
    'some/oldmodule': {
      'foo': 'foo1.0'
    }
  }
}
```

If the modules are laid out on disk like this:

* foo1.0.js
* foo1.2.js
* some/
    * newmodule.js
    * oldmodule.js

When 'some/newmodule' asks for 'foo' it will get the 'foo1.2' module from foo1.2.js, and when 'some/oldmodule' asks for 'foo' it will get the 'foo1.0' module from foo1.0.js file.

This feature only works well for scripts that are real AMD modules that call define() and register as anonymous modules. If named modules are being used, it will not work.

Any module ID prefix can be used for the alias properties, and the aliases can point to any other module ID prefix. The more specific module ID prefixes are chosen when resolving which alias value to use.

Example:

```javascript
module.top.config({
  alias: {
    'some/newmodule': {
      'foo': 'foo2',
      'foo/bar': 'foo1.2/bar3'
    },
    'some/oldmodule': {
      'foo/bar/baz': 'foo1.0/bar/baz2'
    }
  }
});
```

If 'some/module/sub' asks for 'foo' it gets 'foo2'. If 'some/module/sub' asks for 'foo/bar' it gets 'foo1.2/bar3'.

There is a "*" alias value which means "for all modules loaded, use this alias config". If there is a more specific alias config, that one will take precedence over the star config.

Example:

```javascript
module.top.config({
  alias: {
    '*': {
      'foo': 'foo1.2'
    },
    'some/oldmodule': {
      'foo': 'foo1.0'
    }
  }
});
```

In this example if 'some/oldmodule' asks for 'foo', it will get 'foo1.0', where if any other module who asks for 'foo' will get 'foo1.2'.

### moduleData

A data object available to modules that match the absolute module ID listed in the data object. This is useful for passing configuration data to a specific module.

The data is set inside the `moduleData` config object, and modules with a matching module ID can access the data object via `module.data`, which is an Object value. The Object value is mutable, and an Object value is always returned. If there is no explicit data set from a config() call, accessing `module.data` will return an empty object, and not undefined.

Example:

```javascript
module.top.config({
  moduleData: {
    'some/module/id': {
      limit: 40
    }
  }
});
```

For the module that resolves to the absolute module ID of 'some/module/id', `module.data.limit === 40`.

### loaderHooks

??? TODO

## Event listeners (on)

Instead of constructing a full loader hook, it is desirable to just modify the result of a hook before it is finally used. The usual example is adding a cachebusting argument or a hash value to a URL for a locate call, for breaking cache reasons.

For these kinds of small modifications, implementing a full hook that knows how to properly participate in a Promise workflow is very heavyweight. There is an `on` event listener capability.

It is an imperative API, and therefore, running these handlers should not be expected to be done during build tools. The API is only on a "top" loader, like `module.top. Any of the loaderHooks hooks are candidates for `on` listening.

Example, which adds a cachebust argumetn to the URL:

```javascript
module.top.on('locate', function(event) {
  event.result += '?cachebust=' + Date.now();
});
```

The `event` object has two properties on it:

* `result`: The result of the loader call. Modify it to modify the value that will finally be used inside the loader.
* `args`: an array of arguments to the original loaderHook call. These are just informational, in case the `on` listener needs to modify its result based on the arguments. The values in the `args` array should not be modified.

The `on` listener needs to do its work synchronously. Any `evt.result` modification after the listener's function completes is ignored.

