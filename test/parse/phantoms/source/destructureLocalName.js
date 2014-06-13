function(module) {

var { prefix: prefixLocal, suffix: suffixLocal } = module('parts');

var four = function (arg) {
  return 'FOUR called with ' + arg;
};

four.prefix = function () {
  return prefixLocal();
};

four.suffix = function () {
  return suffixLocal();
};

module.export = four;

}
