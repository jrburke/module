var FuncOne = module('funcOne');

var Two = function (name) {
  this.name = name;
  this.one = new FuncOne('ONE');
};

Two.prototype.oneName = function () {
  return this.one.getName();
};

module.export = Two;
