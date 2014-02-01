system.get('a');

system.macro('a', 'swap', 'class');


system.set(value);

system.define('a'. function(system) {

});


system.setMacro('swap', {});
system.setMacro('swap', {});




* but what if an exterior function does a system.setMacro?
  system.define() is the boundary.

* what about loads of groups of modules, system.define, with a system.get?
  * allow system.get at top levels, that is the indicator that a custom
    system is needed.

* race conditions where things attached to the fetch event callbacks or load
  event callbacks are lost once the object transfers to module defined

* how to do cycles. always transform source to funky gets?

Notes

* does not implement realm stuff.