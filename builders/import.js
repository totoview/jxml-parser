const T = require('@babel/template').default;
const t = require('@babel/types');
const util = require('../util');

const moduleRequireT = T(`NAME = require(MODULE);`);

module.exports = name => {
	return util.setLoc(moduleRequireT({
		NAME: t.identifier(util.getGlobalReference(name)),
		MODULE: t.stringLiteral(util.getModulePath(name))
	}), name[2], true);
};