# Loader configuration options

By default, the loader will load items from `baseUrl + module ID + '.js'`, and all scripts that use the module system will be evaluated in strict mode.

For some environments, like Node, the default loader in that environment will have already been set up with some default path resolution logic for that environment. For Node, it would know how to traverse nested node_modules.

There are some configuration options to control how the loader loads scripts, and how to add in loader lifecycle hooks.

## Config API

Configuration is only possible on a "top" loader, one that does not have a parent loader. Each module gets its own `module` object, and that module object is effectively a loader tied to a parent module. However, there are loaders that do not have parents:

* In a web page, `module.top` is the topmost, default loader.
* Calling `new module.Loader({})` creates a new loader with no parent.

In the `new module.Loader({})` form, the object passed to the constructor is a configuration object.

Additionally, these top loaders have a `loader.config({})` API to pass in config after their initial creation. The configuration object passed in to this method is deep-merged with the existing configuration.

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

This sets the baseUrl for the loader. By default, set the directorty where execution starts. For a web page, this is the web page's directory. For a command line script, it would be the directory in which the script is run.

### locations

Property names are module ID prefixes, and the values are path segments, using a '*' to indicate where the full module ID will be inserted. If the path segment is a relative path, it is relative to baseUrl:

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

(`locations` is used as the name for this type of config instead of `paths` to relate it closer to the `locate` loader hook, which translates a module ID to a path location).

#### package-style locations

A package is a set of modules in a directory where there is a "main" module that can be referenced by outside code by just using the package's name.

There is no need for any special `locations` config if you lay out the code on disk such that there is a `packageName.js` as a sibling to the `packageName` directory. If the "main" module for that package was at `packageName/main.js`, then `packageName.js` would look like so:

```javascript
module.export = module('packageName/main');
```

However, if you do not control the file system layout and cannot create that adapter module, there is a `locations` config object with the following form that can be used instead:

```javascript
'locations': {
  'lodash': {
    'location': '../vendor/lodash/*.js'
    'main': 'main'
  }
}
```

Internally, the loader will just create a similar adapter module under the 'packageName' module ID that just depends on the 'packageName/main' module (if main.js is the main module for that package directory).

This special configuration is needed for packages that have a main config to allow modules inside the package to reference on the main module via a relative ID.

In the above example, if 'lodash/filter' wanted to use something in 'lodash/main', it should just be able to use `module('./main')` to access it. With a plain `locations` config, it would result in two module entries, one for 'lodash' and 'lodash/main', which would be separate module instances of the same module. That would likely cause problems.

**Notes**:

1) package-style location config is only possible for the first segment of a module ID. So, 'lodash' can use this style of location config, but 'utilities/lodash' would not work.

2) The 'main' value should not include a file extension, like '.js'. It is actually a module ID segment that is based on the directory name. So, in the above example, if the main module was actually at '../vendor/lodash/lib/main.js', then the 'main' value would be 'lib/main'.

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
{
    alias: {
        'some/newmodule': {
            'foo': 'foo2',
            'foo/bar': 'foo1.2/bar3'
        },
        'some/oldmodule': {
            'foo/bar/baz': 'foo1.0/bar/baz2'
        }
    }
}
```

If 'some/module/sub' asks for 'foo' it gets 'foo2'. If 'some/module/sub' asks for 'foo/bar' it gets 'foo1.2/bar3'.

There is a "*" alias value which means "for all modules loaded, use this alias config". If there is a more specific alias config, that one will take precedence over the star config.

Example:

```javascript
{
    alias: {
        '*': {
            'foo': 'foo1.2'
        },
        'some/oldmodule': {
            'foo': 'foo1.0'
        }
    }
}
```

In this example if 'some/oldmodule' asks for 'foo', it will get 'foo1.0', where if any other module who asks for 'foo' will get 'foo1.2'.

### moduleConfig

A configuration object available to modules that match the absolute module ID listed in the moduleConfig object. Modules with a matching module ID can access the configuration object via `module.config`, which is an Object value. The Object value is mutable, and an Object value is always returned. If there is no explicit config set, calling `module.config` will return an empty object, and not undefined.

Example:

```javascript
{
    moduleConfig: {
        'some/module/id': {
            limit: 40
        }
    }
}
```

For the module that resolves to the absolute module ID of 'some/module/id', `module.config.limit === 40`.


