const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const codeFrame = require('@babel/code-frame').codeFrameColumns;
const T = require('@babel/template').default;
const util = require('util');

// generate string of whitespaces
function white(n) {
	return (new Array(n)).fill(' ').join('');
}

// try to generate error message with code frame
function generateError(e, filepath, source, loc) {

	if (!loc) {
		// extract location from error message
		let m = e.message.match(/\((\d+):(\d+)\)/);
		if (m) {
			loc = { start: { line: parseInt(m[1]), column: parseInt(m[2]) }};
		}
	}
	return loc ? new Error(`(${filepath}) ${e.message}:\n${codeFrame(source, loc)}`) : e;
}

/**
 * Check conditional definitions (ifdef, ifndef) and returns [ isConditional: boolean, shouldTrim: boolean ]
 * isConditional is true if the string contains ifdef/ifndef, shouldTrim determines if we should start
 * the tree pruning process.
 *
 * Returns [ true, true ] iif:
 * 1. it's an ifdef and the condition doesn't match any of the defines in options
 * 2. it's an ifndef and the condition matches one of the defines in options
 */
function matchConditionalStart(s, path, options) {

	function getSym(m) {
		const toks = m[1].trim().split(/\s+/);
		if (toks.length !== 1 || toks[0].length === 0) {
			throw new Error(`Invalid conditional ${m[0]}:\n${codeFrame(options.source, path.node.loc)}`)
		}
		return toks[0]
	}

	// #ifdef
	let m =  s.match(/#ifdef\s*(.*)$/);
	if (m) {
		const sym = getSym(m);
		return [ true, !options || options.defines.find(d => d === sym) === undefined ];
	}

	// #ifndef
	m =  s.match(/#ifndef\s*([_\w]+)/);
	if (m) {
		const sym = getSym(m);
		return [ true, options && options.defines.find(d => d === sym) !== undefined ];
	}

	return [ false, false ];
}

function matchConditionalEnd(s, options) {
	return s.indexOf('#endif') >= 0;
}

/**
 * Prepare JXML source for parsing.
 */
function preprocessJXMLSource(s) {
	// escape backticks
	s = s.replace(/`/g, '\\`');

	// wrap script content in template literal
	s = s.replace(/<script>/g, '<script>{`');
	s = s.replace(/<\/script>/g, '`}</script>');

	// wrap jcss content in template literal
	s = s.replace(/<jcss>/g, '<jcss>{`');
	s = s.replace(/<\/jcss>/g, '`}</jcss>');

	// wrap style content in template literal
	s = s.replace(/<style>/g, '<style>{`');
	s = s.replace(/<\/style>/g, '`}</style>');

	// enclose comment in expressions
	// s = s.replace(/<\!\-\-\s*([\s\S]*?)\s*\-\->/g, '{ /* $1 */ }');
	s = s.replace(/<\!\-\-\s*([\s\S]*?)\s*\-\->/g, (match, comment) => {
		// check if it's safe to use block comment
		if (!comment.match(/(\/\*)|(\*\/)/)) {
			return `{ /* ${comment} */ }`;
		}
		return `{\n${comment.replace(/^(.*)/mg, '// $1')}\n}`;
	});

	return s;
}


function buildConditionalStack(path, getPre, getPost, options) {

	let stack = [];

	function proc(lst, p) {
		lst.forEach(i => {
			let [ cond, trim ] = matchConditionalStart(i.value, p, options);
			if (cond) {
				stack.push({
					cond: i,
					type: 'open',
					trim,
					path: p
				});
			} else if (matchConditionalEnd(i.value, options)) {
				stack.push({
					cond: i,
					type: 'close',
					path: p
				});
			}
		});
	}

	const total = path.container.length;

	for (let key = 0; key < total; key++) {
		let p = path.getSibling(key);

		proc(getPre(p, key, total), p);

		stack.push({
			type: 'path',
			path: p
		});

		proc(getPost(p, key, total), p);
	}

	return stack;
}

function validateAndGatherConditionals(s, options) {
	let open = [], totrim = [], trimming = false;
	for (let f of s) {
		switch (f.type) {
			case 'open':
				open.push(f);
				if (!trimming && f.trim) {
					trimming = true;
				}
				break;
			case 'close':
				if (!open.length) {
					let errMsg = `No matching open conditional for "${f.cond.value}":\n${codeFrame(options.source, f.path.node.loc)}`;
					throw new Error(errMsg);
				}
				open.pop();
				trimming = open.find(f => f.trim) >= 0;
				break;
			case 'path':
				if (trimming) {
					totrim.push(f);
				}
				break;
		}
	}
	if (open.length) {
		let errMsg = open.map(f => `No matching close conditional for "${f.cond.value}":\n${codeFrame(options.source, f.cond.loc)}`).join('\n');
		throw new Error(errMsg);
	}
	return totrim;
}

/**
 * Remove conditional blocks from program AST. The conditionals are embedded in comments for both JXML
 * ASTs and JavaScript code blocks.
 *
 * @param {*} prog AST to process
 * @param {Object} options existing defines are in array `options.defines`
 * @param {Object} getPre get conditionals before a path
 * @param {Object} getPost get conditionals after a path
 * @param {Object} [traversalOptions={}] traversal options. For AST without scope, pass `noScope: true`.
 */
function removeConditionalBlocks(prog, options, getPre, getPost, traversalOptions = {}) {

	traverse(prog, {
		...traversalOptions,
		enter: (path) => {

			// process list head only
			if (!path.inList || path.key != 0) return;

			const stack = buildConditionalStack(path, getPre, getPost, options);
			const totrim = validateAndGatherConditionals(stack, options);

			// validate each node before deletion
			totrim.forEach(f => {
				f.path.traverse({
					...traversalOptions,
					enter: (path) => {
						if (!path.inList && path.key != 0) return;
						const stack = buildConditionalStack(path, getPre, getPost, options);
						validateAndGatherConditionals(stack, options);
					}
				});
			});

			// delete
			totrim.forEach(f => f.path.remove());
		}
	});
}

/**
 * Preprocess JXML AST node.
 */
function preprocessJXMLNode(path, options) {

	function match(p) {
		return p.node.type === 'JSXExpressionContainer' &&
			p.node.expression.type === 'JSXEmptyExpression' &&
			p.node.expression.innerComments;
	}

	function getConditionals(p) {
		return p.node.expression.innerComments;
	}

	function getPre(path, i, total) {
		if (match(path) && i < total - 1) {
			return getConditionals(path);
		}
		return [];
	}

	function getPost(path, i, total) {
		if (match(path) && i == total - 1) {
			return getConditionals(path);
		}
		return [];
	}

	removeConditionalBlocks(path.node, options, getPre, getPost, { noScope: true });
}

/**
 * Preprocess program AST.
 */
function preprocessAST(prog, options) {

	function getPre(path, i, total) {
		return path.node.leadingComments || [];
	}

	function getPost(path, i, total) {
		if (i == total - 1) {
			let comments = path.node.trailingComments || [];
			/*
			 * Given:
			 *     test(function() {
			 *         // one
			 *         var a = 1;
			 *         // two
			 *       } // three
			 *     );
			 *
			 * For some reason, the trailing comments of the last statement of the anonymous
			 * function (two, three) are also included in the trailing comments of the anonymous
			 * function itself. This could be a Babel bug.
			 */
			if (path.node.type === 'FunctionExpression' && path.node.loc) {
				comments = comments.filter(c => c.loc.start.line >= path.node.loc.end.line);
			}
			return comments;
		}
		return [];
	}

	removeConditionalBlocks(prog, options, getPre, getPost);
}

/**
 * Get component name as [<namespace>, <name>, <loc>], if member reference
 * is involved, object name is appended to <namespace> and member
 * name is used as <name>
 */
function getNamespacedName(comp, nsMap) {
	const ns = comp.namespace || '__default__';
	if (nsMap[ns] === undefined) {
		throw new Error(`Invalid namespace ${ns}`);
	}
	const loc = nsMap[ns].loc;

	if (comp.module) {
		if (nsMap[ns].value !== '') {
			return [nsMap[ns].value + '.' + comp.module, comp.name, loc];
		} else {
			return [comp.module, comp.member, loc];
		}
	} else {
		return [nsMap[ns].value, comp.name, loc];
	}
}

function _toArray(name) {
	if (name[0].length > 0) {
		return [...name[0].split('.'), name[1]];
	}
	return [name[1]];
}

/**
 * Get global reference for a namespaced module name [<namespace>, <name>]
 */
function getGlobalReference(name) {
	return `$Modules.__$$__${_toArray(name).join('_')}`;
}

/**
 * Get module path for a namespaced module name [<namespace>, <name>]
 */
function getModulePath(name) {
	return _toArray(name).join('/');
}

/**
 * Rewrite imports of the form 'import 'a.b.c.e'
 */
function rewriteImports(prog) {
	traverse(prog, {
		ImportDeclaration: (path) => {
			const p = path.node.source.value.split('.');
			const ast = T.ast(`var ${p[p.length-1]} = require('${p.join('/')}')`);
			ast.loc = path.node.loc;
			path.replaceWith(ast);
		}
	});
}

/**
 * Call cb on each loc of ast.
 */
function forEachLoc(ast, cb) {
	if (util.isObject(ast)) {
		Object.keys(ast).forEach(k => {
			if (k === 'loc') {
				cb(ast.loc);
			} else {
				forEachLoc(ast[k], cb);
			}
		});
	} else if (util.isArray(ast)) {
		ast.forEach(o => forEachLoc(o, cb));
	}
}

/**
 * Update or set loc on ast via deep traversal.
 */
function setLoc(ast, loc, addIfMissing = false) {
	if (util.isObject(ast)) {
		let found = false;
		Object.keys(ast).forEach(k => {
			if (k === 'loc') {
				ast.loc = loc;
				found = true;
			} else {
				setLoc(ast[k], loc);
			}
		});
		if (addIfMissing && !found) {
			ast.loc = loc;
		}
	} else if (util.isArray(ast)) {
		ast.forEach(o => setLoc(o, loc));
	}
	return ast;
}

module.exports = {
	forEachLoc,
	generate,
	generateError,
	getNamespacedName,
	getGlobalReference,
	getModulePath,
	parse: require('@babel/parser').parse,
	preprocessJXMLSource,
	preprocessJXMLNode,
	preprocessAST,
	rewriteImports,
	setLoc,
	traverse,
	white
}