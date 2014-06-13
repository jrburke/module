function(module){

var funcFour = module('funcFour');

var Three = function (arg) {
  return arg + '-' + funcFour.suffix();
};

Three.suffix = function () {
  return 'THREE_SUFFIX';
};

module.export = Three;

}
