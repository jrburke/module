#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    system = fs.readFileSync(path.join(__dirname, 'system.js'), 'utf8'),
    insertions = ['prim', 'esprima'];

insertions.forEach(function(name) {
  var insertionString = '// INSERT ' + name,
      index = system.indexOf(insertionString);

  system = system.substring(0, index) +
           fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8') +
           system.substring(index + insertionString.length);
});

fs.writeFileSync(path.join(__dirname, '..', 'system.js'), system, 'utf8');
