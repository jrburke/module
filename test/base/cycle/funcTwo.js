var Two = function (name) {
  this.name = name;
  this.one = new (module('funcOne'))('ONE');
};

Two.prototype.oneName = function () {
  return this.one.getName();
};

module.export(Two);
