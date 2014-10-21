module.config({
  alias: {
    '*': {
      'foo/bar' : 'foo-1.2/bar',
      'c': 'another/c',
      'd': 'adapter/d'
    },

    'oldmodule': {
      //This one should be favored over the * value.
      'foo' : 'foo-1.0'
    },

    'a': {
      c: 'c1'
    },
    'a/sub/one': {
      'c': 'c2',
      'c/sub': 'another/c/sub'
    },

    'adapter/d': {
      d: 'd'
    }
  }
});

//******************************************************************************
// Some nested modules, more specific vs generic alias prefix matching.
module.define('a', function(module) {
  module.export = {
    c: module('c'),
    csub: module('c/sub')
  };
});

module.define('a/sub/one', function (module) {
  module.export = {
    c: module('c'),
    csub: module('c/sub')
  };
});

module.define('b', function(module) {
  module.export = {
    c: module('c'),
    csub: module('c/sub')
  };
});

module.define('c', function(module) {
  module.export = {
    name: 'c'
  };
});

module.define('c1', function(module) {
  module.export = {
    name: 'c1'
  };
});

module.define('c1/sub', function(module) {
  module.export = {
    name: 'c1/sub'
  };
});

module.define('c2', function(module) {
  module.export = {
    name: 'c2'
  };
});

module.define('c/sub', function(module) {
  module.export = {
    name: 'c/sub'
  };
});

module.define('another/c', function(module) {
  module.export = {
    name: 'another/c',
    minorName: module('./minor').name
  };
});

module.define('another/minor', function(module) {
  module.export = {
    name: 'another/minor'
  };
});

module.define('another/c/sub', function(module) {
  module.export = {
    name: 'another/c/sub',
    dimName: module('./dim').name
  };
});

module.define('another/c/dim', function(module) {
  module.export = {
    name: 'another/c/dim'
  };
});


//******************************************************************************
// Specific refName, more generic prefix is preferred over generic refName, more
// specific prefix.

module.define('foo-1.0/bar/baz', function(module){ module.export = '1.0'; });
module.define('foo-1.2/bar/baz', function(module){ module.export = '1.2'; });

module.define('oldmodule', function(module) {
  module.export = {
    name: 'oldmodule',
    baz: module('foo/bar/baz')
  };
});

module.define('latest', function(module) {
  module.export = {
    name: 'latest',
    baz: module('foo/bar/baz')
  };
});

//******************************************************************************
//'d' satisfied by adapter, but adapter getting the real 'd'.
module.define('d', function(module) {
  module.export = {
    name: 'd'
  };
});

module.define('adapter/d', function(module) {
  module.export = {
    name: 'adapter-d',
    realD: module('d')
  };
});

module.define('usesd', function(module) {
  module.export = {
    name: 'usesd',
    d: module('d')
  };
});

module.use('oldmodule', 'latest', 'usesd', 'a', 'b', 'c', 'a/sub/one',
  function(oldModule, latest, usesD, a, b, c, one) {

  doh.register(
    'configAlias',
    [
      function configAlias(t){
        t.is('latest', latest.name);
        t.is('1.2', latest.baz);
        t.is('oldmodule', oldModule.name);
        t.is('1.0', oldModule.baz);

        t.is('usesd', usesD.name);
        t.is('adapter-d', usesD.d.name);
        t.is('d', usesD.d.realD.name);

        t.is('c1', a.c.name);
        t.is('c1/sub', a.csub.name);
        t.is('c2', one.c.name);
        t.is('another/c/sub', one.csub.name);
        t.is('another/c/dim', one.csub.dimName);
        t.is('another/c', b.c.name);
        t.is('another/minor', b.c.minorName);
        t.is('another/c/sub', b.csub.name);
        t.is('another/c', c.name);
        t.is('another/minor', c.minorName);
      }
    ]
  );
  doh.run();

}).catch(function (e) {
  console.error(e);
});

