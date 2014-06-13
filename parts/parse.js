/*global esprima */
var parse;
(function() {

  var hasOwn = Object.prototype.hasOwnProperty;
  function hasProp(obj, prop) {
      return hasOwn.call(obj, prop);
  }

  //From an esprima example for traversing its ast.
  function traverse(object, visitor) {
    var key, child;

    if (!object) {
      return;
    }

    if (visitor.call(null, object) === false) {
      return false;
    }
    for (key in object) {
      if (object.hasOwnProperty(key)) {
        child = object[key];
        if (typeof child === 'object' && child !== null) {
          if (traverse(child, visitor) === false) {
            return false;
          }
        }
      }
    }
  }

  //Like traverse, but visitor returning false just
  //stops that subtree analysis, not the rest of tree
  //visiting.
  function traverseBroad(object, visitor) {
    var key, child;

    if (!object) {
      return;
    }

    if (visitor.call(null, object) === false) {
      return false;
    }
    for (key in object) {
      if (object.hasOwnProperty(key)) {
        child = object[key];
        if (typeof child === 'object' && child !== null) {
          traverseBroad(child, visitor);
        }
      }
    }
  }

  function getApiName(node) {
    if (node.type === 'FunctionExpression' &&
        node.params && node.params.length === 1) {
      return node.params[0].name;
    }
  }

  function matchesModuleDeclaration(node, apiName) {
    if (node.type === 'CallExpression' &&
            node.callee &&
            node.callee.type === 'Identifier' &&
            node.callee.name === apiName &&
            node.arguments &&
            node.arguments.length === 1 &&
            node.arguments[0].type === 'Literal') {
      return node.arguments[0].value;
    }
  }

  function matchesCallExpression(node, objectName, propertyName) {
    return node.type === 'CallExpression' && node.callee &&
           node.callee.type === 'MemberExpression' && node.callee.object &&
           node.callee.object.name === objectName && node.callee.property &&
           node.callee.property.name === propertyName;
  }

  function matchesMemberExpression(node, objectName, propertyName) {
    return node.type === 'MemberExpression' && node.object &&
           node.object.type === 'Identifier' &&
           node.object.name === objectName && node.property &&
           node.property.type === 'Identifier' &&
           node.property.name === propertyName;
  }

  function getPhantomRefName(node, apiName, phantoms) {
    var dep = matchesModuleDeclaration(node, apiName);
    if (dep && hasProp(phantoms, dep)) {
      return dep;
    }
  }

  function modeRefText(apiName, moduleId, propName) {
    return '(' + apiName + '(\'' + moduleId + '\')' +
           (propName ? '.' + propName : '') +
           ')';
  }

  parse = {
    traverse: traverse,
    traverseBroad: traverseBroad,

    // Parses factory function for module() dependencies,
    // as well as module.define IDs that are local to a module.
    fromFactory: function(fn) {
      return parse.fromBody('(' + fn.toString() + ')');
    },

    // Parses a possible module body for module API usage:
    // module(StringLiteral)
    // module.define()
    // module.exportFromLocal()
    fromBody: function (bodyText, apiName) {
      // Convert to string, add parens around it so valid esprima
      // parse form.
      var usesExportFromLocal = false,
          usesExport = false,
          astRoot = esprima.parse(bodyText),
          deps = [],
          localModules = [];

      traverseBroad(astRoot, function(node) {
        // Minified code could have changed the name of `module` to something
        // else, so find it. It will be the first function expression.
        if (!apiName) {
          apiName = getApiName(node);
          if (apiName) {
            return;
          }
        }

        // Look for dependencies
        var dep = matchesModuleDeclaration(node, apiName);
        if (dep) {
          if (deps.indexOf(dep) === -1) {
            deps.push(dep);
          }
        }

        // Look for local module defines, but only top level,
        // do not inspect inside of them if found.
        if (matchesCallExpression(node, apiName, 'define')) {
          var localModule = node.arguments[0].value;
          localModules.push(localModule);
          return false;
        }

        // Look for module.exportFromLocal, since it indicates this code is
        // a module, and needs a module function wrapping.
        if (matchesCallExpression(node, apiName, 'exportFromLocal')) {
          usesExportFromLocal = true;
          return false;
        }

        // Look for module.export, since it indicates this code is
        // a module, and needs a module function wrapping.
        if (matchesMemberExpression(node, apiName, 'export')) {
          // uses set, and continue parsing lower, since set
          // usage could use get inside to construct the export
          usesExport = true;
          return false;
        }
      });

      return {
        deps: deps,
        localModules: localModules,
        usesExportFromLocal: usesExportFromLocal,
        isModule: !!(deps.length || usesExportFromLocal || usesExport)
      };
    },

    insertPhantoms: function(fn, phantoms) {
      var modified = parse._insertPhantomsInText(fn.toString(), phantoms),
          text = modified.text;

      // Get the body only, for the new Function call
      var body = text.substring(text.indexOf('{') + 1,
                                text.lastIndexOf('}'));

      return new Function(modified.apiName, body);
    },

    // A separate function just because of tests, so that fn.toString()
    // variances across browsers do not come into play. The text
    // returned has an extry () wrapping. It is not stripped because the
    // consumer of this function will discard more of the text, and just trying
    // to avoid extra substring work.
    // TODO:
    // Right now it replaces all non-property identifiers, where a more correct
    // version would skip more local identifier declarations. For instance, if
    // `a` is module identifier, but there is a `function helper() { var a; }`,
    // it should not replace the `a` values in that scope. But this is just a
    // proof of concept where language support would have an easier way of
    // marking the identifiers that need the indirection.
    _insertPhantomsInText: function(text, phantoms) {
      var apiName, map, destructureString, isIdInRange,
          fnString = '(' + text + ')',
          mappings = {},
          replacements = [],
          astRoot = esprima.parse(fnString, {
            range: true
          });

      traverseBroad(astRoot, function(node) {
        var phantomName, identifier;

        // Minified code could have changed the name of `module` to something
        // else, so find it. It will be the first function expression.
        if (!apiName) {
          apiName = getApiName(node);
          if (apiName) {
            return;
          }
        }

        // Skip object.target when target is a phantom variable target,
        // as it does not a valid write target.
        if (node.type === 'MemberExpression' &&
            node.property && node.property.type === 'Identifier' &&
            hasProp(mappings, node.property.name)) {
            mappings[node.property.name].idSkipRanges.push(node.property.range);
          return;
        }

        if (node.type === 'Identifier') {
          identifier = node.name;
          if (hasProp(mappings, identifier)) {
            map = mappings[identifier];
            isIdInRange = map.idSkipRanges.some(function(idSkipRange) {
                            return node.range[0] >= idSkipRange[0] &&
                                   node.range[1] <= idSkipRange[1];
                          });
            if (!isIdInRange) {
              replacements.push({
                range: node.range,
                text: modeRefText(apiName, map.phantomName, map.propName)
              });
            }
          }
        }

        if (node.type === 'VariableDeclarator' && node.init) {
          phantomName = getPhantomRefName(node.init, apiName, phantoms);
          if (phantomName) {
            if (node.id && node.id.type === 'ObjectPattern' &&
                node.id.properties && node.id.properties.length) {
              // var { b, c } = module('a')

              destructureString = '';
              node.id.properties.forEach(function(prop, i) {
                var key = prop.key,
                    value = prop.value;

                mappings[value.name] = {
                  phantomName: phantomName,
                  idSkipRanges: [node.id.range],
                  propName: key.name
                };

                destructureString += (i > 0 ? ', ' : '') +
                                     key.name + ': undefined';
              });

              // Replace the module('') use with `{}`
              replacements.push({
                range: node.init.range,
                text: '{' + destructureString + '}'
              });
            } else {
              // var a = module('a')

              identifier = node.id.name;
              mappings[identifier] = {
                phantomName: phantomName,
                idSkipRanges: [node.id.range]
              };

              // Replace the module('') use with `undefined`
              replacements.push({
                range: node.init.range,
                text: 'undefined'
              });
            }
          } else if (node.init.type === 'MemberExpression' &&
              node.init.object && node.init.property &&
              node.init.property.type === 'Identifier') {
            // var b = module('a').b ?

            phantomName = getPhantomRefName(node.init.object,
                                            apiName, phantoms);
            if (phantomName) {
              identifier = node.id.name;
              mappings[identifier] = {
                phantomName: phantomName,
                propName: node.init.property.name,
                idSkipRanges: [node.id.range]
              };

              // Replace the module('') use with `undefined`
              replacements.push({
                range: node.init.range,
                text: 'undefined'
              });
            }
          }
        }
      });

      if (replacements.length) {
        // Go in reverse order, since the string replacements will change the
        // range values if done from the beginning.
        for (var i = replacements.length - 1; i > -1; i--) {
          var rep = replacements[i];
          fnString = fnString.substring(0, rep.range[0]) +
                     rep.text +
                     fnString.substring(rep.range[1]);
        }
      }

      return {
        apiName: apiName,
        text: fnString
      };
    }
  };

}());

