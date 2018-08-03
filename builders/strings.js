const T = require('@babel/template').default;
const t = require('@babel/types');
const util = require('../util');

// convert <string> elements to js suitable for string extraction
module.exports = (strings) => {
	const prog = util.parse(strings.map(s => {
		return `var ${s.id} = _T(${JSON.stringify(s.value)}); // ${s.title}`;
	}).join('\n'));

	prog.program.body.forEach((e, i) => {
		util.setLoc(e, strings[i].loc);
		util.setLoc(e.declarations[0].id, strings[i].idLoc);
		util.setLoc(e.declarations[0].init, strings[i].valueLoc);

		if (i > 0) e.leadingComments[0].loc = strings[i-1].titleLoc;
		e.trailingComments[0].loc = strings[i].titleLoc;
	});

	return prog.program.body;
};
