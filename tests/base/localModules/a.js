
system.define('part1', function(system) {
    system.set({
        name: 'part1',
        // loaded by top level loader
        b: system.get('b')
    })
});

system.define('part2', function(system) {
    system.set({
        name: 'part12',
        canSeeB: function() {
            var mod = 'b';
            return system.has(mod);
        }
    })
});

system.define('grouped', function(system) {
    system.set({
        name: 'grouped',
        part1: system.get('part1'),
        part2: system.get('part2')
    });
});

system.set({
  name: 'a',
  grouped: system.get('grouped')
});
