#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    m = fs.readFileSync(path.join(__dirname, 'm.js'), 'utf8'),
    insertions = ['prim', 'esprima-harmony', 'parse'];

insertions.forEach(function(name) {
  var insertionString = '// INSERT ' + name,
      index = m.indexOf(insertionString);

  m = m.substring(0, index) +
           fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8') +
           m.substring(index + insertionString.length);
});

fs.writeFileSync(path.join(__dirname, '..', 'module.js'), m, 'utf8');
