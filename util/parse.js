// A simple CLI tool to test the parser.

const fs = require('fs');
const parseJXML = require('../index');
const path = require('path');
const SourceNode = require("source-map").SourceNode;
const SourceMapConsumer = require("source-map").SourceMapConsumer;
const SourceMapGenerator = require("source-map").SourceMapGenerator;

const sourceFile = process.argv[2];
let component = path.basename(sourceFile);
component = component.substring(0, component.indexOf('.'));

const options = {
	component,
	module: '',
	defines: [ '_DEBUG', '_DEBUG_CONN', '_EXPLORER' ]
};


function isSplitter(c) {
	switch(c) {
		case 10: // \n
		case 13: // \r
		case 59: // ;
		case 123: // {
		case 125: // }
			return true;
	}
	return false;
}

function _splitCode(code) {
	var result = [];
	var i = 0;
	var j = 0;
	for(; i < code.length; i++) {
		if(isSplitter(code.charCodeAt(i))) {
			while(isSplitter(code.charCodeAt(++i)));
			result.push(code.substring(j, i));
			j = i;
		}
	}
	if(j < code.length)
		result.push(code.substr(j));
	return result;
}

// this is what webpack does for loader result with source only
function nodeForSource(name, source) {
	var lines = source.split("\n");
	var node = new SourceNode(null, null, null,
		lines.map(function(line, idx) {
			var pos = 0;
			return new SourceNode(null, null, null,
				_splitCode(line + (idx != lines.length - 1 ? "\n" : "")).map(function(item) {
					if(/^\s*$/.test(item)) return item;
					var res = new SourceNode(idx + 1, pos, name, item);
					pos += item.length;
					return res;
				})
			);
		})
	);
	node.setSourceContent(name, source);
	return node;
}

// this is what webpack does for loader result with sourcemap
function nodeForSourceAndMap(name, source, sourceMap, originalSource, originalSourceMap) {

	return (async () => {
		if (originalSourceMap) {
			sourceMap = await SourceMapConsumer.with(sourceMap, null, async (consumer) => {
				return SourceMapGenerator.fromSourceMap(consumer);
			});
			// sourceMap = SourceMapGenerator.fromSourceMap(new SourceMapConsumer(sourceMap));
			sourceMap.setSourceContent(name, originalSource);
			originalSourceMap = await SourceMapConsumer.with(originalSourceMap, null, async (consumer) => {
				return consumer;
			});
			// originalSourceMap = new SourceMapConsumer(originalSourceMap);
			sourceMap.applySourceMap(originalSourceMap, name);
			sourceMap = sourceMap.toJSON();
		}

		return await SourceMapConsumer.with(sourceMap, null, async (consumer) => {
			return SourceNode.fromStringWithSourceMap(source, consumer);
		})

		// return SourceNode.fromStringWithSourceMap(source, new SourceMapConsumer(sourceMap));
	})();
}

function save(filename, code, map) {
	fs.writeFileSync(filename + '.js', code);
	console.log('= Generated file saved in ', filename + '.js');
	fs.writeFileSync(filename + '.map', JSON.stringify(map));
	console.log('= SourceMap saved in ', filename + '.map');
}

fs.readFile(sourceFile, (err, data) => {
	if (err) {
		throw err;
	}

	const code = data.toString();
	let { javascript: content, sourcemap: map } = parseJXML(code, sourceFile, options);


	const filename = path.basename(sourceFile);
	const component = filename.substring(0, filename.indexOf('.'));
	const filename2 = component + '.js';

	////////////////////////////////////////////////////////////////////////
	// result from jxml parser

	console.log('====================== code =============================');
	// console.log(content);

	console.log('====================== map =============================');
	console.log(JSON.stringify(map));

	save(filename, content, map);

	////////////////////////////////////////////////////////////////////////
	// using transformed code as loader result
	// doesn't work, sourcemap is for tranformed code instead of jxml

	let node1 = nodeForSource(filename, content).toStringWithSourceMap({ file: filename });

	console.log('====================== code1 =============================');
	// console.log(node1.code);

	console.log('====================== map1 =============================');
	console.log(node1.map.toJSON());

	save(filename + '1', node1.code, node1.map.toJSON());

	////////////////////////////////////////////////////////////////////////
	// using result from jxml parser directly as loader result
	// doesn't work, original sourcemap replaced with sourcemap for tranformed code

	nodeForSourceAndMap(filename, content, map).then((node) => {

		let node2 = node.toStringWithSourceMap({ file: filename });

		console.log('====================== code2 =============================');
		// console.log(node2.code);

		console.log('====================== map2 =============================');
		console.log(node2.map.toJSON());

		save(filename + '2', node2.code, node2.map.toJSON());

		/////////////////////////////////////////////////////////////////////////////////
		// pass transformed js and sourcemap along with original jxml source and sourcemap

		nodeForSourceAndMap(filename, content, node1.map.toJSON(), map.sourceContent[0], map).then((node) => {

			let node3 = node.toStringWithSourceMap({ file: filename });

			console.log('====================== code3 =============================');
			console.log(node3.code);

			console.log('====================== map3 =============================');
			console.log(node3.map.toJSON());

			save(filename + '3', node3.code, node3.map.toJSON());

			///////////////////////////////////////////////////////////////////////////////
			// this result is the same as 3

			// nodeForSourceAndMap(filename, node3.code, node3.map.toJSON()).then((node) => {

			// 	let node4 = node.toStringWithSourceMap({ file: filename });

			// 	console.log('====================== code4 =============================');
			// 	console.log(node4.code);

			// 	console.log('====================== map4 =============================');
			// 	console.log(node4.map.toJSON());

			// 	save(filename + '4', node4.code, node4.map.toJSON());

			// });
		});
	});

});

