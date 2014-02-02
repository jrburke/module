system.load('a', 'b', function(a, b) {
  doh.register(
    'baseSimple',
    [
      function baseSimple(t){
        t.is('a', a.name);
        t.is('b', b.name);
      }
    ]
  );
  doh.run();
})
.catch(function (e) {
  console.error(e);
});
