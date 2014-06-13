var FuncTwo = module('funcTwo');

var One = function (name) {
  this.name = name;
};

One.prototype.getName = function () {
  var inst = new FuncTwo('-NESTED');
  return this.name + inst.name;
};

module.export = One;
