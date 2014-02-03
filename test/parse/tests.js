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
        mangled.get('a');
        mangled.get('a');
        mangled.get('b');
        mangled.set({});
      });

      t.is('a', results.deps[0]);
      t.is('b', results.deps[1]);
      t.is(2, results.deps.length);
      t.is(0, results.localModules.length);

      // Has localModules
      results = parse.fromFactory(function(system) {
        system.get('d');

        system.define('d', function(system) {
          system.get('shouldNotBeVisible1');
        });

        system.get('f');

        system.define('g', function(system) {
          system.get('shouldNotBeVisible2');
        });

        system.get('g');

        system.set({});
      });

      t.is('d', results.deps[0]);
      t.is('f', results.deps[1]);
      t.is('g', results.deps[2]);
      t.is(3, results.deps.length);
      t.is('d', results.localModules[0]);
      t.is('g', results.localModules[1]);
      t.is(2, results.localModules.length);
    }
  ]
);
doh.run();
