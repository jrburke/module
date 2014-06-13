var funcThree = module('funcThree').suffix;

var four = function (arg) {
  return 'FOUR called with ' + arg;
};

four.suffix = function () {
  return funcThree();
};

module.export = four;
