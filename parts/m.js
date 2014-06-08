var module;
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

  // Easy implementation solution for exportFromLocal for now, but will move
  // to a separate storage area for that factory function later to avoid this.
  var specialExportLocalName = '__@exportFromLocal';

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

  // TODO: probably need to do something different here. For now,
  // at least throw to indicate an error that may be swallowed
  // by a promise flow.
  function globalErrorHandler(err) {
    setTimeout(function() {
      throw err;
    });
  }

  // An intermediary for a dependency. By using this intermediary,
  // cycles can be broken without the actual dependency module
  // value promise (pipelinePromise) from being resolved.
  function DepResolver(name, pipelinePromise) {
    this.name = name;
    this.pipelinePromise = pipelinePromise;

    this.p = new Promise(function(resolve, reject) {
      this.resolve = resolve;
      this.reject = reject;
    }.bind(this));

    // Could get double fulfillment, but promises hide
    // this case, only allow one resolution and discard
    // other fulfillment requests.
    pipelinePromise.then(this.resolve, this.reject);
  }

  DepResolver.prototype = {
    resolveForCycle: function(loaderInstance) {
      // Create a placeholder for the module value if needed.
      if (!hasProp(loaderInstance._modules, this.name)) {
        loaderInstance._modules[this.name] = {};
      }
      this.resolve();
    }
  };

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
          load.deps = parseResult.deps;

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
      load._depResolvers = {};

      // Got define function and dependencies now, so
      // load is considered fully registered.
      loader._registeredCounter -= 1;

      // load dependencies
      Promise.all(normalizedDeps.map(function(dep) {
        // Create an intermediary for the dependency, to allow
        // for cycle resolution if the dependency tree gets stuck.
        var depResolver = new DepResolver(dep, loader._pipeline(dep));
        load._depResolvers[dep] = depResolver;
        return depResolver.p;
      })).then(function() {
        // create module var and call factory
        // TODO: is this the right thing to create?
        // What about custom hooks, they should be passed down?
        var module = new Loader({
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
          if (hasProp(module, '_usesExportFromLocal')) {
            // Need to wait for local define to resolve,
            // so set a listener for it now.
            var load = module._loads[specialExportLocalName];

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

          // Because of cycles, may have a module entry, but the
          // value may not have been set yet.
          var moduleDef = loader._modules[load.name] || {};
          moduleDef.exportValue = exportValue;
          loader._modules[load.name] = moduleDef;

          // Only trigger load module resolution if not already
          // set because of a cycle.
          if (!load._moduleResolved) {
            load._moduleResolve(moduleDef);
          }

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

  function Loader(options) {
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

    mix(module, Loader.prototype, true);

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
    instance._registeredCounter = 0;
    instance._fetches = {};
    instance._dynaLoads = [];

    // Set up top
    instance.top = instance._parent ? instance._parent.top : instance;

    // default export object
    instance._export = {};

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

      instance._registeredCounter += 1;
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

    // Gets the load from this or parent instances
    instance._getLoad = function(name) {
      if (hasProp(instance._loads, name)) {
        return instance._loads[name];
      } else if (instance._parent) {
        // Store a local load for it, now that one module
        // in this instance is bound to it, all should.
        // This also ensures a local _modules entry later
        // for all modules in this loader instance
        return instance._parent._getLoad(name);
      }
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
  // to the Loader instance function.
  Loader.prototype = {
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
    normalize: function(name /*, refererName, refererAddress */) {
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
    set export (value) {
      if (hasProp(this, '_usesExportFromLocal')) {
        throw new Error('module.exportFromLocal() already called');
      }

      this._hasSetExport = true;

      // TODO: throw if called after module is considered "defined"
      this._export = value;
    },
    get export () {
      return this._export;
    },

    exportFromLocal: function(fn) {
      if (hasProp(this, '_hasSetExport')) {
        throw new Error('module.export already set');
      }

      // Shortcut for now, there is a TODO to create dedicated
      // slot vs using a special name.
      this.define(specialExportLocalName, fn);

      // TODO: throw if called after module is considered "defined"
      this._usesExportFromLocal = true;
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
    // module.use('a', 'b', 'c', function (a, b, c){}, function(err){});
    use: function () {
      var callback, errback,
          args = slice(arguments);

      if (typeof args[args.length - 1] === 'function') {
        callback = args.pop();
      }
      if (typeof args[args.length - 1] === 'function') {
        errback = callback;
        callback = args.pop();
      }

      // Guard against duplicate IDs being requested, just complicates
      // code later, results in more array traversals, and is likely
      args.forEach(function(name, i) {
        var index = args.indexOf(name);
        if (index !== -1 && index !== i) {
          throw new Error('Duplicate dependencies to load are not allowed');
        }
      });

      var normalizedArgs,
          uniqueNames = [];

      var p = prim.all(args.map(function(name) {
        return this.normalize(name, this._refererName);
      }.bind(this)))
      .then(function(nArgs) {
        normalizedArgs = nArgs;
        // Get unique names, and only depend on them. It is possible,
        // after normalization, that two different IDs do map to the
        // same normalized module ID given loader config. So, this is
        // not an error condition, but only want the dependency tree
        // to be based on unique values.
        var pipelinePromises = [];
        normalizedArgs.forEach(function(normalizedName) {
          if (uniqueNames.indexOf(normalizedName) === -1) {
            uniqueNames.push(normalizedName);
            pipelinePromises.push(this._pipeline(normalizedName));
          }
        }.bind(this));

        // Track top level loads, used to trace for cycles
        p.deps = uniqueNames;
        this._dynaLoads.push(p);
        this._setWatch();

        return prim.all(pipelinePromises);
      }.bind(this))
      .then(function(moduleDefArray) {
        var finalExports = [];

        // Clear this API call from the track of dynaLoads,
        // no longer an input for cycle breaking.
        this._dynaLoads.splice(this._dynaLoads.indexOf(p), 1);
        if (!this._dynaLoads.length) {
          clearTimeout(this._watchId);
          this._watchId = 0;
        }

        // Expand unique exports to the final set of callback arguments.
        normalizedArgs.forEach(function(normalizedName) {
          var defIndex = uniqueNames.indexOf(normalizedName);
          finalExports.push(moduleDefArray[defIndex].exportValue);
        });

        callback.apply(null, finalExports);
        return finalExports;
      }.bind(this));

      if (errback) {
        p.catch(errback);
      } else {
        p.catch(globalErrorHandler);
      }

      return p;
    },

    _setWatch: function() {
      // The choice of this timeout is arbitrary. Do not wan it
      // to fire too frequently given all the async promises,
      // but do not want it to go too long.
      this._watchId = setTimeout(this._watch.bind(this), 25);
    },

    // Watch for error timeouts, cycles
    _watch: function() {
      this._watchId = 0;
      // Do not bother if modules are still registering.
      if (this._registeredCounter) {
        this._setWatch();
        return;
      }

      // Scan for timeouts, but only if a wait interval is set.
      if (this._waitInterval) {
        var now = Date.now(),
            hasExpiredLoads = false,
            waitInterval = this._waitInterval;

        this._loads.forEach(function(load) {
          if (!load._moduleResolved &&
              load._startTime + waitInterval < now) {
            load.reject(new Error('module timeout: ' + load.name));
          }
        });

        // Since some expired, then bail. This may be too
        // coarse-grained of an action to take.
        if (hasExpiredLoads) {
          return;
        }
      }

      // Break cycles. Go backwards in the dynaLoads since as
      // they are resolved, they are removed from the dynaLoads
      // array. While unlikely they will remove themselves during
      // this for loop given the async promise resolution, just
      // doing it to be safe.
      for (var i = this._dynaLoads.length - 1; i > -1; i--) {
        this._breakCycle(this._dynaLoads[i], {}, {});
      }

      // If still have some dynamic loads waiting, keep periodically
      // checking.
      if (this._dynaLoads.length) {
        this._setWatch();
      }
    },


    _breakCycle: function(load, traced, processed) {
      var name = load.name;

      if (name) {
        traced[name] = true;
      }

      if (!load._moduleResolved && load.deps.length) {
        load.deps.forEach(function (depName) {
          var depLoad = this._getLoad(depName);

          if (depLoad && !depLoad._moduleResolved && !processed[depName]) {
            if (hasProp(traced, depName)) {
              // Fake the resolution of this dependency for the module,
              // by asking the DepResolver to pretend it is done. Only
              // want to pretend the dependency is done for this cycle
              // though. Other modules depending on this dependency
              // should get the opportunity to get the real module value
              // once this specific cycle is resolved.
              load._depResolvers[depName].resolveForCycle(load._loader);
            } else {
              this._breakCycle(depLoad, traced, processed);
            }
          }
        }.bind(this));
      }

      if (name) {
        processed[name] = true;
      }
    },
/*
todo:
waitInterval config
 */

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
      return hasProp(this._modules, normalizedName);
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

  module = new Loader();
  var topModule = module;
  // debug stuff
  module._allLoaders = [];
}());
