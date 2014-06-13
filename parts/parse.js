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

  function modeRefText(apiName, moduleId) {
    return '(' + apiName + '(\'' + moduleId + '\'))';
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
      var body = text.substring(text.indexOf('{'),
                                text.fnString.lastIndexOf('}'));

      return new Function(modified.apiName, body);
    },

    // A separate function just because of tests, so that fn.toString()
    // variances across browsers do not come into play. The text
    // returned has an extry () wrapping. It is not stripped because the
    // consumer of this function will discard more of the text, and just trying
    // to avoid extra substring work.
    _insertPhantomsInText: function(text, phantoms) {
      var apiName, map,
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

        if (node.type === 'Identifier') {
          identifier = node.name;
          if (hasProp(mappings, identifier)) {
            map = mappings[identifier];
            if (node.range[0] !== map.idRange[0]) {
              replacements.push({
                range: node.range,
                text: modeRefText(apiName, map.phantomName)
              });
            }
          }
        }

        if (node.type === 'VariableDeclarator') {
          phantomName = node.init &&
                        getPhantomRefName(node.init, apiName, phantoms);

          if (phantomName) {
            identifier = node.id.name;
            mappings[identifier] = {
              phantomName: phantomName,
              idRange: node.id.range
            };

            // Replace the module('') use with `undefined`
            replacements.push({
              range: node.init.range,
              text: 'undefined'
            });
          }
        }

        // destructuring
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

