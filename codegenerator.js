// generate js from program specification
module.exports = (prog, options) => {
	return require('./builders/program')(prog, options);
};