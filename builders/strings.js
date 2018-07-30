const T = require('@babel/template').default;
const t = require('@babel/types');

// convert <string> elements to js suitable for string extraction
module.exports = (strings) => {
	return strings.map(s => T(`var ${s.id} = _(VALUE); // ${s.title}`, {
		placeholderPattern: /^[$A-Z]+$/, // no underscore
		preserveComments: true
	})({ VALUE: t.stringLiteral(s.value) }));
};
