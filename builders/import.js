const T = require('@babel/template').default;
const t = require('@babel/types');
const util = require('../util');

const moduleRequireT = T(`NAME = require(MODULE);`);

module.exports = (name, loc) => {
	return util.setLoc(moduleRequireT({
		NAME: t.identifier(util.getGlobalReference(name)),
		MODULE: t.stringLiteral(util.getModulePath(name))
	}), loc, true);
};