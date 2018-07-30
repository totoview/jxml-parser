
const T = require('@babel/template').default;
const t = require('@babel/types');

const buildElementWithIds = require('./elements');
const buildJSArray = require('./jsarray');
const buildStrings = require('./strings');
const buildInit = require('./init');


const ctorT = T(`
function COMPONENT_NAME(parentNode, id, style, externalChildren, attributes) {
	if (!(this instanceof COMPONENT_NAME))
			return new COMPONENT_NAME(parentNode, id, style, externalChildren, attributes);

	id = id || Element.generateID();

	STRINGS

	// decompose the jsarray
	var jsArray = JS_ARRAY;

	// Create component based on declarative markup
	// Also mangle their IDs so that IDs are unique
	var returned = jsArray[0].call(this, parentNode, id, null, Element.mangleIDs(id, jsArray[3]), jsArray[4]);

	var self = returned || this;

	Element.set(id, self);

	// (mangled) DOM element IDs for script to access
	ELEMENT_WITH_IDS

	// JCSS
	if (!COMPONENT_NAME.__jx__jcss_generated) {
			JCSS.generate(parentNode, COMPONENT_NAME.prototype.__jx__fqname, COMPONENT_NAME.__jx__jcss, null, COMPONENT_NAME);
			COMPONENT_NAME.__jx__jcss_generated = true;
	}

	DEFAULT_PLACEMENT

	INIT

	if (self.fire) self.fire('init');

	// Add styles. Note this happens after extending a component,
	// so that we can overwrite the base component's styles
	self.setStyle      && self.setStyle(style);
	self.setAttributes && self.setAttributes(attributes);

	// add external children too
	if (typeof self.addChildren == 'function')
			self.addChildren(externalChildren);
	else
			Element.addChildren(self, externalChildren);

	if (self !== this) { // For backward compatibility
			self.__jx__constructor = __jx__constructor;
			self.__jx__native = false;
	}

	return self;
}`);

module.exports = (prog, options) => {
	return ctorT({
		COMPONENT_NAME: t.identifier(prog.name),
		JCSS: t.identifier('JCSS'),
		STRINGS: buildStrings(prog.strings),
		JS_ARRAY: buildJSArray(prog.root, prog.namespaces, prog.strings),
		ELEMENT_WITH_IDS: buildElementWithIds(prog.root),
		DEFAULT_PLACEMENT: T.ast(prog.defaultPlacementID ? `self.defaultPlacement = ${prog.defaultPlacementID}` : ''),
		INIT: buildInit(prog, options)
	});
};