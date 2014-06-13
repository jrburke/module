function(module) {

var { prefix, suffix } = {prefix: undefined, suffix: undefined};

var four = function (arg) {
  return 'FOUR called with ' + arg;
};

four.prefix = function () {
  return (module('parts').prefix)();
};

four.suffix = function () {
  return (module('parts').suffix)();
};

module.export = four;

}
