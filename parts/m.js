var module, ModuleLoader;
(function() {
  'use strict';

  // INSERT prim

  // START wrapping for esprima
  var esprima = {};
  (function() {
    var exports = esprima;
    // INSERT esprima
  }());
  // END wrapping for esprima

  // INSERT parse

  var Promise = prim,
      aslice = Array.prototype.slice;

  var hookNames = ['normalize', 'locate', 'fetch', 'translate', 'instantiate'];

  var hasOwn = Object.prototype.hasOwnProperty;
  function hasProp(obj, prop) {
      return hasOwn.call(obj, prop);
  }

  function slice(arrayLike) {
    return aslice.call(arrayLike, 0);
  }

  function mix(target, mixin, force) {
    Object.keys(mixin).forEach(function(key) {
      if (force || !hasProp(target, key)) {
        var descriptor = Object.getOwnPropertyDescriptor(mixin, key);
        Object.defineProperty(target, key, descriptor);
      }
    });
    return target;
  }

  function fetchText(address) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();

      xhr.open('GET', address, true);
      xhr.onreadystatechange = function() {
        var status, err;
        if (xhr.readyState === 4) {
          status = xhr.status;
          if (status > 399 && status < 600) {
            //An http 4xx or 5xx error. Signal an error.
            err = new Error(address + ' HTTP status: ' + status);
            err.xhr = xhr;
            reject(err);
          } else {
            resolve(xhr.responseText);
          }
        }
      };
      xhr.responseType = 'text';
      xhr.send(null);
    });
  }

  function createFetch(loader, load) {
    var normalizedName = load.name,
        address = load.address;

    var fetch = new Promise(function(resolve, reject) {
      var load = loader._loads[normalizedName];

      Promise.cast(loader.fetch(load))
        .then(function(source) {
          load.source = source;
          return loader.translate(load);
        })
        .then(function(source) {

          var parseResult = parse.fromBody(source, 'module');
          load.parseResult = parseResult;

          // If it looks like a module body, hten wrap,
          // in a module body function wrapper. Otherwise,
          // treat it as a normal non-module script.
          if (parseResult.isModule) {
            source = 'module.define(\'' + normalizedName +
                     '\', function(module) {\n' +
                     source +
                     '\n});';
          }
          source += '\r\n//# sourceURL=' + address;

          loader.eval(source);
          resolve();
        })
        .catch(reject);
    });

    return (loader._fetches[address] = fetch);
  }

  function enable(load) {
    if (load._parentLoad) {
      return enable(load._parentLoad);
    }

    var loader = load._loader;

    load._callEnableOnDefine = true;

    if (!load._registered) {
      load._fetching = true;
      Promise.cast(loader.locate(load))
        .then(function(address) {
          load.address = address;

          var fetch = loader._getFetch(address);
          if (!fetch) {
            fetch = createFetch(loader, load);
          }

          return fetch.then(function() {
            // Need to call _registered here because loaded thing
            // may just be a script that does not call module.define()
            if (!load.parseResult && !load.parseResult.isModule) {
              load._registered = true;
            }
            load._fetching = false;
          });
        })
        .then(function(){
          enable(load);
        })
        .catch(load.reject);
      return;
    }

    if (load._fetching || load._enabled) {
      return;
    }
    load._enabled = true;
    load._callEnableOnDefine = false;

    // Parse for dependencies in the factory, and any module.define
    // calls for local modules.
    var parseResult = load.parseResult;

    if (!parseResult && load._factory) {
      try {
        parseResult = parse.fromFactory(load._factory);
        load.parseResult = parseResult;
      } catch (e) {
        return load.reject(e);
      }
    }

    // A plain script, no dependencies are detectable,
    // so just proceed as if none.
    if (!parseResult) {
      parseResult = { deps: [] };
    }

    // Convert to normalized names
    Promise.all(parseResult.deps.map(function(dep) {
      return loader.normalize(dep, loader._refererName);
    }))
    .then(function(normalizedDeps) {
      // load dependencies
      Promise.all(normalizedDeps.map(function(dep) {
        return loader._pipeline(dep);
      })).then(function() {
        // create module var and call factory
        // TODO: is this the right thing to create?
        // What about custom hooks, they should be passed down?
        var module = new ModuleLoader({
          parent: loader,
          refererName: load.name,
          _knownLocalModules: parseResult.localModules
        });

        try {
          load._factory(module);
        } catch(e) {
          return load.reject(e);
        }

        Promise.cast().then(function () {
          if (hasProp(module, '_exportLocal')) {
            // Need to wait for local define to resolve,
            // so set a listener for it now.
            var localName = module._exportLocal,
                load = module._loads[localName];

            // Enable the local module, since needed to set
            // current module export
            enable(load);

            return load.whenFulfilled.then(function (value) {
              // Purposely do not return a value, in case the
              // module export is a Promise.
              module._export = value.exportValue;
            });
          }
        })
        .then(function() {
          // Get final module value
          var exportValue = module._export;

          var moduleDef = loader._modules[load.name] = {
            exportValue: exportValue
          };

          // Set _modules object, to include .export
          // resolve the final promise on the load
          load._moduleResolve(moduleDef);

          // TODO: clean up the load, remove it so can be garbage collected,
          // by calling then on the whenFulfilled thing. Is this safe to do
          // though? promise microtasks and the load reference that is used
          // across async calls in _pipeline might make it a bad idea.
        })
        .catch(load.reject);
      })
      .catch(load.reject);
    })
    .catch(load.reject);
  }

  ModuleLoader = function ModuleLoader(options) {
    options = options || {};

    function module(name) {
      var normalizedName = instance._normIfReferer(name);

      if (instance._hasNormalized(normalizedName)) {
        return instance._modules[normalizedName].exportValue;
      } else if (instance._parent) {
        return instance._parent(normalizedName);
      }

      throw new Error('module with name "' +
                      normalizedName + '" does not have an export');
    }

    var instance = module;

    mix(module, ModuleLoader.prototype, true);

    if (options.createHooks) {
      var hooks = options.createHooks(instance);
      hookNames.forEach(function(hookName) {
        instance[hookName] = hooks[hookName];
      });
    }

    instance._parent = options.parent;
    instance._refererName = options.refererName;
    instance._modules = {};
    instance._loads = {};
    instance._fetches = {};

    function createLoad(normalizedName, parentLoad) {
      var load = {
        name: normalizedName,
        metadata: {},
        address: undefined,
        source: undefined,
        _loader: instance
      };

      load.whenFulfilled = new Promise(function(resolve, reject) {
          load._moduleResolve = function(value) {
            load._moduleResolved = true;
            resolve(value);
          };

          load.reject = reject;
        });

      if (parentLoad) {
        load._parentLoad = parentLoad;
        parentLoad.whenFulfilled.then(load._moduleResolve);
      }

      return (instance._loads[normalizedName] = load);
    }

    instance._getCreateLocalLoad = function(normalizedName) {
      var load = hasProp(instance._loads, normalizedName) &&
                 instance._loads[normalizedName];
      if (!load) {
        load = createLoad(normalizedName);
      }
      return load;
    };

    instance._getLoadOrCreateFromTop = function(name) {
      var load;
      if (hasProp(instance._loads, name)) {
        load = instance._loads[name];
      } else if (instance._parent) {
        // Store a local load for it, now that one module
        // in this instance is bound to it, all should.
        // This also ensures a local _modules entry later
        // for all modules in this loader instance
        load = instance._parent._getLoadOrCreateFromTop(name);
        if (load) {
          load = createLoad(name, load);
        }
      }
      if (!load) {
        load = createLoad(name);
      }
      return load;
    };

    instance._getFetch = function(address) {
      if (hasProp(instance._fetches, address)) {
        return instance._fetches[address];
      } else if (instance._parent) {
        return instance._parent._getFetch(address);
      }
    };

    instance._pipeline = function(name) {
      return Promise.cast()
        .then(function() {
          // normalize
          return Promise.cast(instance.normalize(name));
        })
        .then(function(normalizedName) {
          // locate
          if (hasProp(instance._modules, normalizedName)) {
            return instance._modules[normalizedName];
          } else {
            var load = instance._getLoadOrCreateFromTop(normalizedName);
            enable(load);
            return load.whenFulfilled;
          }
        });
    };

    if (options._knownLocalModules) {
      options._knownLocalModules.forEach(function(localModuleName) {
        createLoad(localModuleName);
      });
    }

    // TODO: enable a debug flag, on script tag? that turns this tracking
    // on or off
    if (topModule && topModule._allLoaders) {
      topModule._allLoaders.push(module);
    }

    return module;
  };

  // Specified as a prototype, but these values are just mixed in
  // to the ModuleLoader instance function.
  ModuleLoader.prototype = {
    _normIfReferer: function(name) {
      var normalized = this._refererName ?
                       this.normalize(name, this._refererName) :
                       name;

      if (typeof normalized !== 'string') {
        throw new Error('name cannot be normalized synchronously: ' + name);
      }

      return normalized;
    },

    // START module lifecycle events
    normalize: function(name, refererName, refererAddress) {
      return name;
    },

    locate: function(load) {
      // load: name, metadata

      return load.name + '.js';
    },

    fetch: function(load) {
      // load: name, metadata, address

      return fetchText(load.address);
    },

    translate: function(load) {
      //load: name, metadata, address, source

      return load.source;
    },

    // END module lifecycle events

    // START declarative API
    export: function(value) {
      if (hasProp(this, '_exportLocal')) {
        throw new Error('module.exportLocal() already called');
      }

      // TODO: throw if called after module is considered "defined"
      this._export = value;
    },
    exportLocal: function(localName) {
      if (hasProp(this, '_export')) {
        throw new Error('module.export() already called');
      }

      // TODO: throw if called after module is considered "defined"
      this._exportLocal = localName;
    },
    // END declarative API

    define: function(name, fn) {
      if (typeof name !== 'string') {
        fn = name;
        this._parent.define(this._refererName, fn);
        return;
      }

      var load = this._getCreateLocalLoad(name);
      load._factory = fn;
      load._registered = true;

      if (load._callEnableOnDefine) {
        enable(load);
      }
    },

    // Variadic:
    // Sytem.load('a', 'b', 'c', function (a, b, c){}, function(err){});
    load: function () {
      var callback, errback,
          args = slice(arguments);

      if (typeof args[args.length - 1] === 'function') {
        callback = args.pop();
      }
      if (typeof args[args.length - 1] === 'function') {
        errback = callback;
        callback = args.pop();
      }

      var p = prim.all(args.map(function(name) {
        return this._pipeline(this._normIfReferer(name));
      }.bind(this)))
      .then(function(moduleDefArray) {
        var exportArray = moduleDefArray.map(function(def) {
          return def.exportValue;
        });
        callback.apply(null, exportArray);
        return exportArray;
      });

      if (errback) {
        p.catch(errback);
      }

      return p;
    },

    eval: function(sourceText) {
      return eval(sourceText);
    },

    has: function(name) {
      var normalizedName = this._normIfReferer(name);

      if (this._hasNormalized(normalizedName)) {
        return true;
      }

      if (this._parent) {
        return this._parent.has(normalizedName);
      }

      return false;
    },

    _hasNormalized: function(normalizedName) {
      return hasProp(this._modules, normalizedName) &&
             hasProp(this._modules[normalizedName], 'exportValue');
    },

    delete: function(name) {
      var normalizedName = this._normIfReferer(name);
      if (this._hasNormalized(normalizedName)) {
        delete this._modules[normalizedName];
      } else {
        throw new Error('loader does not have module name: ' + normalizedName);
      }
    },

    entries: function() {

    },

    keys: function() {

    },

    values: function() {

    }
  };

  module = new ModuleLoader();
  var topModule = module;
  // debug stuff
  module._allLoaders = [];
}());
