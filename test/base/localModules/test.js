module.load('a', function(a) {
  doh.register(
    'localModules',
    [
      function localModules(t){
        t.is('a', a.name);
        t.is('grouped', a.grouped.name);
        t.is('part1', a.grouped.part1.name);
        t.is('b', a.grouped.part1.b.name);
        t.is(true, a.grouped.part2.canSeeB());
        t.is('part2', a.grouped.part2.name);
      }
    ]
  );
  doh.run();
})
.catch(function (e) {
  console.error(e);
});
