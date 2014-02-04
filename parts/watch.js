#!/usr/bin/env node

var exec = require('child_process').exec,
    path = require('path'),
    fs = require('fs');

fs.watch(__dirname, function() {
  console.log('building ' + new Date());
  exec(path.join(__dirname, 'build.js'));
});
