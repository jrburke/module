/*jshint evil: true */
/*global setTimeout, process, setImmediate */
var system, ModuleLoader;
(function() {
  'use strict';

  var prim;
  //START prim 0.0.6
  /**
   * Changes from baseline prim
   * - removed UMD registration
   */
  (function () {
    var waitingId, nextTick,
      waiting = [];

    function callWaiting() {
      waitingId = 0;
      var w = waiting;
      waiting = [];
      while (w.length) {
        w.shift()();
      }
    }

    function asyncTick(fn) {
      waiting.push(fn);
      if (!waitingId) {
        waitingId = setTimeout(callWaiting, 0);
      }
    }

    function syncTick(fn) {
      fn();
    }

    function isFunObj(x) {
      var type = typeof x;
      return type === 'object' || type === 'function';
    }

    //Use setImmediate.bind() because attaching it (or setTimeout directly
    //to prim will result in errors. Noticed first on IE10,
    //issue requirejs/alameda#2)
    nextTick = typeof setImmediate === 'function' ? setImmediate.bind() :
      (typeof process !== 'undefined' && process.nextTick ?
        process.nextTick : (typeof setTimeout !== 'undefined' ?
          asyncTick : syncTick));

    function notify(ary, value) {
      prim.nextTick(function () {
        ary.forEach(function (item) {
          item(value);
        });
      });
    }

    function callback(p, ok, yes) {
      if (p.hasOwnProperty('v')) {
        prim.nextTick(function () {
          yes(p.v);
        });
      } else {
        ok.push(yes);
      }
    }

    function errback(p, fail, no) {
      if (p.hasOwnProperty('e')) {
        prim.nextTick(function () {
          no(p.e);
        });
      } else {
        fail.push(no);
      }
    }

    prim = function prim(fn) {
      var promise, f,
        p = {},
        ok = [],
        fail = [];

      function makeFulfill() {
        var f, f2,
          called = false;

        function fulfill(v, prop, listeners) {
          if (called) {
            return;
          }
          called = true;

          if (promise === v) {
            called = false;
            f.reject(new TypeError('value is same promise'));
            return;
          }

          try {
            var then = v && v.then;
            if (isFunObj(v) && typeof then === 'function') {
              f2 = makeFulfill();
              then.call(v, f2.resolve, f2.reject);
            } else {
              p[prop] = v;
              notify(listeners, v);
            }
          } catch (e) {
            called = false;
            f.reject(e);
          }
        }

        f = {
          resolve: function (v) {
            fulfill(v, 'v', ok);
          },
          reject: function(e) {
            fulfill(e, 'e', fail);
          }
        };
        return f;
      }

      f = makeFulfill();

      promise = {
        then: function (yes, no) {
          var next = prim(function (nextResolve, nextReject) {

            function finish(fn, nextFn, v) {
              try {
                if (fn && typeof fn === 'function') {
                  v = fn(v);
                  nextResolve(v);
                } else {
                  nextFn(v);
                }
              } catch (e) {
                nextReject(e);
              }
            }

            callback(p, ok, finish.bind(undefined, yes, nextResolve));
            errback(p, fail, finish.bind(undefined, no, nextReject));

          });
          return next;
        },

        catch: function (no) {
          return promise.then(null, no);
        }
      };

      try {
        fn(f.resolve, f.reject);
      } catch (e) {
        f.reject(e);
      }

      return promise;
    };

    prim.resolve = function (value) {
      return prim(function (yes) {
        yes(value);
      });
    };

    prim.reject = function (err) {
      return prim(function (yes, no) {
        no(err);
      });
    };

    prim.cast = function (x) {
      // A bit of a weak check, want "then" to be a function,
      // but also do not want to trigger a getter if accessing
      // it. Good enough for now.
      if (isFunObj(x) && 'then' in x) {
        return x;
      } else {
        return prim(function (yes, no) {
          if (x instanceof Error) {
            no(x);
          } else {
            yes(x);
          }
        });
      }
    };

    prim.all = function (ary) {
      return prim(function (yes, no) {
        var count = 0,
          length = ary.length,
          result = [];

        function resolved(i, v) {
          result[i] = v;
          count += 1;
          if (count === length) {
            yes(result);
          }
        }

        ary.forEach(function (item, i) {
          prim.cast(item).then(function (v) {
            resolved(i, v);
          }, function (err) {
            no(err);
          });
        });
      });
    };

    prim.nextTick = nextTick;
  }());
  //END prim

  var Promise = prim;

  var hookNames = ['normalize', 'locate', 'fetch', 'translate', 'instantiate'],
      sysDefineRegExp = /system\s*\.\s*define\s*\(/;

  var hasOwn = Object.prototype.hasOwnProperty;
  function hasProp(obj, prop) {
      return hasOwn.call(obj, prop);
  }

  ModuleLoader = function ModuleLoader(options) {
    if (options.createHooks) {
      var hooks = options.createHooks(this);
      hookNames.forEach(function(hookName) {
        this[hookName] = hooks[hookName];
      }.bind(this));
    }

    this._parent = options.parent;
    this._refererName = options._refererName;
    this._modules = {};
    this._loads = {};
    this._fetches = {};

    var instance = this;

    function createLoad(normalizedName) {
      var load = {
        name: normalizedName,
        metadata: {},
        address: undefined,
        source: undefined,
        whenFulfilled: new Promise(function(resolve, reject) {
          this.resolve = resolve;
          this.reject = reject;
        }.bind(load))
      };

      return (instance._loads[normalizedName] = load);
    }

    function createFetch(normalizedName, address, fetched) {
      var fetch = {
        onAvailable: function(normalizedName, load) {
          result
            .then(function() {
              return instance._enable(normalizedName);
            })
            .then(load.resolve)
            .catch(load.reject);
        }
      };

      var result = new Promise(function(resolve, reject) {

        Promise.cast(fetched)
          .then(function(source) {
            return instance.translate(source);
          })
          .then(function(source) {
            // TODO: make the detection fancier here.
            // For instance, detect for system.get use outside
            // of a system.define, and if so, then wrap it.
            if (!sysDefineRegExp.test(source)) {
            source = 'system.define(\'' + normalizedName + '\', function(system) {\n' +
                     source +
                     '\n});';
            }
            source += '\r\n//@ sourceURL=' + address;

            instance.eval(source);
            resolve();
          })
          .catch(reject);
      });

      return (instance._fetches[address] = fetch);
    }

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
          } else if (hasProp(this._loads, normalizedName)) {
            return this._loads.whenFulfilled;
          } else {
            var load = createLoad(normalizedName);

            return this.locate(load)
              .then(function(address) {
                load.address = address;

                var fetch = this._getFetch(address);
                if (!fetch) {
                  fetch = createFetch(address, this.fetch(load));
                }
                fetch.onAvailable(normalizedName, load);
                return load.whenFulfilled;
              }.bind(this));
          }
        }.bind(this));
    };
  };

  ModuleLoader.prototype = {
    // START module lifecycle events
    normalize: function(name, refererName, referAddress) {

      // return name
    },

    locate: function(load) {
      // load: name, metadata

      // return address
    },

    fetch: function(load) {
      // load: name, metadata, address

      // returns module source
    },

    translate: function(load) {
      //load: name, metadata, address, source

      // return source or maybe just load object

    },

    // END module lifecycle events

    // START declarative API
    get: function(name) {

    },

    set: function(value) {

    },

    // END declarative API
    define: function(name, deps, fn) {

    },

    import: function () {
      //names, fn
    },

    eval: function(sourceText) {

    },

    has: function (name) {

    },

    delete: function(name) {

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
