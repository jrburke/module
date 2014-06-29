# Story Time

What is a module system? It is a way to declare and load reusable units of code.

JavaScript already has a reusable unit, the function:

```javascript
function speak(msg) {
  console.log(msg);
}
```

Variables too:

```javacript
var message = {
  shortFormat: 'Hi',
  longFormat: 'Good Day'
};
```

You reference variables and functions by their **identifiers**. In these examples, `speak` and `message`.

These constructs are useful for declaring a reusable unit of code, but does not speak to the loading of it. For references to these identifiers to work, they need to be declared before they are referenced.

Before JS module systems, the programmer needed to know if the identifier was declared in another file, and load that other file first. For HTML pages, this was accomplished with the `script` tag. For other systems, it might be a file read + execute, perhaps a `load` function that took a path to the file.

It was possible to get this to work, but dependencies for a file are normally a tree structure:

     ___|___
    | |   | |


Where the developer had to flatten out the tree in a way that the leaf nodes were first before the branch nodes:

    |
    |
    |
    |
    |

## A loader

This gets unwieldy after a few files are in use. It would be nice to use a program to do this work for us. How could a program be structured so that it could work?

It could parse the source file, and for any identifiers not declared in that file, assume they came from some other file. An example in a file called `main.js`:

```javascript
speak(message.longFormat);
```

Our program would determine `speak` and `message` were defined somewhere else. It could use a convention that would look for that file at `Identifier + '.js'`. So, it would identify the following files to fetch and execute, and in this order:

* speak.js
* message.js
* main.js

While it would be useful if the program could print that out for us, so that we could structure our `script` tags or `load` calls in the correct order, it would be even more useful to just have the program also do the file IO and execute the files for us.

Call this kind of program a **Loader**.

Let's give the loader an API. We'll call the object `loader`, and to ask it to load files, give it a method name to do that. Name it `use`:

```javascript
loader.use('main.js');
```

Why `use` and not `load`? If the loader has already loaded `main.js` in previous call to the loader, it would not really be loading it again, as that would be wasteful. So `use` is to indicate that we want to use the identifiers of `main.js`, whether it has been loaded or not. If already loaded, then loader does not have much to do.

## Nested Identifiers

While this system works for simple things, normally parts of an application can be organized into categories. For instance, if we have a localization library we want to use for our speaking example, it might declare an object like so:

```javascript
var l10n = {
  config: {
    setLocale: function(locale) {}
  },
  string: {
    format: function(l10nId) {},
  },
  date: {
    format: function(dateObject) {}
  }
};
```

The `l10n.date` parts of that object could be quite large. Time and locales are complicated to sort out correctly. However, our app may only want to print string messages. It would be very wasteful to load all of this `l10n` object, particularly in the browser, where time to first render and memory usage is very important. Even on the server, in a Node program, the less memory a program needs, the better.

Our loader only scans for identifiers that are not declared in the current file though. It would find `l10n`, but does not have enough information to know to only load the parts that we need for config and string purposes.

We need to help it out a bit. So let's give it a way to know we only want part of the object. Furthermore, let's choose an approach that allows the author of the `l10n` object a way to break the whole `l10n` definition across a few smaller files. This will help the author better reason about the code, and it also gives us a nice, easy way to avoid loading parts of the `l10n` object that we will not use.

We could choose to use new language syntax to do this. After all, the loader was looking for `var` and `function` to find definitions and to know if something was not defined in the file.

However, this complicates the story for JS library authors that still need to support users who do not or will not use a module system. New syntax means those libraries would need to provide two different versions of their library, instead of one version that can detect if a module system is being used and opt in to it.

Let's choose a declarative sounding API. Just like with the primitive identifier-only solution, any reference to a dependency in our file means the loader will need to fetch and execute that dependency. Our loader cannot know if the that dependency will be needed or not.

In our original `main.js` example that used identifiers, it looked like this:

```javascript
if (window.someRuntimeValue) {
  speak(message.longFormat);
}
```

The loader can only statically analyze the contents of the file. It does not know if `window.someRuntimeValue` will be true. The loader always needs to fetch and execute `speak.js`.

Since we are talking about modules, call the API `module`.

Instead of `main.js` looking like this:

```javascript
speak(l10n.string.format(message.longFormat));
```

Convert it to use our new declarative API, `module('dependencyId)`:

```javascript
module('speak')(module('l10n/string').format(module('message').longFormat));
```

While we lost a bit of simpleness with the plain identifiers, at least the API can be used inline in expressions. One-time references to a module can be inlined without needing another local identifier for that module.

## Dependencies as string IDs

The dependencies are now strings instead of identifiers. The IDs use slashes too, instead of dots. The module ID for the l10n string object is 'l10n/string' and not 'l10n.string'. This is really useful because it gives a simple convention for mapping the ID to a file path for loading.

For the example, the directory layout can now look like this:

* l10n/
    * config.js
    * date.js
    * string.js
* main.js
* message.js
* speak.js

