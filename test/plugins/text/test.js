module.use('a/b', function(b) {
  doh.register(
    'pluginsText',
    [
      function pluginsText(t){
        t.is('b', b.name);
        t.is('hello', b.text.trim());
        t.is('<h1>hello</h1>', b.html.trim());
      }
    ]
  );
  doh.run();
}).catch(function(e) {
  console.error(e);
});
