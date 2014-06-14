var helper = module('helper');

QUnit.module('Modular test');
QUnit.test('test', function(assert) {
  assert.ok(1 === helper.generateNumber(), 'Passed!');
});
