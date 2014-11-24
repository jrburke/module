/*global sources */

// Add entries to the sources object in config/lifecycle/config.js
// End result for source that is evaluated is like:
// module.export = function() { return "aon"; };
sources['modules/aon.jfon'] = 'fn2() { return "a"; };';
sources['modules/bon.jfon'] = 'fn2() { return "b"; };';


module.on('normalize', function(event) {
  event.result = event.result += 'on';
});

module.on('locate', function(event) {
  event.result += 'on';
});

module.on('fetch', function(event) {
  event.result = 'module.export = ' + event.result;
});

module.on('translate', function(event) {
  event.result = event.result.replace(/return "(\w)"/, function(match, ch) {
    return 'return "' + ch + 'on"';
  });
});

module.use('a', 'b', function(a, b) {
  doh.register(
    'onWithLifecycle',
    [
      function onWithLifecycle(t){
        t.is('aon', a());
        t.is('bon', b());
      }
    ]
  );
  doh.run();
}).catch(function(e) {
  console.error(e);
});
