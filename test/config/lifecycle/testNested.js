sources['modules/c.jf'] = "module.define('e', fn(module) { module.export = fn() { return 'e';}; });\n" +
                          "module.exportDefine(function(module) {" +
                          "module.export = {" +
                          "c: function() { return 'c'; }, d: module('d'), e: module('e')" +
                          "};});"
sources['modules/d.jf'] = 'module.export = fn() { return "d"; };';

skipNormalize['modules/c'] = ['e'];

module.use('a', 'b', 'c', function(a, b, c) {
  doh.register(
    'configLifecycleNested',
    [
      function configLifecycleNested(t){
        t.is('a', a());
        t.is('b', b());
        t.is('c', c.c());
        t.is('d', c.d());
        t.is('e', c.e());
      }
    ]
  );
  doh.run();
}).catch(function(e) {
  console.error(e);
});