This opens up the `l10n` directory to be distributed as a package of modules.

If dots instead of slashes where used, this would be harder to do. This is illustrated by existing culture around JS file naming, particularly for plugins for libraries like jQuery (`jquery.bbq.js` for example).

## Exporting a module value

In the simple loader, it was easy to reference the value that was assigned to the Identifier. Now that we have a module API and a string value, how do we reference the the value assigned to that module? We will want to avoid using globals, so lets give a way for the module to "export" its value.

Since we are already using `module`, let's keep the export capability on that object. This will help reinforce that this is related to modules. We will call it `module.export`, to signify that this is more of a declarative intention.

The `l10n/string` module now looks like this:

```javascript
module.export = {
    format: function(l10nId) {}
};
```

Using `return` would have been better than `module.export`, but existing JavaScript grammar rules do not allow `return` in that way. Too bad. So we will stick with `module.export`.

That decision has another benefit though. `module.export` could provide a default object to use for the exported value. So `l10n/string` could be written like so:

```javascript
module.export.format = function(l10nId) {};
```

To avoid confusion and inadvertent errors, we will only allow either use of the default `module.export` object to attach properties, or a one time assignment to `module.export`.

## Unique module objects

If `module.export` is the value for a module, how does it work if both `l10n/string` and `speak` assign to it?

Each module gets its very own, unique `module` object. So the `module.export` that is used in `l10n/string` and `speak` are different.

This is very important for another reason -- to allow relative module references. For example, if the `l10n/string` module needed to use the `l10n/config` module, it would be best if `l10n/string` did not have to know the `l10n` part. The user could have put that directory in a `vendor` directory, and in that case the absolute ID would have been `vendor/l10/config`.

Since each module gets its own `module` object, we can allow relative ID references. Example for `l10n/string`:

```javascript
module.export = {
  format: function(l10Id) {
    var locale = module('./config').locale;
    // Do something with locale here.
  }
};
```

The unique `module` object for `l10n/string` knows it is for that ID, so it can resolve `./config` relative to that ID.

It can also reflect that knowledge to the module. This is useful for building IDs based on a module ID or paths based on the location of the module. If the `l10n/string` module accessed the `module.id` and `module.url` properties:

```javascript
// Prints "l10n/string"
console.log(module.id);

// Prints "l10n/string.js"
console.log(module.url);
```

## Async loading

If we revisit `module.use` now that we have module IDs, then instead of starting off the load of main.js like this:

```javascript
loader.use('main.js');
```

We can now just use the module ID for main.js:

```javascript
loader.use('main');
```

And since we can declare dependencies and an export value for a module. We are done, right?

That might be true if JavaScript only synchronously fetched and executed files on a local file system. However, the web browser is not such an environment, and JavaScript is used quite a lot there.

Synchronous fetching and executing is just not a good idea for performance reasons. When the network is your file IO, you need an asynchronous loader pipeline.

Allow `loader.use` to be asynchronous:

```javascript
loader.use('main', function(main){
  // main.js has executed now.
});
```

Promises are now coming to JavaScript natively, so lets take advantage of that. However, Promises deal with single return values. For our API, we may have wanted to fetch two modules. So allow a function whose arguments match the common success case, and leverage the Promise API for error flow control:

```javascript
loader.use('a', 'b', function(a, b) {
  //use the a and b modules in here.
}).catch(function(err) {
  // An error occurred
});
```

Even though the top level loader API is async now, this does not mean our modules need to declare their dependencies like this. The async loader API is only needed for triggering runtime loads of code, not for declarative statements of dependencies. `loader.use()` is for runtime, dynamic loads of modules.

For declarative dependencies, just like in the primitive Identifier example, the loader can scan for `module(StringLiteral)` calls, fetch and execute those dependencies, then execute the current module.

## Unique module .use()

The same design forces are in place for `use` that led to the creation of a unique, module-specific `module` object. The module references for `use` could be relative IDs.

Even more important, our complete system should allow multiple loader instances, so a module needs a way to say "dynamically load these modules in the loader that loaded me".

Since we already have a unique `module` object for each module, it can be used to store the loader instance that loaded it, and can still resolve relative IDs.

It makes sense then to put the `use` on `module` instead:

```javascript
module.use('a', 'b', function(a, b) {
  //use the a and b modules in here.
}).catch(function(err) {
  // An error occurred
});
```

## Loader instances

As mentioned above, it would be nice to allow different module loader instances: encapsulating a set of modules together in a loader context, then start a new one is really important for test scenarios.

Let's not add more unique objects to give to a module, but use our existing `module` object for this:

```javascript
var loader = new module.Loader();
```

Perhaps you can see where this is going: **Every unique `module` object is an instance of Loader**.

The loader that loads the module creates the loader instance for that module. It also means loaders have a parent loader.

## The top loader

Is it turtles all the way down? Not in this finite environment. There is a top loader, one that does not have a parent. For a given loader instance, it can be referenced at `loaderInstance.top`.

