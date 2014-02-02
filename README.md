system.get('a');

system.macro('a', 'swap', 'class');


system.set(value);

system.define('a'. function(system) {

});


system.setMacro('swap', {});
system.setMacro('swap', {});




system.define(function(system) {

  var a = system.get('a');
  var b = system.get('b');

  system.define('b', function(system) {
    system.set(bValue);
  });
});


So creating a load, it should favor direct system.define() for one (parsed out when getting the factory function, otherwise, ask for parent load, and if it does not
have one, go up to topmost to get one. So, only get an intermediate one if a load
has already been registered.

And loader should create a local load, and local module table entry, for any module,
so that other modules loaded in that system scope get the same value always. Hmm,
but that means an intermediate could still intercept? Need a way to make sure get top
level load, but then fix value at that system level to the final resolved value.

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