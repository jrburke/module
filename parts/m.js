var module;
(function(global) {
  function globalEval(sourceText) {
    global.eval(sourceText);
  }

  // NOT using strict in here, since eval is used and the evaled code may not
  // be strict-compliant.

  // INSERT prim

  // START wrapping for esprima
  var esprima = {};
  (function() {
    var exports = esprima;
    // INSERT esprima-harmony
  }());
  // END wrapping for esprima

  // INSERT parse

  var Promise = prim,
      aslice = Array.prototype.slice,
      _allLoaders = [],
      isDebug = true,
      instanceCounter = 0,
      pluginSeparator = '!';

  var publicModuleApis = ['exportDefine', 'define', 'use', 'has', 'delete'];

  // Easy implementation solution for exportDefine for now, but will move
  // to a separate storage area for that factory function later to avoid this.
  var specialExportLocalName = '__@exportDefine';

  var hasOwn = Object.prototype.hasOwnProperty;
  function hasProp(obj, prop) {
      return hasOwn.call(obj, prop);
  }

  function getOwn(obj, prop) {
      return hasProp(obj, prop) && obj[prop];
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

  function deepPropMix(dest, key, value) {
    // This test probably not spec shiny
    if (typeof value === 'object' && value &&
           !Array.isArray(value) && typeof value !== 'function' &&
           !(value instanceof RegExp)) {
      if (!dest[key]) {
          dest[key] = {};
      }
      deepSimpleMix(dest[key], value);
    } else {
      dest[key] = value;
    }
  }

  /**
   * Does a deep mix of source into dest, where source values override
   * dest values if a winner is needed. Simple mix, for
   * @param  {Object} dest destination object that receives the mixed
   * values.
   * @param  {Object} source source object contributing properties to mix
   * in.
   * @return {[Object]} returns dest object with the modification.
   */
  function deepSimpleMix(dest, source) {
    Object.keys(source).forEach(function(key) {
      var value = source[key];
      deepPropMix(dest, key, value);
    });

    return dest;
  }

  /**
   * Trims the . and .. from an array of ID segments.
   * Throws if it ends up with a '..' at the beginning. This is about resolving
   * IDs, and '..' at the beginning of an absolute ID does not make sense.
   * NOTE: this method MODIFIES the input array.
   * @param {Array} ary the array of path segments.
   */
  function trimDots(ary) {
      var i, part;
      for (i = 0; i < ary.length; i++) {
          part = ary[i];
          if (part === '.') {
              ary.splice(i, 1);
              i -= 1;
          } else if (part === '..') {
              // If at the start, or previous value is still ..,
              // keep them so that when converted to a path it may
              // still work when converted to a path, even though
              // as an ID it is less than ideal. In larger point
              // releases, may be better to just kick out an error.
              if (i === 0) {
                  throw new Error('Cannot resolve ID segment: ' +
                                   ary.join('/') +
                                   ', .. is outside module ID space');
              } else if (i > 0) {
                  ary.splice(i - 1, 2);
                  i -= 2;
              }
          }
      }
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
  // cycles can be broken without the actual dependency
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

  function createFetch(loader, entry) {
    var normalizedName = entry.name,
        address = entry.address;

    var fetch = loader.fetch(entry)
    .then(function(source) {
      entry.source = source;
      return loader.translate(entry);
    })
    .then(function(source) {
      try {
        var parseResult = parse.fromBody(source, 'module');
        entry.parseResult = parseResult;

        // If it looks like a module body, then wrap
        // in a module body function wrapper. Otherwise,
        // treat it as a normal non-module script.
        if (parseResult.isModule) {
          source = 'module.define(\'' + normalizedName +
                   '\', function(module) { ' +
                   '\'use strict\'; ' +
                   source +
                   '\n});';
        }
        source += '\r\n//# sourceURL=' + address;

        if (parseResult.isModule) {
          loader.eval(source);
        } else {
          globalEval(source);
          // For scripts that are not module bodies, indicate they have finished
          // loading.
          loader.define(normalizedName, function() {});
        }
      } catch(e) {
        var err = new Error('Parse/eval error for "' + entry.name +
                            '": ' + e);
        err.originalError = e;
        throw err;
      }
    });

    return (loader._fetches[address] = fetch);
  }

  function enable(entry) {
    if (entry._parentEntry) {
      return enable(entry._parentEntry);
    }

    var loader = entry._loader._parent || entry._loader;

    entry._callEnableOnDefine = true;

    if (!entry._registered) {
      entry._fetching = true;
      loader.locate(entry, 'js')
        .then(function(address) {
          entry.address = address;

          var fetch = loader._getFetch(address);
          if (!fetch) {
            fetch = createFetch(loader, entry);
          }

          return fetch.then(function() {
            // Need to call _registered here because loaded thing
            // may just be a script that does not call module.define()
            if (!entry.parseResult && !entry.parseResult.isModule) {
              entry._registered = true;
            }
            entry._fetching = false;
          });
        })
        .then(function(){
          enable(entry);
        })
        .catch(entry.reject);
      return;
    }

    if (entry._fetching || entry._enabled) {
      return;
    }
    entry._enabled = true;
    entry._callEnableOnDefine = false;

    // Parse for dependencies in the factory, and any module.define
    // calls for local modules.
    var parseResult = entry.parseResult;

    if (!parseResult && entry._factory) {
      try {
        parseResult = parse.fromFactory(entry._factory);
        entry.parseResult = parseResult;
      } catch (e) {
        var err = new Error('Parse error for "' + entry.name + '": ' + e);
        err.originalError = e;
        return entry.reject(e);
      }
    }

    // A plain script, no dependencies are detectable,
    // so just proceed as if none.
    if (!parseResult) {
      parseResult = { deps: [] };
    }

    // Convert to normalized names
    Promise.all(parseResult.deps.map(function(dep) {
      return loader.normalize(dep, entry.name);
    }))
    .then(function(normalizedDeps) {
      entry.deps = normalizedDeps;

      entry._depResolvers = {};

      // Got define function and dependencies now, so
      // entry is considered fully registered.
      loader._registeredCounter -= 1;

      // load dependencies
      Promise.all(normalizedDeps.map(function(dep) {
        // Create an intermediary for the dependency, to allow
        // for cycle resolution if the dependency tree gets stuck.
        var depResolver = new DepResolver(dep, loader._whenResolvedModule(dep));
        entry._depResolvers[dep] = depResolver;
        return depResolver.p;
      })).then(function() {
        // Get module var and call factory
        var localPrivateLoader = entry._loader,
            localModuleApi = localPrivateLoader.moduleApi;

        if (parseResult.localModules) {
          parseResult.localModules.forEach(function(localModuleName) {
            localPrivateLoader.createEntry(localModuleName);
          });
        }

        if (entry._cyclePhantoms) {
          entry._factory = parse.insertPhantoms(entry._factory,
                                                entry._cyclePhantoms);
        }

        try {
          entry._factory(localModuleApi);
        } catch(e) {
          return entry.reject(e);
        }

        Promise.resolve().then(function () {
          if (hasProp(localPrivateLoader, '_usesExportDefine')) {
            // Need to wait for local define to resolve,
            // so set a listener for it now.
            var entry = localPrivateLoader._entries[specialExportLocalName];

            // Enable the local module, since needed to set
            // current module export
            enable(entry);

            return entry.whenFulfilled.then(function (value) {
              // Purposely do not return a value, in case the
              // module export is a Promise.
              localPrivateLoader._export = value.exportValue;
            });
          }
        })
        .then(function() {
          // Get final module value
          var exportValue = localPrivateLoader._export;

          // Because of cycles, may have a module entry, but the
          // value may not have been set yet.
          var moduleDef = loader._modules[entry.name] || {};
          moduleDef.exportValue = exportValue;
          loader._modules[entry.name] = moduleDef;

          // Only trigger module resolution if not already
          // set because of a cycle.
          if (!entry._moduleResolved) {
            entry._moduleResolve(moduleDef);
          }

          // TODO: clean up the entry, remove it so can be garbage collected,
          // by calling then on the whenFulfilled thing. Is this safe to do
          // though? promise microtasks and the entry reference that is used
          // across async calls in pipeline might make it a bad idea.
        })
        .catch(entry.reject);
      })
      .catch(entry.reject);
    })
    .catch(entry.reject);
  }


  function Loader(options) {
    return createLoaderPair(options).moduleApi;
  }

  // Specified as a prototype, but these values are just mixed in
  // to the Loader instance function.
  Loader.prototype = {
    // START module lifecycle events
    _normalize: function(wantSync, name, refererName) {
      var result, nameSegment, i, j, aliasValue, foundAlias, foundI,
          foundStarAlias, starI,
          pluginIndex = name.indexOf('!');

      if (pluginIndex === -1) {

        var nameParts = name.split('/'),
            refParts = refererName && refererName.split('/');

        if (nameParts[0].charAt(0) === '.') {
          if (refererName) {
            //Convert refererName to array, and lop off the last part,
            //so that . matches that 'directory' and not name of the
            // refererName's module. For instance, refererName of
            // 'one/two/three', maps to 'one/two/three.js', but we want the
            // directory, 'one/two' for this normalization.
            nameParts = refParts.slice(0, refParts.length - 1)
                        .concat(nameParts);
          } else if (name.indexOf('./') === 0) {
            // Just trim it off, already at the top of the module ID space.
            nameParts[0] = nameParts[0].substring(2);
          } else {
            throw new Error('Invalid ID, oustide of the module ID space: ' +
                            name);
          }
        }

        trimDots(nameParts);

        //Apply alias config if appropriate.
        var alias = this.options.alias,
            starAlias = alias && alias['*'];

        if (alias && (refParts || starAlias)) {
          outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
            nameSegment = nameParts.slice(0, i).join('/');

            // alias config is keyed off the refereName, so use its parts to
            // find a refName-specific config.
            if (refParts) {
              //Find the longest refName segment match in the config.
              //So, do joins on the biggest to smallest lengths of refParts.
              for (j = refParts.length; j > 0; j -= 1) {
                aliasValue = getOwn(alias, refParts.slice(0, j).join('/'));

                //refName segment has config, find if it has one for
                //this name.
                if (aliasValue) {
                  aliasValue = getOwn(aliasValue, nameSegment);
                  if (aliasValue) {
                    //Match, update name to the new value.
                    foundAlias = aliasValue;
                    foundI = i;
                    break outerLoop;
                  }
                }
              }
            }

            //Check for a star map match, but just hold on to it,
            //if there is a shorter segment match later in a matching
            //config, then favor over this star map.
            if (!foundStarAlias && starAlias &&
                getOwn(starAlias, nameSegment)) {
              foundStarAlias = getOwn(starAlias, nameSegment);
              starI = i;
            }
          }

          if (!foundAlias && foundStarAlias) {
            foundAlias = foundStarAlias;
            foundI = starI;
          }

          if (foundAlias) {
            nameParts.splice(0, foundI, foundAlias);
          }
        }

        name = nameParts.join('/');

        // If the name points to a package's name, use the package main instead.
        var pkgMain = getOwn(this.options._mainIds,
                             name);

        result = pkgMain || name;
        return wantSync ? result : Promise.resolve(result);
      } else {
        // Plugin time
        var pluginId = name.substring(0, pluginIndex),
            resourceId = name.substring(pluginIndex + 1),
            normalizedPluginId = this.normalize(pluginId,
                                                refererName);

        if (typeof normalizedPluginId !== 'string') {
          throw new Error('Normalization of plugin ID needs to complete ' +
                          'synchronously for: ' + name);
        }

        if (wantSync) {
          if (this._hasNormalized(normalizedPluginId)) {
            var mod = this._getModuleNormalized(normalizedPluginId);
            return (mod.moduleNormalize ? mod : this)
                    .moduleNormalize(resourceId, refererName);
          } else {
            throw new Error(normalizedPluginId + ' needs to be loaded before ' +
                           'it can be used in a module.normalize call');
          }
        } else {
          return this.use(normalizedPluginId).then(function(mod) {
            return (mod.normalize ? mod : this)
                    .normalize(resourceId, refererName);
          });
        }
      }
    },

    normalize: function(name, refererName) {
      return this._normalize(false, name, refererName);
    },

    moduleNormalize: function(name, refererName) {
      return this._normalize(true, name, refererName);
    },

    _locate: function(wantSync, entry, extension) {
      // entry: name, metadata
      var segment, pluginId, resourceId, name, separatorIndex,
          location, slashIndex,
          normalizedLocations = this.options._normalizedLocations;

      segment = name = entry.name;
      separatorIndex = name.indexOf(pluginSeparator);

      if (separatorIndex == -1) {
        var firstPass = true;
        while(segment) {
          // If not the first pass match, then look for id + '/' matches,
          // for location config that only matches children of a higher
          // level ID. So locations config for 'a/b/' should only match 'a/b/c'
          // and not 'a/b'.
          if (!firstPass) {
            var segmentPlusSlash = segment + '/';
            if (hasProp(normalizedLocations, segmentPlusSlash)) {
              location = normalizedLocations[segmentPlusSlash];
              location = name.replace(segmentPlusSlash, location + '/');
              break;
            }
          }
          if (hasProp(normalizedLocations, segment)) {
            location = name.replace(segment, normalizedLocations[segment]);
            break;
          }
          slashIndex = segment.lastIndexOf('/');
          if (slashIndex === -1) {
            break;
          }
          firstPass = false;
          segment = segment.substring(0, slashIndex);
        }

        if (!location) {
          location = name;
        }

        location = (location.charAt(0) === '/' ||
                    location.match(/^[\w\+\.\-]+:/) ?
                    '' : this.options.baseUrl) + location;

        if (extension && location.indexOf('data:') !== 0) {
          location += '.' + extension;
        }

        return wantSync ? location : Promise.resolve(location);
      } else {
        // Use plugin to locate
        pluginId = name.substring(0, separatorIndex);
        resourceId = name.substring(separatorIndex + 1);

        if (wantSync) {
          if (this._hasNormalized(pluginId)) {
            var mod = this._getModuleNormalized(pluginId);
            return (mod.moduleLocate ? mod : this).moduleLocate({
                     name: resourceId
                   }, extension);
          } else {
            throw new Error(pluginId + ' needs to be loaded before ' +
                           'it can be used in a module.locate call');
          }
        } else {
          return this.use(pluginId).then(function(mod) {
            return (mod.locate ? mod : this).locate({
                     name: resourceId
                   }, extension);
          });
        }

      }
    },

    locate: function(name, refererName) {
      return this._locate(false, name, refererName);
    },

    moduleLocate: function(name, refererName) {
      return this._locate(true, name, refererName);
    },

    fetch: function(entry) {
      // entry: name, metadata, address

      return fetchText(entry.address);
    },

    translate: function(entry) {
      //entry: name, metadata, address, source

      return entry.source;
    }
    // END module lifecycle events
  };

  function PrivateLoader(options, parent) {
    this._parent = parent;
    this._refererName = options.refererName;
    this._modules = {};
    this._entries = {};
    this._registeredCounter = 0;
    this._fetches = {};
    this._dynaEntries = [];

    this._instanceId = 'id' + (instanceCounter++);

    if (isDebug) {
      console.log('PrivateLoader: ' +
                  this._refererName + ':' + this._instanceId +
                  ', parent: ' + (parent && parent._refererName) +
                   ':' +
                    ((parent && parent._refererName &&
                     this._refererName_instanceId) || ''));
    }

    // Set up top
    this.top = this._parent ? this._parent.top : this;

    // default export object
    this._export = {};

    if (this._parent) {
      this.options = this._parent.options;
    } else {
      this.options = {
        // private properties
        _normalizedLocations: {},
        _mainIds: {},

        // Properties that map directly to public config. alias is not set up
        // by default to make it easy to detect if it should be applied in
        // normalize.
        baseUrl: '',
        locations: {},
        moduleConfig: {}
      };
    }
  }

  PrivateLoader.prototype = Object.create(Loader.prototype);

  mix(PrivateLoader.prototype, {
    _privateConfigNames: {
      _normalizedLocations: true,
      _mainIds: true
    },

    config: function(options) {
      var opts = this.options;

      Object.keys(options).forEach(function(key) {
        if (hasProp(this._privateConfigNames, key)) {
          return;
        }

        var value = options[key];
        if (options.createHooks) {
          // Wire up hooks
          var hooks = options.createHooks(this);
          var module = this.moduleApi;
          Object.keys(hooks).forEach(function(key) {
            module[key] = hooks[key];
          });
        } else if (key === 'locations') {
          // Look for a package
          var normalizedLocations = opts._normalizedLocations;
          var mainIds = opts._mainIds;

          Object.keys(value).forEach(function(locKey) {
            var mainId,
                locValue = value[locKey];

            // locValues cannot end in a /, this is just sanitation.
            if (locValue && typeof locValue === 'string' &&
                locValue.lastIndexOf('/') === locValue.length - 1) {
              locValue = locValue.substring(0, locValue.length - 1);
            }

            // Update public-matching config inside loader, then break it
            // apart for more efficient internal use.
            opts.locations[locKey] = locValue;

            // Separate the main sub-ID for a package, if specified
            var keyParts = locKey.split('{');
            if (keyParts.length === 2) {
              locKey = keyParts[0];
              mainId = locKey + '/' +
                       keyParts[1].substring(0, keyParts[1].length - 1);
            }

            if (locValue === null || locValue === false) {
              delete normalizedLocations[locKey];
              delete mainIds[locKey];
            } else {
              normalizedLocations[locKey] = locValue;

              if (mainId) {
                mainIds[locKey] = mainId;

                // If a locKey/ value specified, delete it, package config
                // takes precedence
                delete normalizedLocations[locKey + '/'];
              } else {
                // This new plain path config is now the config, remove any
                // package config if it existed before.
                if (hasProp(mainIds, locKey)) {
                  delete mainIds[locKey];
                  if (locKey.lastIndexOf('/') === locKey.length - 1) {
                    delete normalizedLocations[locKey.substring(0,
                                                      locKey.length - 1)];
                  }
                }
              }
            }
          });
        } else if (key === 'baseUrl') {
          // Make sure it ends in a slash for easy concatenation later.
          if (value.lastIndexOf('/') !== value.length - 1) {
            value += '/';
          }
          opts[key] = value;
        } else {
          deepPropMix(opts, key, options[key]);
        }
      }.bind(this));
    },

    createEntry: function(normalizedName, parentEntry) {
      if (isDebug) {
        console.log('Entry: ' + normalizedName +
                    ' in ' + this._refererName + ':' + this._instanceId);
      }

      var entry = {
        name: normalizedName,
        metadata: {},
        address: undefined,
        source: undefined,
        _loader: createLoaderPair({
          refererName: normalizedName
        }, this).privateLoader
      };

      entry.whenFulfilled = new Promise(function(resolve, reject) {
        entry._moduleResolve = function(value) {
          entry._moduleResolved = true;
          resolve(value);
        };

        entry.reject = reject;
      });

      if (parentEntry) {
        entry._parentEntry = parentEntry;
        parentEntry.whenFulfilled.then(entry._moduleResolve);
      }

      this._registeredCounter += 1;
      return (this._entries[normalizedName] = entry);
    },

    _getCreateLocalEntry: function(normalizedName) {
      var entry = hasProp(this._entries, normalizedName) &&
                 this._entries[normalizedName];
      if (!entry) {
        entry = this.createEntry(normalizedName);
      }
      return entry;
    },

    // Gets the entry from this or parent instances
    _getEntry: function(name) {
      if (hasProp(this._entries, name)) {
        return this._entries[name];
      } else if (this._parent) {
        // Store a local entry for it, now that one module
        // in this instance is bound to it, all should.
        // This also ensures a local _modules entry later
        // for all modules in this loader instance
        return this._parent._getEntry(name);
      }
    },

    _getEntryOrCreateFromTop: function(name) {
      var entry = this._getEntry(name);
      if (!entry) {
        entry = this.top.createEntry(name);
      }
      return entry;
    },

    _getFetch: function(address) {
      if (hasProp(this._fetches, address)) {
        return this._fetches[address];
      } else if (this._parent) {
        return this._parent._getFetch(address);
      }
    },

    _whenResolvedModule: function(normalizedName) {
      if (hasProp(this._modules, normalizedName)) {
        return Promise.resolve(this._modules[normalizedName]);
      } else {
        var entry = this._getEntryOrCreateFromTop(normalizedName);
        enable(entry);
        return entry.whenFulfilled;
      }
    },

    _hasOwnNormalized: function(normalizedName) {
      return hasProp(this._modules, normalizedName);
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
            hasExpiredEntries = false,
            waitInterval = this._waitInterval;

        this._entries.forEach(function(entry) {
          if (!entry._moduleResolved &&
              entry._startTime + waitInterval < now) {
            entry.reject(new Error('module timeout: ' + entry.name));
          }
        });

        // Since some expired, then bail. This may be too
        // coarse-grained of an action to take.
        if (hasExpiredEntries) {
          return;
        }
      }

      // Break cycles. Go backwards in the dynaEntries since as
      // they are resolved, they are removed from the dynaEntries
      // array. While unlikely they will remove themselves during
      // this for loop given the async promise resolution, just
      // doing it to be safe.
      for (var i = this._dynaEntries.length - 1; i > -1; i--) {
        this._breakCycle(this._dynaEntries[i], {}, {});
      }

      // If still have some dynamic loads waiting, keep periodically
      // checking.
      if (this._dynaEntries.length) {
        this._setWatch();
      }
    },

    _breakCycle: function(entry, traced, processed) {
      var name = entry.name;

      if (name) {
        traced[name] = true;
      }

      if (!entry._moduleResolved && entry.deps && entry.deps.length) {
        entry.deps.forEach(function (depName) {
          var depEntry = this._getEntry(depName);

          if (depEntry && !depEntry._moduleResolved && !processed[depName]) {
            if (hasProp(traced, depName)) {
              // Fake the resolution of this dependency for the module,
              // by asking the DepResolver to pretend it is done. Only
              // want to pretend the dependency is done for this cycle
              // though. Other modules depending on this dependency
              // should get the opportunity to get the real module value
              // once this specific cycle is resolved.
              entry._depResolvers[depName].resolve();
            } else {
              this._breakCycle(depEntry, traced, processed);
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
      var module = this.moduleApi;
      eval(sourceText);
    },

    _getModuleNormalized: function(normalizedName) {
      var entry = this._getEntry(normalizedName);

      if (entry) {
        // For cycles, use the original export, unless the
        // module has been fully resolved.
        if (entry._moduleResolved) {
          return entry._loader._export;
        } else {
          // NOTE: here is where a special proxy or something could go
          // to improve cycles.
          return entry._loader._export;
        }
      }

      throw new Error('module with name "' +
                      normalizedName + '" does not have an export');
    },

    // START MIRROR OF PUBLIC API
    getModule: function(name) {
      return this._getModuleNormalized(this.moduleNormalize(name,
                                                            this._refererName));
    },

    setExport: function(value) {
      if (hasProp(this, '_usesExportDefine')) {
        throw new Error('module.exportDefine() already called');
      }

      this._hasSetExport = true;

      // TODO: throw if called after module is considered "defined"
      this._export = value;
    },

    exportDefine: function(fn) {
      if (hasProp(this, '_hasSetExport')) {
        throw new Error('module.export already set');
      }

      // Shortcut for now, there is a TODO to create dedicated
      // slot vs using a special name.
      this.define(specialExportLocalName, fn);

      // TODO: throw if called after module is considered "defined"
      this._usesExportDefine = true;
    },

    define: function(name, fn) {
      if (typeof name !== 'string') {
        fn = name;
        this._parent.define(this._refererName, fn);
        return;
      }

      var entry = this._getCreateLocalEntry(name);
      entry._factory = fn;
      entry._registered = true;

      if (entry._callEnableOnDefine) {
        enable(entry);
      }
    },

    use: function() {
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
            pipelinePromises.push(this._whenResolvedModule(normalizedName));
          }
        }.bind(this));

        // Track top level loads, used to trace for cycles
        p.deps = uniqueNames;
        this._dynaEntries.push(p);
        this._setWatch();

        return prim.all(pipelinePromises);
      }.bind(this))
      .then(function(moduleDefArray) {
        var finalExports = [];

        // Clear this API call from the track of dynaEntries,
        // no longer an input for cycle breaking.
        this._dynaEntries.splice(this._dynaEntries.indexOf(p), 1);
        if (!this._dynaEntries.length) {
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

    _hasNormalized: function(normalizedName) {
      if (this._hasOwnNormalized(normalizedName)) {
        return true;
      }

      if (this._parent) {
        return this._parent._hasNormalized(normalizedName);
      }

      return false;
    },

    has: function(name) {
      return this._hasNormalized(this.moduleNormalize(name));
    },

    delete: function(name) {
      var normalizedName = this.moduleNormalize(name);
      if (this._hasOwnNormalized(normalizedName)) {
        delete this._modules[normalizedName];
      } else {
        throw new Error('loader does not have module name: ' + normalizedName);
      }
    }
    // END MIRROR OF PUBLIC API
  });

  function createLoaderPair(options, parentPrivateLoader) {
    options = options || {};

    var privateLoader = new PrivateLoader(options, parentPrivateLoader);

    function module(name) {
      return privateLoader.getModule(name);
    }

    privateLoader.moduleApi = module;

    if (isDebug) {
      module._privateLoader = privateLoader;
    }

    // Set up the other public APIs on the module object
    module.top = privateLoader.top.moduleApi;
    publicModuleApis.forEach(function(name) {
      module[name] = function() {
        return privateLoader[name].apply(privateLoader, arguments);
      };
    });
    mix(module, {
      set export (value) {
        return privateLoader.setExport(value);
      },
      get export () {
        return privateLoader._export;
      }
    }, true);

    module.Loader = Loader;

    module.normalize = function(name) {
      return privateLoader.moduleNormalize(name, privateLoader._refererName);
    };

    module.locate = function(name, extension) {
      // TODO: `metadata` as second arg does not make sense here. Does
      // it make sense anywhere?
      return privateLoader.moduleLocate({
        name: privateLoader.moduleNormalize(name, privateLoader._refererName)
      }, extension);
    };

    if (!parentPrivateLoader) {
      module.config = function(options) {
        return privateLoader.config(options);
      };
    }

    privateLoader.config(options);

    // TODO: enable a debug flag, on script tag? that turns this tracking
    // on or off
    if (isDebug && _allLoaders) {
      _allLoaders.push(module);
    }

    return {
      moduleApi: module,
      privateLoader: privateLoader
    };
  }

  module = new Loader();

  // debug stuff
  if (isDebug) {
    module._allLoaders = _allLoaders;
  }
}(this));
