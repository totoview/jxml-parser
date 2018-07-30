const JXMLParser = require('./JXMLParser');
const JXMLCodeGenerator = require('./JXMLCodeGenerator');
const util = require('./util');


module.exports = (data, filepath, options = {}) => {

	const filename = require('path').basename(filepath);
	const jxmlString = util.preprocessJXMLSource(data);

	options = {
		filename,
		filepath: filepath,
		source: jxmlString,
		module: '',
		component: filename.substring(0, filename.indexOf('.')),
		...options
	};

	let ast;
	try {
		ast = util.parse(jxmlString, {
			sourceFilename: filename,
			sourceType: 'module',
			plugins: [ 'jsx' ]
		});
	} catch (e) {
		throw util.generateError(e, filepath, jxmlString);
	}

	util.traverse(ast, {
		JSXElement: (path) => {
			// top element only
			if (path.parentPath.parent.type !== 'Program') {
				return;
			}
			path.stop();

			let parser = new JXMLParser();
			let program = parser.parse(path, options);

			let cgen = new JXMLCodeGenerator();
			let ast = cgen.generate(program, options);
			path.parentPath.replaceWithMultiple(ast);
		}
	});

	const { code, map } = util.generate(ast);

	return {
		content: code
	};
};
