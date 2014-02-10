module.load('two', 'funcTwo', 'funcThree', function(two, funcTwo, funcThree) {

  var args = two.doSomething();
  doh.register(
    'cycle',
    [
      function cycle(t) {
        t.is('small', args.size);
        t.is('redtwo', args.color);
      }
    ]
  );
  doh.run();

  var twoInst = new funcTwo('TWO');
  doh.register(
    'circularFunc',
    [
      function circularFunc(t) {
        t.is('TWO', twoInst.name);
        t.is('ONE-NESTED', twoInst.oneName());
        t.is('THREE-THREE_SUFFIX', funcThree('THREE'));
      }
    ]
  );
  doh.run();

})
.catch(function (e) {
  console.error(e);
});
