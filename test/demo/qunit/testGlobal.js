(function(window) {
  QUnit.module('Global test');
  QUnit.test('testGlobal', function(assert) {
    assert.ok(!!window.document, 'Passed!');
  });
}(this));
