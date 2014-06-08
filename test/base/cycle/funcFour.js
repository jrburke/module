var four = function (arg) {
  return 'FOUR called with ' + arg;
};

four.suffix = function () {
  return module('funcThree').suffix();
};

module.export = four;
