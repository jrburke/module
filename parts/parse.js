/*global esprima */
var parse;
(function() {
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

  function matchesCallExpression(node, objectName, propertyName) {
    return node.type === 'CallExpression' && node.callee &&
           node.callee.type === 'MemberExpression' && node.callee.object &&
           node.callee.object.name === objectName && node.callee.property &&
           node.callee.property.name === propertyName;
  }

  parse = {
    traverse: traverse,
    traverseBroad: traverseBroad,

    // Parses factory function for system.get() dependencies,
    // as well as system.define IDs that are local to a module.
    fromFactory: function(fn) {
      return parse.fromBody('(' + fn.toString() + ')');
    },

    // Parses a possible module body for module API usage:
    // system.get()
    // system.define()
    // system.setFromLocal()
    fromBody: function (bodyText, systemName) {
      // Convert to string, add parens around it so valid esprima
      // parse form.
      var setFromLocal,
          usesSet = false,
          astRoot = esprima.parse(bodyText),
          deps = [],
          localModules = [];

      traverseBroad(astRoot, function(node) {
        // Minified code could have changed the name of system to something
        // else, so find it. It will be the first function expression.
        if (!systemName && node.type === 'FunctionExpression' &&
            node.params && node.params.length === 1) {
          systemName = node.params[0].name;
        }

        // Look for dependencies
        if (matchesCallExpression(node, systemName, 'get')) {
          var dep = node.arguments[0].value;
          if (deps.indexOf(dep) === -1) {
            deps.push(dep);
          }
        }

        // Look for local module defines, but only top level,
        // do not inspect inside of them if found.
        if (matchesCallExpression(node, systemName, 'define')) {
          var localModule = node.arguments[0].value;
          localModules.push(localModule);
          return false;
        }

        // Look for system.setFromLocal, since it indicates this code is
        // a module, and needs a module function wrapping.
        if (matchesCallExpression(node, systemName, 'setFromLocal')) {
          var setFromLocalValue = node.arguments[0].value;
          setFromLocal = setFromLocalValue;
          return false;
        }

        // Look for system.set, since it indicates this code is
        // a module, and needs a module function wrapping.
        if (matchesCallExpression(node, systemName, 'set')) {
          // uses set, and continue parsing lower, since set
          // usage could use get inside to construct the export
          usesSet = true;
        }
      });

      return {
        deps: deps,
        localModules: localModules,
        setFromLocal: setFromLocal,
        // If have deps or a setFromLocal, this is a module body.
        isModule: !!(deps.length || setFromLocal || usesSet)
      };
    }
  };

}());

