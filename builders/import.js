const T = require('@babel/template').default;
const t = require('@babel/types');
const util = require('../util');

const moduleRequireT = T(`NAME = require(MODULE);`);

module.exports = (name, loc) => {
	let ast = util.setLoc(moduleRequireT({
		NAME: t.identifier(util.getGlobalReference(name)),
		MODULE: util.setLoc(t.stringLiteral(util.getModulePath(name)), name[2], true)
	}), loc, true);
	util.setLoc(ast.expression.right, name[2], true);
	return ast;
};