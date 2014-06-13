/*global parse */

function fetch(path) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', path, false);
  xhr.send(null);
  return xhr.responseText;
}

doh.register(
  'parseInsertPhantoms',
  [
    function parseInsertPhantoms(t){

      function compare(testName, phantoms) {
        var result,
            source = fetch('source/' + testName + '.js'),
            expected = fetch('expected/' + testName + '.js');

        result = parse._insertPhantomsInText(source, phantoms);

        t.is('(' + expected + ')', result.text, testName);
      }

      compare('simpleVar', {
        'funcFour': true
      });
      compare('simpleLet', {
        'funcFour': true
      });
      compare('simpleVarMangled', {
        'funcFour': true
      });
      compare('simpleProp', {
        'funcThree': true
      });
      compare('destructure', {
        'parts': true
      });
      compare('destructureLocalName', {
        'parts': true
      });
    }
  ]
);
doh.run();
