module.use('a', 'b', function(a, b) {
  doh.register(
    'configLifecycle',
    [
      function configLifecycle(t){
        t.is('a', a());
        t.is('b', b());
      }
    ]
  );
  doh.run();
}).catch(function(e) {
  console.error(e);
});
