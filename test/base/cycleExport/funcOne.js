var One = function (name) {
  this.name = name;
};

One.prototype.getName = function () {
  var inst = new (module('funcTwo'))('-NESTED');
  return this.name + inst.name;
};

module.export = One;
