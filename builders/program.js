const T = require('@babel/template').default;
const t = require('@babel/types');
const util = require('../util');
const buildImport = require('./import');
const buildConstructor = require('./constructor');
const buildJCSS = require('./jcss');

const program = `
IMPORTS

module.exports = (function() {
	var __jx__constructor;

	CONSTRUCTOR

	COMPONENT_NAME.prototype = clone(BASE_COMPONENT.prototype);

	// save reference to constructor and superclass
	COMPONENT_NAME.prototype.__jx__native = false;
	COMPONENT_NAME.prototype.__jx__super = BASE_COMPONENT;

	JCSS

	$jxml_extends(COMPONENT_NAME, FULL_COMPONENT_NAME);

	__jx__constructor = COMPONENT_NAME;
	COMPONENT_NAME.prototype.__jx__constructor = COMPONENT_NAME;

	return COMPONENT_NAME;
})();`;


// walk component tree to build imports
function buildImports(root, nsMap) {

	let imports = [];
	let lut = new Set();

	function bft(comp) {

		if (!comp.name) return;

		const name = util.getNamespacedName(comp, nsMap);
		const full = `${name[0]}::${name[1]}`;

		if (!lut.has(full)) {
			imports.push(buildImport(name, comp.loc));
			lut.add(full);
		}

		comp.children && comp.children.forEach(c => bft(c));
	}

	bft(root);
	return imports;
}

module.exports = (prog, options) => {
	let fullname = `${prog.module.split('.').join('_')}_${prog.name}`;
	let base = util.getGlobalReference(util.getNamespacedName(prog.root, prog.namespaces));

	return T(program)({
		IMPORTS: buildImports(prog.root, prog.namespaces),
		COMPONENT_NAME: t.identifier(prog.name),
		FULL_COMPONENT_NAME: t.stringLiteral(fullname),
		BASE_COMPONENT: t.identifier(base),
		CONSTRUCTOR: buildConstructor(prog, options),
		JCSS: buildJCSS(prog, options)
	});
};