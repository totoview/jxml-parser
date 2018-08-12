const T = require('@babel/template').default;
const t = require('@babel/types');
const util = require('../util');

const elemT = T(`var NAME = Element.get(id + SUFFIX);`);

module.exports = (root) => {

	let statements = [];

	function bft(comp) {
		if (attr = comp.attributes.find(a => a.name === 'id')) {
			statements.push(util.setLoc(elemT({
				NAME: t.identifier(attr.value),
				SUFFIX: t.stringLiteral(`__${attr.value}`)
			}), comp.loc, true));
		}

		comp.children && comp.children.forEach(c => bft(c));
	}

	bft(root);
	return statements;
};