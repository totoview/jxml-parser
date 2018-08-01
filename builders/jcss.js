
const T = require('@babel/template').default;
const util = require('../util');

module.exports = (prog, options) => {
	let css = '';
	
	if (prog.jcss && prog.jcss.length) {
		let curLine = 0;
		prog.jcss.forEach(s => {
			css += Array(s.loc.start.line - curLine).join("\n");
			css += s.text;
			curLine = s.loc.end.line;
		});
	}

	// check if bracketing is required
	if (!css.match(/^\s*{/)) {
		css = `{ ${css} }`;
	}

	let ast = util.parse(`a=${css}`, {
		sourceFilename: options.filename,
		sourceType: 'module',
		plugins: [ 'jsx ']
	}).program.body[0].expression.right;

	util.forEachLoc(ast, loc => {
		if (loc.line === 1 && loc.column >= 2) {
			loc.column -= 2;
		}
	});

	return T(`${prog.name}.__jx__jcss = CSS`)({
		CSS: ast
	});
};
