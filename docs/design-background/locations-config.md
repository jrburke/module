# Design background: locations config

The forces at play:

1) convert ID to a full path, just for a .js file

    some/thing --> a/path/to/some/thing.js

2) convert ID to a full path, that may not have a .js suffix

    some/thing --> http://example.com/service?id=some/thing

3) convert ID to a full path, which may explicitly indicate suffix in the ID:

    tmpl!list.html --> a/path/to/list.html

4) convert ID to a full path, that may have an explicit other suffix

    cs!some/thing --> a/path/to/some/thing.cs

5) Also indicate "package main" relative ID for package-type directory of
modules. Can be a proxy module, but need a way to indicate main module then
other sub-modules:

    crypto --> crypto/main --> a/path/to/crypto/main.js
    crypto/aes --> a/path/to/crypto

6) Root ID resolve differently than sub-module IDs:

    foo --> http://cdn.example.com/lib/foo.js
    foo/sub --> a/path/to/foo/sub.js

## Discarded approaches

### Explicitly type the suffix in the module ID

It is tempting to say "use .js in the ID if it a .js file", but the point of a module ID is that it can be satisfied in different ways, may not come from a ".js" file.

What about loader plugin IDs though? Don't they list the suffix, like 'tmpl!list.html'?

Only for resources where the plugin can handle multiple different types. So, a 'tmpl!' plugin may also be able to handle .htm, .txt files. However, something like a coffeescript file, 'cs!some/thing', can be mapped directly to a .js file.

### Use a "*" notation in the locations segment

The "*" is replaced by the module ID, so that it can then specify the file extension:

    'some/thing': 'a/path/to/*.js'

For the module ID 'some/thing/else', that gets placed in the `*` location, and the location becomes 'a/path/to/some/thing/else.js'

This addresses, 1, 2. Items 5 and 6 can work in this system too. The tricky parts are 3 and 4.

For 3 and 4, it is tempting to say "loader plugin, just call `locate` then strip off the ".js" and add in the extenion you want. However, it is unclear if the returned path from `locate` will always return a location that ends in '.js', it could come back with at '.jsm' suffix. And what if the module ID is named 'some/thing.js', and the location value did not include a '.js'?

Are those surmountable via `locate` overrides? Not really, because the value is dependent on the caller to locate, locate does not have enough to disambiguate a call for 'some/thing.html' and a 'some/thing' that is for the .js file as a sibling to the .html file.

What if those are moduleConfig options to the loader plugins? That means having deeper knowledge that a package may need a moduleConfig for a loader plugin that it may use, and what config format that should take, which breaks encapsulation -- the package is no longer an encapsulated entity that just specifies module ID dependencies.

## Selected approach

### locations config format

The general format for a "locations" config entry. The < > parts indicate logical names for parts that may show up. Parts that end in ?> are optional.

    <id-segment></?> : <urlpath-segment><@main:<id-segment>?>

* The `</?>` part allows for point 6 above to work.
* The `@main:<id-segment>` allows specifying the main ID segment to append to the config's id-segment to find the package main module, for point 5. If main: is specified, then <id-segment>/ is not allowed as the property name. `@main:` indicates a default value should be used. Equivalent to `@main:index`.
* For 1, callers to loader's `locate` method pass a 'js' as the file extension, and `locate` applies the locations mapping to urlpath-segment, then adds the extension if it exists. For 3 and 4, loader plugins are expected to pull off the file extension from the ID, then call the loader's `locate` method with the extracted the extension.
* For 2, this is a rarely needed config option, and supporting it means overriding the `locate` hook to just return a string without considering the fileExtension argument to `locate`.

Passing a a value that is falsy (null, undefined, empty string, false), will be the way to clear a locations entry from a loader, in the case of a reset. Using undefined or empty string (if json) should be the preferred ways to indicate a reset of a location value.


### locate module loader method accepts suffix

In order for the module loader's `locate` method to work, it needs to know what file extension to apply, so the signature becomes:

```javascript
locate: function(entry, fileExtension) {

}
```

Is it possible to remove the need for the fileExtension argument, and allow the caller to add it as they see fit? To support design point 2, there needs to be a way to support it via a one method override. Otherwise, the caller of locate -- the default module system that would want to append '.js' and individual loader plugins -- would need to be informed somehow of the overrided. This would be more complicated than this signature change to `locate`.

fileExtension is optional, and if it is not a string, then it is not appended. This allows `locate` to be used to find the directory location of a module ID prefix.

### cache expiry

If want to cache bust, override locate: hook, call the main one then append what you want.



