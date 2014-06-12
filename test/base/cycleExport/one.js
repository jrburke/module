var two = module('two');

two.STAMPEDBYONE = true;

window.GLOBALTWO = two;

module.export.size = 'large';
module.export.doSomething = function() {
  return two;
};
