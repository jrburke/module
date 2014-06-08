module.export = {
  size: 'small',
  color: 'redtwo',
  doSomething: function() {
    return module('one').doSomething();
  }
};
