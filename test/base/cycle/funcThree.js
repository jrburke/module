var Three = function (arg) {
  return arg + '-' + module('funcFour').suffix();
};

Three.suffix = function () {
  return 'THREE_SUFFIX';
};

module.export(Three);
