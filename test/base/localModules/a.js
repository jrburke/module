
module.define('part1', function(module) {
    module.export = {
        name: 'part1',
        // loaded by top level loader
        b: module('b')
    };
});

module.define('part2', function(module) {
    module.export = {
        name: 'part2',
        canSeeB: function() {
            var mod = 'b';
            return module.has(mod);
        }
    };
});

module.define('grouped', function(module) {
    module.export = {
        name: 'grouped',
        part1: module('part1'),
        part2: module('part2')
    };
});

module.exportFromLocal(function(module) {
  module.export = {
    name: 'a',
    grouped: module('grouped')
  };
});
