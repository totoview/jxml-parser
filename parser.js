const util = require('./util');

// replace cdata tags with whitespaces
function eraseCDATA(s) {
	const CDATA_OPEN = '<![CDATA[';
	const CDATA_CLOSE = ']]>';

	const is = s.text.indexOf(CDATA_OPEN);
	const ie = s.text.lastIndexOf(CDATA_CLOSE);

	if (is >= 0 && ie >= 0) {
		s.text = s.text.substring(0, is)
			+ util.white(CDATA_OPEN.length)
			+ s.text.substring(is+CDATA_OPEN.length, ie)
			+ util.white(CDATA_CLOSE.length)
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
		default:
			throw new Error(`Unexpected value type ${val.type}`);
		case 'JSXText':
			o.type = 'text';
			o.value = val.value.match(/^[\n\t]*(.*?)[\n\t]*$/)[1];
			break;
		case 'StringLiteral':
			o.type = 'text';
			o.value = val.value;
			break;
		case 'JSXExpressionContainer':
			o.type = 'expression';
			o.value = util.generate(val).code;
			break;
	}
}

// create component from jsx element
function createComponent(je) {
	const oe = je.openingElement;
	let comp = {
		strings: [],
		jcss: [],
		style: [],
		script: [],
		loc: je.loc
	};

	setName(comp, oe.name);
	comp.attributes = oe.attributes.map(a => {
		let attr = { loc: a.loc };
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
						let child = { name: '', attributes: [], loc: c.loc };
						setValue(child, c);

						comp.children = comp.children || [];
						comp.children.push(child);
					}
					break;
				case 'JSXExpressionContainer':
					if (c.expression.type !== 'JSXEmptyExpression') { // ignore comment
						let child = { name: '', attributes: [], loc: c.loc };
						setValue(child, c);

						comp.children = comp.children || [];
						comp.children.push(child);
					}
					break;
				case 'JSXElement':
					if (imatchTag(c, 'script')) {
						collectTemplateLiterals(c, comp.script);
					} else if (imatchTag(c, 'jcss')) {
						collectTemplateLiterals(c, comp.jcss);
					} else if (imatchTag(c, 'string')) {
						let s = createComponent(c);
						if (c.children.length !== 1 && c.children[0].type !== 'JSXText') {
							throw new Error('Unexpected <string>');
						}
						s.value = c.children[0].value;
						s.valueLoc = c.children[0].loc;
						s.loc = c.loc;
						comp.strings.push(s);
					} else {
						parseComponents(c, comp, options);
					}
					break;

			}
		});
	}

	if (parent) {
		parent.children = parent.children || [];
		parent.children.push(comp);
	}

	return comp;
}

// extract namespace map from the component
function getNamespaces(comp) {
	let namespaces = { __default__: { value: '' }};
	comp.attributes.forEach(a => {
		if (a.name === 'xmlns') {
			namespaces.__default__ = { value: a.value, loc: a.loc };
		} else if (a.namespace === 'xmlns') {
			namespaces[a.name] = { value: a.value, loc: a.loc };
		}
	});
	return namespaces;
}

function getStrings(comp) {
	return comp.strings.map(s => {
		let s2 = { value: s.value, loc: s.loc, valueLoc: s.valueLoc };
		s.attributes.forEach(a => {
			if (a.name === 'id') {
				s2.idLoc = a.loc;
			} else if (a.name === 'title') {
				s2.titleLoc = a.loc;
			}
			s2[a.name] = a.value;
		});
		return s2;
	});
}

function getJCSS(comp) {
	return comp.jcss.map(s => eraseCDATA(s));
}

function getScript(comp) {
	return comp.script.map(s => eraseCDATA(s));
}

function getStyle(comp) {
	return comp.style;
}

function getDefaultPlacement(comp) {

	function find(c) {
		if (c.attributes.find(a => a.name === 'container' && a.value === 'default') != undefined) {
			return c;
		}
		for (let child of c.children || []) {
			if (c2 = find(child)) {
				return c2;
			}
		}
	}

	if (c = find(comp)) {
		let attr = c.attributes.find(a => a.name === 'id');
		if (!attr) {
			attr = { name: 'id', type: 'text', value: '$$defaultplacement$$'};
			c.attributes.push(attr);
		}
		return attr.value;
	}
}


module.exports = (path, options) => {

	util.preprocessJXMLNode(path, options);

	let root = parseComponents(path.node, null, options);

	return {
		name: options.component,
		module: options.module,
		source: options.source,
		root: root,
		defaultPlacementID: getDefaultPlacement(root),
		namespaces: getNamespaces(root),
		strings: getStrings(root),
		jcss: getJCSS(root),
		style: getStyle(root),
		script: getScript(root)
	};
};

