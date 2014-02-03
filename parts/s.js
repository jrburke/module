var system, ModuleLoader;
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

          var parseResult = parse.fromBody(source, 'system');
          load.parseResult = parseResult;

          // If it looks like a module body, hten wrap,
          // in a module body function wrapper. Otherwise,
          // treat it as a normal non-module script.
          if (parseResult.isModule) {
            source = 'system.define(\'' + normalizedName +
                     '\', function(system) {\n' +
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
            // may just be a script that does not call system.define()
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

    // Parse for dependencies in the factory, and any System.define
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
        // create system var and call factory
        // TODO: is this the right thing to create?
        // What about custom hooks, they should be passed down?
        var system = new ModuleLoader({
          parent: loader,
          refererName: load.name,
          _knownLocalModules: parseResult.localModules
        });

        try {
          load._factory(system);
        } catch(e) {
          return load.reject(e);
        }

        Promise.cast().then(function () {
          if (hasProp(system, '_exportsFromLocal')) {
            // Need to wait for local define to resolve,
            // so set a listener for it now.
            var localName = system._exportsFromLocal,
                load = system._loads[localName];

            // Enable the local module, since needed to set
            // current module exports
            enable(load);

            return load.whenFulfilled.then(function (value) {
              // Purposely do not return a value, in case the
              // module export is a Promise.
              system._exports = value.exports;
            });
          }
        })
        .then(function() {
          // Get final module value
          var exports = system._exports;

          var moduleDef = loader._modules[load.name] = {
            exports: exports
          };

          // Set _modules object, to include .exports
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

    if (options.createHooks) {
      var hooks = options.createHooks(this);
      hookNames.forEach(function(hookName) {
        this[hookName] = hooks[hookName];
      }.bind(this));
    }

    this._parent = options.parent;
    this._refererName = options.refererName;
    this._modules = {};
    this._loads = {};
    this._fetches = {};

    var instance = this;

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

    this._getCreateLocalLoad = function(normalizedName) {
      var load = hasProp(this._loads, normalizedName) &&
                 this._loads[normalizedName];
      if (!load) {
        load = createLoad(normalizedName);
      }
      return load;
    };

    this._getLoadOrCreateFromTop = function(name) {
      var load;
      if (hasProp(this._loads, name)) {
        load = this._loads[name];
      } else if (this._parent) {
        // Store a local load for it, now that one module
        // in this instance is bound to it, all should.
        // This also ensures a local _modules entry later
        // for all modules in this loader instance
        load = this._parent._getLoadOrCreateFromTop(name);
        if (load) {
          load = createLoad(name, load);
        }
      }
      if (!load) {
        load = createLoad(name);
      }
      return load;
    };

    this._getFetch = function(address) {
      if (hasProp(this._fetches, address)) {
        return this._fetches[address];
      } else if (this._parent) {
        return this._parent._getFetch(address);
      }
    };

    this._pipeline = function(name) {
      return Promise.cast()
        .then(function() {
          // normalize
          return Promise.cast(this.normalize(name));
        }.bind(this))
        .then(function(normalizedName) {
          // locate
          if (hasProp(this._modules, normalizedName)) {
            return this._modules[normalizedName];
          } else {
            var load = this._getLoadOrCreateFromTop(normalizedName);
            enable(load);
            return load.whenFulfilled;
          }
        }.bind(this));
    };

    if (options._knownLocalModules) {
      options._knownLocalModules.forEach(function(localModuleName) {
        createLoad(localModuleName);
      });
    }

    // TODO: enable a debug flag, on script tag? that turns this tracking
    // on or off
    if (system && system._allLoaders) {
      system._allLoaders.push(this);
    }
  };

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
    get: function(name) {
      var normalizedName = this._normIfReferer(name);

      if (this._hasNormalized(normalizedName)) {
        return this._modules[normalizedName].exports;
      } else if (this._parent) {
        return this._parent.get(normalizedName);
      }

      throw new Error('module with name "' +
                      normalizedName + '" does not have an exports');
    },

    set: function(value) {
      if (hasProp(this, '_exportsFromLocal')) {
        throw new Error('system.setFromLocal() already called');
      }

      // TODO: throw if called after module is considered "defined"
      this._exports = value;
    },
    setFromLocal: function(localName) {
      if (hasProp(this, '_exports')) {
        throw new Error('system.set() already called');
      }

      // TODO: throw if called after module is considered "defined"
      this._exportsFromLocal = localName;
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
          return def.exports;
        });
        callback.apply(null, exportArray);
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
             hasProp(this._modules[normalizedName], 'exports');
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

  system = new ModuleLoader();
  // debug stuff
  system._allLoaders = [];
}());
