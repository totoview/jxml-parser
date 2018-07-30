const T = require('@babel/template').default;
const t = require('@babel/types');

const elemT = T(`var NAME = Element.get(id + SUFFIX);`);

module.exports = (root) => {

	let statements = [];

	function bft(comp) {
		const i = comp.attributes.findIndex(a => a.name === 'id');

		if (i >= 0) {
			const v = comp.attributes[i].value;
			statements.push(elemT({
				NAME: t.identifier(v),
				SUFFIX: t.stringLiteral(`__${v}`)
			}));
		}

		comp.children && comp.children.forEach(c => bft(c));
	}

	bft(root);
	return statements;
};