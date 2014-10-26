module.config({
  moduleData: {
    'a/b': {
      color: 'blue'
    },
    'd': {
      size: 'large'
    }
  }
});

module.define('a/b', function(module) {
  module.export = {
    color: module.data.color
  };
});

module.define('d', function(module) {
  module.export = {
    size: module.data.size
  };
});

module.use('a/b', 'd', function(b, d) {
  doh.register(
    'configDataConfig',
    [
      function configDataConfig(t){
        t.is('blue', b.color);
        t.is('large', d.size);
      }
    ]
  );
  doh.run();
}).catch(function(e) {
  console.error(e);
});

