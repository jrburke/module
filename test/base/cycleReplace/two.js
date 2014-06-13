var one = module('one'),
    e = module.export;

e.size = 'small';
e.color = 'redtwo';
e.doSomething = function() {
  return one.doSomething();
};
