
const T = require('@babel/template').default;

module.exports = (prog, options) => {
	let css = '';
	
	if (prog.jcss && prog.jcss.length) {
		css = prog.jcss.map(s => s.text).join("\n");
	}

	// check if bracketing is required
	if (!css.match(/^\s*{/)) {
		css = `{ ${css} }`;
	}

	return T.ast(`${prog.name}.__jx__jcss = ${css}`);
};
