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
          traverse(child, visitor);
        }
      }
    }
  }

  parse = {
    traverse: traverse,
    traverseBroad: traverseBroad,

    // Parses factory function for system.get() dependencies,
    // as well as system.define IDs that are local to a module.
    fromFactory: function(fn) {
      // Convert to string, add parens around it so valid esprima
      // parse form.
      var text = '(' + fn.toString() + ')',
          astRoot = esprima.parse(text),
          deps = [],
          localModules = [],
          systemName;

      traverse(astRoot, function(node) {
        // Minified code could have changed the name of system to something
        // else, so find it. It will be the first function expression.
        if (!systemName && node.type === 'FunctionExpression' &&
            node.params && node.params.length === 1) {
          systemName = node.params[0].name;
        }

        // Look for dependencies
        if (node.type === 'CallExpression' && node.callee &&
            node.callee.type === 'MemberExpression' && node.callee.object &&
            node.callee.object.name === systemName && node.callee.property &&
            node.callee.property.name === 'get') {
          var dep = node.arguments[0].value;
          if (deps.indexOf(dep) === -1) {
            deps.push(dep);
          }
        }

        // Look for local module defines, but only top level,
        // do not inspect inside of them if found.
        if (node.type === 'CallExpression' && node.callee &&
            node.callee.type === 'MemberExpression' && node.callee.object &&
            node.callee.object.name === systemName && node.callee.property &&
            node.callee.property.name === 'define') {
          var localModule = node.arguments[0].value;
          localModules.push(localModule);
          return false;
        }
      });

      return {
        deps: deps,
        localModules: localModules
      };
    }
  };

}());

