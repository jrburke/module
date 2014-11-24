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


module.config({
  lifecycle: function(loader) {
    return {
      normalize: function(name, refererName) {
        return loader.normalize(name, refererName).then(function(value) {
          return 'modules/' + value;
        });
      },

      locate: function(entry, extension) {
        console.log('CALLED LOCATE: ' + entry.name);
        return loader.locate(entry, extension).then(function(value) {
          return value.replace(/\.js$/, '.jf');
        });
      },

      fetch: function(entry) {
        return Promise.resolve(sources[entry.address]);
      },

      translate: function(entry) {
        return Promise.resolve(entry.source.replace(/fn/g, 'function'));
      },


      // in-module functions that return synchronous results
      moduleNormalize: function(name, refererName) {
        return 'modules/normalize' + loader.moduleNormalize(name, refererName);
      },

      moduleLocate: function(entry, extension) {
        return loader.moduleLocate(entry, extension).replace(/\.js$/, '.jf');
      }
    };
  }
});
