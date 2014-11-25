// Idea is to go from:
// normalize: a -> modules/a,
// locate: modules/a.js -> modules/a.jf
// fetch: fetching modules/a.f from storage in here
// translate: replace `fn` with `function`
// moduleNormalize: a -> modules/normalize/a
// moduleLocate: modules/normalize/a.js modules/normalize/a.jfm

var sources = {
  'modules/a.jf' : 'module.export = fn() { return "a"; };',
  'modules/b.jf' : 'module.export = fn() { return "b"; };',
};

// Name value pairs of modules to skip extra normalization. Key is refererName,
// value is array of module IDs to skip. Useful for other tests that use this
// basic config, but have nested definitions, like testNested.js
var skipNormalize  = {};

function applyNormalize(name, refererName, value) {
  var skip = skipNormalize[refererName];
  if (Array.isArray(skip) && skip.indexOf(name) !== -1) {
    return value;
  } else {
    return 'modules/' + value;
  }
}

function applyLocate(value) {
  return value.replace(/\.js$/, '.jf');
}

module.config({
  lifecycle: function(loader) {
    return {
      normalize: function(name, refererName) {
        console.log('NORMALIZE called: ' + name + ', ' + refererName);

        return loader.normalize(name, refererName).then(function(value) {
          var result = applyNormalize(name, refererName, value);

          console.log('NORMALIZE RESULT: ' + result);
          return result;
        });
      },

      locate: function(entry, extension) {
        console.log('CALLED LOCATE: ' + entry.name);

        return loader.locate(entry, extension).then(function(value) {
          var result = value.replace(/\.js$/, '.jf');

          console.log('LOCATE RESULT for ' + entry.name + ': ' + result);
          return result;
        });
      },

      fetch: function(entry) {
        var result = sources[entry.address];

        console.log('CALLED FETCH: ' + entry.address + ': ' + result);
        return Promise.resolve(result);
      },

      translate: function(entry) {
        return Promise.resolve(entry.source.replace(/fn/g, 'function'));
      },


      // in-module functions that return synchronous results
      moduleNormalize: function(name, refererName) {
        var value = loader.moduleNormalize(name, refererName);
        var result = applyNormalize(name, refererName, value);

        console.log('MODULENORMALIZE RESULT: ' + result);
        return result;
      },

      moduleLocate: function(entry, extension) {
        return applyLocate(loader.moduleLocate(entry, extension));
      }
    };
  }
});
