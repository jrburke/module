module.use('two', function(two) {

  var args = two.doSomething();
  doh.register(
    'cycleExport',
    [
      function cycleExport(t) {
        t.is('small', args.size);
        t.is('redtwo', args.color);
      }
    ]
  );
  doh.run();
})
.catch(function (e) {
  console.error(e);
});
