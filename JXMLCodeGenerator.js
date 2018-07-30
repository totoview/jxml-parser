class JXMLCodeGenerator {
	// generate js from program specification
	generate(prog, options) {
		return require('./builders/program')(prog, options);
	}
}

module.exports = JXMLCodeGenerator;