module.config({
  baseUrl: 'aceofbase',
  locations: {
    'a/b/': 'some/child/b',
    'a/b': 'some/root/b',
    'g/': 'nothing/but/a/',
    'j': 'http://j.com/js/j'
  }
});


doh.register(
  'configLocations',
  [
    function configLocations(t){
      t.is('aceofbase/some/child/b/c.js', module.locate('a/b/c', 'js'));
      t.is('aceofbase/some/root/b.html', module.locate('a/b', 'html'));
      t.is('aceofbase/nothing/but/a/h', module.locate('g/h'));
      t.is('aceofbase/g.css', module.locate('g', 'css'));
      t.is('http://j.com/js/j', module.locate('j'));
      //debugger;
      t.is('http://j.com/js/j/k.json', module.locate('j/k', 'json'));
    }
  ]
);
doh.run();
