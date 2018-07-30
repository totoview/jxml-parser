const T = require('@babel/template').default;
const t = require('@babel/types');
const util = require('../util');


// walk component tree to build constructor arrays
module.exports = (root, nsMap, strings) => {

	// convert value string to AST so string interpolation would work as expected
	function toValueAst(a) {

		// this is probably the most straightforward way but requires the
		// downstream tools to able to handle template literals.

		// return T.ast('`' + a.value.replace(/\{(.*)\}/, '${$1}') + '`').expression;

		switch (a.type) {
			default:
				throw new Error(`Unexpected value type ${a.type}: ${JSON.stringify(a)}`);
			case 'text':
				if (!a.value.match(/\{.*\}/)) {
					return t.stringLiteral(a.value);
				}
				// handle string interpolation
				let v = a.value;
				let ast;
				let pat = /^(.*)(\{.*?\})(.*)/;
				let m = v.match(pat);
				while (m) {
					v = m[3];
					let  expr = t.binaryExpression('+', t.stringLiteral(m[1]), T.ast(m[2]).body[0].expression);
					ast = ast ? t.binaryExpression('+', ast, expr) : expr;
					m = v.match(pat);
				}
				return v === '' ? ast : t.binaryExpression('+', ast, t.stringLiteral(v));

			case 'expression':
				return T.ast(a.value).body[0].expression;
		}
	}

	function bft(comp) {

		// simple value
		if (comp.name === '') {
			return toValueAst(comp);
		}

		const name = util.getNamespacedName(comp, nsMap);
		const id = comp.attributes.find(a => a.name === 'id');
		const style = comp.attributes.find(a => a.name === 'style');

		let children = [];
		if (comp.children) {
			comp.children.forEach(c => children.push(bft(c)));
		}


		let attribs = [];
		comp.attributes.forEach(a => {
			let name = a.name;
			if (a.namespace) {
				name = `${a.namespace}:${a.name}`;
			}

			attribs.push(t.objectProperty(t.stringLiteral(name), toValueAst(a)));
		});

		return t.arrayExpression([
			t.identifier(util.getGlobalReference(name)),
			t.stringLiteral(id ? id.value : ''),
			t.stringLiteral(style ? style.value : ''),
			t.arrayExpression(children),
			t.objectExpression(attribs)
		]);
	}

	return bft(root);
}