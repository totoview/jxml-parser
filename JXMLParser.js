const util = require('./util');

// generate string of whitespaces
function white(n) {
	return Array(n).fill(' ').join('');
}

// replace cdata tags with whitespaces
function eraseCDATA(s) {
	const CDATA_OPEN = '<![CDATA[';
	const CDATA_CLOSE = ']]>';

	const is = s.text.indexOf(CDATA_OPEN);
	const ie = s.text.lastIndexOf(CDATA_CLOSE);

	if (is >= 0 && ie >= 0) {
		s.text = s.text.substring(0, is)
			+ white(CDATA_OPEN.length)
			+ s.text.substring(is+CDATA_OPEN.length, ie)
			+ white(CDATA_CLOSE.length)
			+ s.text.substring(ie+CDATA_CLOSE.length);
	}
	return s;
}

// match identifier by name
function imatchTag(e, name) {
	const oe = e.openingElement;
	return oe.name.type === 'JSXIdentifier' && oe.name.name.toLowerCase() === name.toLowerCase();
}

// extract template literal data into col
function collectTemplateLiterals(e, col) {
	e.children.map(c => {
		if (c.type === 'JSXExpressionContainer' && c.expression.type === 'TemplateLiteral') {
			col.push({ loc: c.loc, text: c.expression.quasis[0].value.raw });
		}
	});
}

// set object name with optional namespace or member
function setName(o, name) {
	switch (name.type) {
		default:
			throw new Error(`Unexpected attribute name type ${name.type}`);
		case 'JSXIdentifier':
			o.name = name.name;
			break;
		case 'JSXNamespacedName':
			o.namespace = name.namespace.name;
			o.name = name.name.name;
			break;
		case 'JSXMemberExpression':
			o.name = name.property.name;

			let m = [];
			let obj = name.object;
			while (obj) {

				switch (obj.type) {
					default:
						throw new Error(`Unexpected node type ${obj.type}`);
					case 'JSXIdentifier':
						m.push(obj.name);
						obj = null;
						break;
					case 'JSXMemberExpression':

						m.push(obj.property.name);
						obj = obj.object;
						break;
					case 'JSXNamespacedName':
						o.namespace = obj.namespace.name;
						if (obj.name.type === 'JSXIdentifier') {
							m.push(obj.name.name);
							obj = null;
						}
						break;
				}
			}
			o.module = m.reverse().join('.');
			break;
	};
}

function setValue(o, val) {
	switch (val.type) {
		case 'JSXText':
			o.type = 'text';
			o.value = val.value.match(/^[\n\t]*(.*?)[\n\t]*$/)[1];
			break;
		case 'StringLiteral':
			o.type = 'text';
			o.value = val.value;
			break;
		case 'JSXExpressionContainer':
			const { code } = util.generate(val);
			o.type = 'expression';
			o.value = code;
			break;
	}
}

// create component from jsx element
function createComponent(je) {
	const oe = je.openingElement;
	let comp = {};

	setName(comp, oe.name);
	comp.attributes = oe.attributes.map(a => {
		let attr = {};
		setName(attr, a.name);
		setValue(attr, a.value);
		return attr;
	});

	return comp;
}

// parse component tree
function parseComponents(e, parent, options = {}) {
	const comp = createComponent(e);

	if (imatchTag(e, 'style')) {
		const expr = e.children[0].expression.quasis[0];
		const style = expr.value.raw.split('\n').map(s => s.trim()).join(' ');

		comp.value = {
			type: 'text',
			data: style
		};
	} else {
		e.children.forEach(c => {
			switch (c.type) {
				case 'JSXText':
					if (!c.value.match(/^[\t\n]*$/)) {
						let child = { name: '', attributes: [] };
						setValue(child, c);

						comp.children = comp.children || [];
						comp.children.push(child);
					}
					break;
				case 'JSXExpressionContainer':
					if (c.expression.type !== 'JSXEmptyExpression') { // ignore comment
						let child = { name: '', attributes: [] };
						setValue(child, c);

						comp.children = comp.children || [];
						comp.children.push(child);
					}
					break;
				case 'JSXElement':
					parseComponents(c, comp, options);
					break;

			}
		});
	}

	parent.children = parent.children || [];
	parent.children.push(comp);
}

class JXMLParser {
	constructor() {
		this.strings = [];
		this.jcss = [];
		this.style = [];
		this.script = [];
	}

	parse(path, options) {

		util.preprocessJXMLNode(path, options);

		this.root = createComponent(path.node);

		path.node.children.forEach(e => {
			switch (e.type) {
				default:
					console.log(e);
					throw new Error(`Unexpected node type: ${e.type}`);
				case 'JSXText':
				case 'JSXExpressionContainer':
					// ignore
					break;
				case 'JSXElement':
					if (imatchTag(e, 'script')) {
						this.addScript(e);
					} else if (imatchTag(e, 'jcss')) {
						this.parseJCSS(e);
					} else if (imatchTag(e, 'string')) {
						this.addString(e);
					} else {
						this.addComponent(e, options);
					}
					break;
			}
		});

		this.processNamespaces();
		this.processJCSS();
		this.processScript();
		this.checkDefaultPlacement();

		return {
			name: options.component,
			module: options.module,
			source: options.source,
			root: this.root,
			defaultPlacementID: this.defaultPlacementID,
			namespaces: this.namespaces,
			strings: this.strings.map(s => {
				let s2 = { value: s.value };
				s.attributes.forEach(a => {
					s2[a.name] = a.value;
				});
				return s2;
			}),
			jcss: this.jcss,
			style: this.style,
			script: this.script
		};
	}


	parseJCSS(e) {
		collectTemplateLiterals(e, this.jcss);
	}

	addScript(e) {
		collectTemplateLiterals(e, this.script);
	}

	addString(e) {
		let s = createComponent(e);
		if (e.children.length !== 1 && e.children[0].type !== 'JSXText') {
			throw new Error('Unexpected <string>');
		}
		s.value = e.children[0].value;
		this.strings.push(s);
	}

	addComponent(e, options) {
		parseComponents(e, this.root, options);
	}

	// extract namespace map from the root component
	processNamespaces() {
		this.namespaces = { __default__: '' };
		this.root.attributes.forEach(a => {
			if (a.name === 'xmlns') {
				this.namespaces.__default__ = a.value;
			} else if (a.namespace === 'xmlns') {
				this.namespaces[a.name] = a.value;
			}
		});
	}

	processJCSS() {
		this.jcss = this.jcss.map(s => eraseCDATA(s));
	}

	processScript() {
		this.script = this.script.map(s => eraseCDATA(s));
	}

	checkDefaultPlacement() {

		function find(c) {
			if (c.attributes.find(a => a.name === 'container' && a.value === 'default') != undefined) {
				return c;
			}
			for (let i = 0; c.children && i < c.children.length; i++) {
				let c2 = find(c.children[i]);
				if (c2) {
					return c2;
				}
			}
		}

		let comp = find(this.root);
		if (comp) {
			let a = comp.attributes.find(a => a.name === 'id');
			if (!a) {
				a = { name: 'id', type: 'text', value: '$$defaultplacement$$'};
				comp.attributes.push(a);
			}
			this.defaultPlacementID = a.value;
		}
	}
}

module.exports = JXMLParser;

