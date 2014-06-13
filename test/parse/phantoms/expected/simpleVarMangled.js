function(x){

var funcFour = undefined;

var Three = function (arg) {
  return arg + '-' + (x('funcFour')).suffix();
};

Three.suffix = function () {
  return 'THREE_SUFFIX';
};

x.export = Three;

}
