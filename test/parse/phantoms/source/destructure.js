function(module) {

var { prefix, suffix } = module('parts');

var four = function (arg) {
  return 'FOUR called with ' + arg;
};

four.prefix = function () {
  return prefix();
};

four.suffix = function () {
  return suffix();
};

module.export = four;

}
