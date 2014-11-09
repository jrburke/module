module.on('normalize', function(event) {
  event.result = event.result === 'c' ? 'c/minor' : event.result;
});

module.on('locate', function(event) {
  event.result += '?cachebust=2';
});


module.define('c/minor', function(module) {
  module.export = {
    name: 'c/minor'
  };
});


module.define('a', function(module) {
  module.export = {
    c: module('c'),
    path: module.locate('test', 'js')
  };
});

module.use('a', function(a) {
  doh.register(
    'on',
    [
      function on(t){
        t.is('c/minor', a.c.name);
        t.is('test.js?cachebust=2', a.path);
      }
    ]
  );
  doh.run();
}).catch(function(e) {
  console.error(e);
});
