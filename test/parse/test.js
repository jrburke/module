/*global parse */

/*
function fetch(path) {
  var xhr = new XMLHttpRequest();
  xhr.responseType = 'text';
  xhr.send(null);
  return xhr.responseText;
}

function toAst(path) {
  var astRoot = esprima.parse(fetch(path));
}
*/

doh.register(
  'parseTests',
  [
    function parseTests(t){

      // Just has deps, minify-mangled name
      var results = parse.fromFactory(function(mangled) {
        mangled('a');
        mangled('a');
        mangled('b');
        mangled.export = {};
      });

      t.is('a', results.deps[0]);
      t.is('b', results.deps[1]);
      t.is(2, results.deps.length);
      t.is(0, results.localModules.length);

      // Has localModules
      results = parse.fromFactory(function(module) {
        module('d');

        module.define('d', function(module) {
          module('shouldNotBeVisible1');
        });

        module('f');

        module.define('g', function(module) {
          module('shouldNotBeVisible2');
        });

        module('g');

        module.export = {};
      });

      t.is('d', results.deps[0]);
      t.is('f', results.deps[1]);
      t.is('g', results.deps[2]);
      t.is(3, results.deps.length);
      t.is('d', results.localModules[0]);
      t.is('g', results.localModules[1]);
      t.is(2, results.localModules.length);

      // dependency in an object literal
      var text = 'module.export = { name: \'a\', b: module(\'b\') };';
      results = parse.fromBody(text, 'module');

      t.is('b', results.deps[0]);
      t.is(1, results.deps.length);
    }
  ]
);
doh.run();
