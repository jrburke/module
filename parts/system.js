
var system, ModuleLoader;
(function() {
  'use strict';

  // INSERT prim

  // START wrapping for esprima
  var esprima;
  (function() {
    var exports = {};
    // INSERT esprima
    esprima = exports.esprima;
  });
  // END wrapping for esprima

  var Promise = prim,
      aslice = Array.prototype.slice;

  var hookNames = ['normalize', 'locate', 'fetch', 'translate', 'instantiate'],
      sysDefineRegExp = /system\s*\.\s*define\s*\(/;

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
      xhr.onreadystatechange = function(evt) {
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


//TODO parentLoad

      var load = {
        name: normalizedName,
        metadata: {},
        address: undefined,
        source: undefined
      };

      load.whenFulfilled = new Promise(function(resolve, reject) {
          load._moduleResolve = resolve;
          load._fetchResolve = function() {
            load._fulfilled = true;
            if (load._enabled) {
              instance._enable(load.name);
            }
          };
          load.reject = reject;
        });

      return (instance._loads[normalizedName] = load);
    }

    function createFetch(normalizedName, address, fetched) {
      var fetch = {
        onAvailable: function(normalizedName, load) {
          result.then(load._fetchResolve, load.reject);
        }
      };

      var result = new Promise(function(resolve, reject) {

        var load = instance._loads[normalizedName];

        Promise.cast(fetched)
          .then(function(source) {
            load.source = source;
            return instance.translate(load);
          })
          .then(function(source) {
            load.source = source;
            // TODO: make the detection fancier here.
            // For instance, detect for system.get use outside
            // of a system.define, and if so, then wrap it.
            if (!sysDefineRegExp.test(source)) {
              source = 'system.define(\'' + normalizedName +
                       '\', function(system) {\n' +
                       source +
                       '\n});';
            }
            source += '\r\n//# sourceURL=' + address;

            instance.eval(source);
            resolve();
          })
          .catch(reject);
      });

      return (instance._fetches[address] = fetch);
    }

    this._getCreateLocalLoad = function(normalizedName) {
      var load = hasProp(this._loads, normalizedName) &&
                 this._loads[normalizedName];
      if (!load) {
        load = createLoad(normalizedName);
      }
      return load;
    };

    this._getCreateParentLoad = function(name) {
      var load;
      if (hasProp(this._loads, name)) {
        load = this._loads[name];
      } else if (this._parent) {
        // Store a local load for it, now that one module
        // in this instance is bound to it, all should.
        // This also ensures a local _modules entry later
        // for all modules in this loader instance
        load = this._parent._getCreateParentLoad(name);
        if (load) {
          load = createLoad(name, load);
        }
      }
      if (!load) {
        load = createLoad(name);
      }
    };

    this._getFetch = function(address) {
      if (hasProp(this._fetches, address)) {
        return this._fetches[address];
      } else if (this._parent) {
        return this._parent._getFetch(address);
      }
    };

    this._enable = function(name) {
      // TODO look for waiting to be defined name in this loader,
      // but also look in parent loader defines.
      //return a promise that gives back the final module value.
      var load = this._loads[name];
      load._enabled = true;
      if (!load._fulfilled) {
        return;
      }

      // Parse for dependencies in the factory, and any System.define
      // calls for local modules.
      load.deps = [];
      var parseResult = parse.fromFactory(load._factory);

      // Convert to normalized names
      Promise.all(parseResult.deps.map(function(dep) {
        return this.normalize(dep, this._refererName);
      }.bind(this)))
      .then(function(normalizedDeps) {
        // Reduce dependencies to a unique set
        normalizedDeps.forEach(function(normalizedDep) {
          if (load.deps.indexOf(normalizedDep) === -1) {
            load.deps.push(normalizedDep);
          }
        });

        // load dependencies
        Promise.all(load.deps.map(function(dep) {
          return this._pipeline(dep);
        }.bind(this))).then(function() {
          // create system var and call factory
          // TODO: is this the right thing to create?
          // What about custom hooks, they should be passed down?
          var system = new ModuleLoader({
            parent: this,
            refererName: load.name,
            _knownLocalModules: parseResult.localModules
          });

          try {
            load._factory(system);
          } catch(e) {
            return load.reject(e);
          }

          // Get final module value
          var exports = system._exports;

          this._modules[load.name] = {
            exports: exports
          };

          // Set _modules object, to include .exports
          // resolve the final promise on the load
          load._moduleResolve(exports);

          // TODO: clean up the load, remove it so it can be garbage collected,
          // by calling then on the whenFulfilled thing. Is this safe to do
          // though? promise microtasks and the load reference that is used
          // across async calls in _pipeline might make it a bad idea.
        }.bind(this))
        .catch(load.reject);
      }.bind(this))
      .catch(load.reject);
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
            return this._modules[normalizedName].exports;
          } else if (hasProp(this._loads, normalizedName)) {
            return this._loads[normalizedName].whenFulfilled;
          } else {
            var load = createLoad(normalizedName);

            return Promise.cast(this.locate(load))
              .then(function(address) {
                load.address = address;

                var fetch = this._getFetch(address);
                if (!fetch) {
                  fetch = createFetch(normalizedName,
                                      address,
                                      this.fetch(load));
                }
                fetch.onAvailable(normalizedName, load);
                this._enable(normalizedName);
                return load.whenFulfilled;
              }.bind(this));
          }
        }.bind(this));
    };

    if (options._knownLocalModules) {
      options._knownLocalModules.forEach(function(localModuleName) {
        createLoad(localModuleName);
      });
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
      // TODO: throw if this called after the factory has run.
      this._exports = value;
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
      if (load._enabled) {
        this._enable(name);
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
      .then(function(exportArray) {
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
}());