For a web page, a default loader is created and assigned to `module` to limit the global name impact of the module system.

```html
<script>
// This is all that is required to start the loading of a modular app whos main
// module is called 'main' and does not need any loader configuration done.
module.top.use('main');

// In this context module === module.top is true.
</script>
```

## Inline modules

Just as `function` allows inline definitions, we need a way to allow defining a module inline, particularly when dealing at the "top" loader level, like a web page.

As `module` is the focus for module capabilities, use `module.define` for this capability. It takes a string for the module ID and then a function, called the **factory function** that expects only one argument, a `module` object unique to that module.

The factory function produces the module export for that inline definition.

```javascript
module.define('b', function(module) {
  var a = module('a');

  module.export = function() {
    return a();
  };
});
```

The factory function is **not** executed as part of the module.define() call. The factory function is only executed when there is a `module.use()` dependency tree that needs the export value created by it.

This mirrors what happens if the loader dynamically loaded the module instead of using the inline definition. `module.define` just says "if this loader asks for a module with this ID at some point, use this factory function to generate the exports".

Example uses for this:

1) Seeding the main loader with module values based on scripts that were loaded via browser globals. A common case is wanting to use jQuery in a CMS system that is set up to load jQuery as a plain script tag:

```html
<html>
  <head>
    <script src="jquery.js"></script>
    <script>
      if (typeof jQuery === 'function') {
        module.define('jquery', function(module) {
          // Perhaps do some work here, like call noConflict
          // to remove jQuery from the global scope.
          module.export = jQuery;
        });
      }

      // Start loading the modular parts
      module.use('main');
    </script>
  </head>
  <body></body>
</html>
```

2) For tests, you may want to create some mocks of some modules before loading the test:

```javascript
var testLoader = new module.Loader();

testLoader.define('xhr', function(module) {
  function FakeXMLHttpRequest() {

  }

  // ...

  module.export = FakeXMLHttpRequest;
});

// Load the test.
testLoader.use('testXhr');
```

For more background on the other advantages of inlining, see the [inlining doc](https://github.com/jrburke/module/blob/master/docs/inlining.md).

## Contained scope

With inline modules, we see how each module can get its own scope via the factory function. Dynamically loaded modules should get their own scope too, and still be able to see the regular globals for the system. For the browser, this means globals like `document` and `window`.

A function gets its own scope, so that will be used as the scope provider for modules. We saw it used for inline modules, but our loader can use this high level process for evaluating modules:

1) Fetch the module text, call it `module text`.

2) Wrap that text in this sort of wrapper, then evaluate it in in the context of the appropriate loader:

```javascript
module.define('moduleId', function(module) {
  /* module text goes here */
});
```

This gives a consistent approach to executing the dynamically loaded and inlined modules.

## Nested modules

Going further, just as `function` allows nesting (example is primitive, just for illustrating nested declared functions):

```javascript
function makeQueryString(object) {
  // Local function only visible inside this function.
  function encode(name, value) {
    // Uses a global function, one defined in the scope chain for this
    // this function.
    return encodeURIComponent(name) + '=' + encodeURIComponent(value);
  }

  var string = '';
  Object.keys(object).forEach(function(key, i) {
    string += (i > 0 ? '&' : '') + encode(key, object[key]);
  });

  return string;
}

```

Modules should allow nesting too. The wrinkle in the module case is that definitions are asynchronously done, and the exports only set on demand, when part of a `module.use` dependency tree.

So we need a way to indicate an export, but one that is set after an async process.

Since each module gets its own `module` object, and `module.define` allows for inlined module defines, each getting a `module` object as the first argument to the factory function, we can use that.

However, `module.export` cannot be used if the module definition depends on one of these nested modules. Module definition is resolved async and the loader may even need to dynamically load a dependency to complete the definition.

We will use a new export function to indicate locally defined modules are used. Call it `module.exportDefine`.

```javascript
module.define('jquery.effectize', function(module) {
  module.define('colorize', function(module) {
    module.export = function colorize() {};
  });

  module.define('blur', function(module) {
    module.export = function blur() {};
  });

  module.define('effects', function(module) {
    module.export({
      colorize: module('colorize'),
      blur: module('blur')
    })
  });

  module.exportDefine(function(module) {
    var effects = module('effects');
    // 'jquery' is dynamically loaded by module.top since
    // it is not in the outer nesting of modules.
    var $ = module('jquery');
    module.export = function applyEffectsToDom(selector) {
      return effects.colorize(effects.blur($(selector)[0]));
    };
  });
});
```

While this form of nested modules should only be built by build tools, and should not be something that is regularly hand-authored, we still need to define the behavior for it.

## Cycles

What to do about circular dependencies, otherwise known as cycles? The [cycles doc](https://github.com/jrburke/module/blob/master/docs/cycles.md) has a deeper dive on that topic.

## Fin

That is where the story ends for now. It would be good to expand the story later to include:

* Other types of dependencies
* Loader hooks
