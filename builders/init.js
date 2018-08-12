
const T = require('@babel/template').default;
const util = require('../util');

const initT = T(`
// run embedded script
INIT

for (var methodName in publicInterface)
	self[methodName] = publicInterface[methodName];
`);

module.exports = (prog, options) => {

	let init = T.ast('var publicInterface = (function() {})();');

	if (prog.script && prog.script.length) {

		let source = '', curLine = 0;
		prog.script.forEach(s => {
			source += Array(s.loc.start.line - curLine).join("\n");
			source += s.text;
			curLine = s.loc.end.line;
		});

		// anything special about dynamic import ?
		let code = source.replace(/import\s+dynamic\s+([.\w]+)/g, `import '$1'`);
		code = code.replace(/import\s+([.\w]+)/g, `import '$1'`);

		let progInit;

		try {
			// we need to use the full power of parser here instead of template:
			// 1. to get parsing locations for sourcemap
			// 2. to keep comments for preprocessing
			progInit = util.parse(code, {
				sourceFilename: options.filename,
				sourceType: 'module',
				plugins: [ 'jsx' ]
			});
		} catch (e) {
			throw util.generateError(e, options.filepath, prog.source);
		}

		// process ifdef
		util.preprocessAST(progInit, options);

		// rewrite imports
		util.rewriteImports(progInit);

		init = T('var publicInterface = (function() { CODE })();')({ CODE: progInit.program.body });
	}

	return initT({
		INIT: init
	});
};