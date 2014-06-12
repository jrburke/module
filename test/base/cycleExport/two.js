var one = module('one'),
    e = module.export;

window.GLOBALTWO2 = e;

e.size = 'small';
e.color = 'redtwo';
e.doSomething = function() {
  return one.doSomething();
};
