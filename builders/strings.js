const T = require('@babel/template').default;
const t = require('@babel/types');
const util = require('../util');

// convert <string> elements to js suitable for string extraction
module.exports = (strings) => {
	return strings.map(s =>
		util.setLoc(T(`var ${s.id} = _(VALUE); // ${s.title}`, {
			placeholderPattern: /^[$A-Z]+$/, // no underscore
			preserveComments: true
		})({ VALUE: t.stringLiteral(s.value) }), s.loc));
};
