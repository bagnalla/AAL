(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Puddi = require ('./puddi/puddi.js');
var Drawable = require('./puddi/puddidrawable.js');
var Objects = require('./arrayobjects.js');
var Cell = Objects.Cell;
var Variable = Objects.Variable;
var Array = Objects.Array;
var Vector = require('victor');
var Range = ace.require('ace/range').Range;

var StackFrame = function(parent, label = "") {
    Drawable.call(this, parent);
    this._label = label;
    this._variables = [];
};

StackFrame.prototype = Object.create(Drawable.prototype);
StackFrame.prototype.constructor = StackFrame;

StackFrame.prototype.addVariable = function(v) { this._variables.push(v); };
StackFrame.prototype.removeVariable = function(v) {
    for (let i = 0; i < this._variables.length; ) {
	if (this._variables[i].equals(v)) {
	    this._variables.splice(i, 1);
	    this.removeChildAt(i);
	}
	else {
	    i++;
	}
    }
};
StackFrame.prototype.getVariables = function() { return this._variables; };

StackFrame.prototype.getWidth = function() {
    let h = 0;
    for (let v of this._variables) {
	h += v.getWidth();
    }
    return h;
};

StackFrame.prototype.getHeight = function() {
    let h = 0;
    for (let v of this._variables) {
	h += v.getHeight();
    }
    return h;
};

StackFrame.prototype._getLabelWidth = function(ctx) {
    let w = 0;
    for (let v of this._variables) {
	let vw = v.getLabelWidth(ctx);
	if (vw > w) {
	    w = vw;
	}
    }
    return w;
};

StackFrame.prototype.setVariablePositions = function(ctx) {
    if (!this._variables.length) {
	return;
    }
    let labelWidth = this._getLabelWidth(ctx) + 9;
    let offset_y = this._variables[0].getHeight() / 2 +
	10 / 2 // get font height from ctx;
    for (let v of this._variables) {
	// let h = v.getHeight();
	v.setPosition(new Vector(labelWidth + 1 /* width of line */,
				 offset_y));
	offset_y += v.getHeight();
    }
    return labelWidth;
};

StackFrame.prototype._drawSelf = function(ctx) {
    let labelWidth = this.setVariablePositions(ctx);
    let textHeight = 10; // get from ctx font
    ctx.fillText(this._label, 1, 0);
    // let w = this.getWidth();
    let w = ctx.canvas.width * (1 / Puddi.getScale());
    let h = this.getHeight();
    ctx.fillStyle = "gray";
    ctx.fillRect(0, textHeight / 2, w, h);
    ctx.strokeRect(0, textHeight / 2, w, h);
    // ctx.strokeStyle = "#2f4f4f";
    // ctx.lineWidth = 2;
    // for (let v of this._variables) {
    // 	let pos = v.getPosition();
    // 	let vh = v.getHeight();
    // 	ctx.beginPath();
    // 	ctx.moveTo(0, pos.y + vh / 2);
    // 	ctx.lineTo(labelWidth, pos.y + vh / 2);
    // 	ctx.closePath();
    // 	ctx.stroke();
    // }
    
    ctx.fillStyle = "#bebebe";//"#d3d3d3";//"#696969";
    ctx.fillRect(0, textHeight / 2, labelWidth, this.getHeight());
};

let BASE_CELL_VELOCITY = 0.06;
// let BASE_CELL_COLOR_FADE_RATE = 0.05;

var AnimInterpreter = function(endCallback, statusCallback, canvas,
			       parent, aprog = []) {
    Drawable.call(this, parent);
    this.setProg(aprog);
    this._frame_stack = [];
    this.init();
    this._endCallback = endCallback;
    this._statusCallback = statusCallback;
    this._canvas = canvas;
};

AnimInterpreter.prototype = Object.create(Drawable.prototype);
AnimInterpreter.prototype.constructor = AnimInterpreter;

AnimInterpreter.prototype.setProg = function(aprog) {
    this._aprog = aprog; // array of commands
};

AnimInterpreter.prototype.reset = function() {
    this._pc = 0;
    this._autoplay_counter = 0;
    this._clear_frame_stack();
    this._frame_stack = [new StackFrame(this, "main")];
    this._var_map = []; // map anim_ids to (variable, frame) pairs
    this._setActiveLine(-1);
}

AnimInterpreter.prototype.init = function() {
    this._editor = ace.edit("editor");
    this.reset();
    this._autoplay = false;
    this._autoplay_period = 1000;
    this._fast_forward = false;
    this._cell_velocity = BASE_CELL_VELOCITY;
};

AnimInterpreter.prototype._createCell = function(parent, value) {
    let c = new Cell(parent, value);
    c.setVelocity(this._cell_velocity);
    return c;
}

AnimInterpreter.prototype._parseValue = function(parent, value) {
    console.log("parsing value: " + value);
    switch (value[0]) {
    case "AAtom":
	return this._createCell(parent, value[1]);
    case "AArray":
	let arr = new Array(parent);
	for (let v of value[1]) {
	    arr.addElement(this._parseValue(arr, v));
	    // addValueToArray(arr, v);
	}
	return arr;
    default:
	console.log("error in parseValue in animinterp.js");
	console.log(value[0]);
    }
};

AnimInterpreter.prototype._getCurrentFrame = function() {
    return this._frame_stack[this._frame_stack.length - 1];
};

function parseId(id) { return id; };

AnimInterpreter.prototype._create = function(id, ty, lbl) {
    let curFrame = this._getCurrentFrame();
    let v = new Variable(curFrame, lbl);
    curFrame.addVariable(v);
    this._var_map[id] = [v, curFrame];
    switch (ty) {
    case "ATVar":
	v.setElement(this._createCell(v, ""));
	break;
    case "ATArray":
	v.setElement(new Array(v));
	break;
    default:
	console.log("error in create in animinterp.js");
    }
};

AnimInterpreter.prototype._destroy = function(id) {
    let vid = parseId(id);
    let a = this._var_map[vid];
    let v = a[0];
    let frame = a[1];
    frame.removeVariable(v);
    delete this._var_map[vid];
};

AnimInterpreter.prototype._insert = function(id, index, value) {
    console.log("in insert");
    let vid = parseId(id);
    let v = this._var_map[vid][0];
    let arr = v.getElement(); // assume it's an array
    arr.insertElement(this._parseValue(arr, value), index);
};

AnimInterpreter.prototype._delete = function(id, index) {
    let vid = parseId(id);
    let v = this._var_map(vid)[0];
    let arr = v.getElement(); // assume it's an array
    arr.deleteAt(index);
};

AnimInterpreter.prototype._assign = function(loc, value) {
    console.log("in assign");
    console.log(value);
    let id = loc[1];
    let vid = parseId(id);
    let v = this._var_map[vid][0];
    switch (loc[0]) {
    case "LVar":
	v.setElement(this._parseValue(v, value));
	break;
    case "LArrayCell":
	let index = loc[1];
	let arr = v.getElement(); // assume it's an array
	arr.assignAt(index, this._parseValue(arr, value));
	break;
    default:
	console.log("error in assign in animinterp.js");
    }
};

AnimInterpreter.prototype._swap = function(id, index1, index2) {
    let vid = parseId(id);
    let v = this._var_map[vid][0];
    let arr = v.getElement(); // assume it's an array
    arr.swap(index1, index2);
};

AnimInterpreter.prototype._clear = function(id) {
    let vid = parseId(id);
    let v = this._var_map[vid][0];
    let arr = v.getElement(); // assume it's an array
    arr.clear();
};

AnimInterpreter.prototype._interpInstr = function(instr) {
    console.log("interpreting " + instr[0]);
    console.log(instr);
    switch (instr[0]) {
    case "ICreate":
	var id = instr[1];
	var ty = instr[2];
	var lbl = instr[3];
	this._create(id, ty, lbl);
	break;
    case "IDestroy":
	id = instr[1];
	this._destroy(id);
	break;
    case "IInsert":
	id = instr[1];
	var index = instr[2];
	var value = instr[3];
	this._insert(id, index, value);
	break;
    case "IDelete":
	id = instr[1];
	index = instr[2];
	this._delete(id, index);
	break;
    case "IAssign":
	let loc = instr[1];
	value = instr[2];
	this._assign(loc, value);
	break;
    case "ISwap":
	id = instr[1];
	index1 = instr[2];
	index2 = instr[3];
	this._swap(id, index1, index2);
	break;
    case "IClear":
	id = instr[1];
	this._clear(id);
	break;
    default:
	console.log("unknown animation instruction");
    }
};

AnimInterpreter.prototype._addFrame = function(label) {
    this._frame_stack.push(new StackFrame(this, label));
};

AnimInterpreter.prototype._deleteFrame = function() {
    let frame = this._frame_stack.pop();
    this.removeChild(frame);
};

AnimInterpreter.prototype._clear_frame_stack = function() {
    while (this._frame_stack.length) {
	this._deleteFrame();
    }
};

AnimInterpreter.prototype._computeFrameStackHeight = function() {
    let h = 0;
    for (let frame of this._frame_stack) {
	h += frame.getHeight();
    }
    return h;
}

AnimInterpreter.prototype._setActiveLine = function(lnum) {
    if (this._activeLineMarker !== null) {
	this._editor.session.removeMarker(this._activeLineMarker);
    }
    if (lnum >= 0) {
	this._activeLineMarker =
	    this._editor.session.addMarker(new Range(lnum-1, 0, lnum-1, 1),
					   "lineMarker", "fullLine");
    }
    else {
	this._activeLineMarker = null;
    }
};

AnimInterpreter.prototype._lnum_of_com = function(com) {
    return com[1][1];
}

AnimInterpreter.prototype._interpCom = function(com) {
    console.log("interpreting " + com[0]);
    switch (com[0]) {
    case "CFrameBegin":
	var flabel = com[1][0];
	var lnum = com[1][1];
	this._addFrame(flabel);
	break;
    case "CFrameEnd":
	lnum = com[1];
	this._deleteFrame();
	break;
    case "CStep":
	let instrs = com[1][0];
	lnum = com[1][1];
	for (let instr of instrs) {
	    this._interpInstr(instr);
	}
	break;
    default:
	console.log("unknown animation command");
    }
};

AnimInterpreter.prototype.stepForward = function() {
    if (this._pc >= this._aprog.length) {
	return;
    }
    console.log("stepping. pc = " + this._pc);
    this._interpCom(this._aprog[this._pc]);
    this._pc++;

    if (this._pc == this._aprog.length) {
	this._setActiveLine(-1);
	if (this._endCallback) {
	    this._endCallback();
	}
    }
    else {
	let lnum = this._lnum_of_com(this._aprog[this._pc]);
	this._setActiveLine(lnum);
    }
};

AnimInterpreter.prototype.isDone = function() {
    return this._pc >= this._aprog.length;
}

AnimInterpreter.prototype._skipTo = function(i) {
    while (this._pc < i) {
	this.stepForward();
    }
};

AnimInterpreter.prototype.stepBack = function() {
    let pc = this._pc;
    if (!pc) { return; }
    this.reset();
    this._skipTo(pc - 1);
    for (let frame of this._frame_stack) {
	for (let v of frame.getVariables()) {
	    let arr = v.getElement();
	    if (arr.setPositions) {
		arr.setPositions();
	    }
	}
    }
};

AnimInterpreter.prototype.getPlaySpeed = function() {
    return this._play_speed;
};

AnimInterpreter.prototype.getPc = function() {
    return this._pc;
}

AnimInterpreter.prototype.getProgramLength = function() {
    return this._aprog.length();
}

AnimInterpreter.prototype._updateCellVelocity = function(v) {
    this._cell_velocity = v;

    // update all existing cells with new velocity
    for (let frame of this._frame_stack) {
	for (let v of frame.getVariables()) {
	    let el = v.getElement();
	    if (el.setCellVelocity) {
		el.setCellVelocity(this._cell_velocity);
	    }
	    else {
		el.setVelocity(this._cell_velocity);
	    }
	}
    }
}

AnimInterpreter.prototype.getAutoplayPeriod = function() {
    return this._autoplay_period;
};

AnimInterpreter.prototype.setAutoplayPeriod = function(p) {
    this._autoplay_period = p;
    this._updateCellVelocity(Math.min(1, (BASE_CELL_VELOCITY * 1000) / this._autoplay_period));
};

AnimInterpreter.prototype.getAutoplay = function() { return this._autoplay; };

AnimInterpreter.prototype.setAutoplay = function(a) {
    this._autoplay = a;
    if (a) {
	this._updateCellVelocity(Math.min(1, (BASE_CELL_VELOCITY * 1000) / this._autoplay_period));
    }
    else {
	this._updateCellVelocity(BASE_CELL_VELOCITY);
    }
};

AnimInterpreter.prototype._updateSelf = function(time_elapsed) {
    if (this._autoplay) {
	if (this._fast_forward) {
	    this.stepForward();
	}
	else {
	    this._autoplay_counter += time_elapsed;
	    if (this._autoplay_counter >= this._autoplay_period) {
		this._autoplay_counter = 0;
		this.stepForward();
	    }
	}
    }
    if (this._statusCallback) {
	this._statusCallback({ pc: this._pc });
    }
}

AnimInterpreter.prototype._drawSelf = function(ctx) {
    let frameStackHeight = this._computeFrameStackHeight();
    let actualHeight = frameStackHeight +
	this._frame_stack.length * 20; // from font height
    let overflow = Math.max(0, actualHeight -
			    this._canvas.height * (1 / Puddi.getScale()));
    offset_y = 10 - overflow; // font height from ctx
    for (let frame of this._frame_stack) {
	frame.setPosition(new Vector(0, offset_y));
	offset_y += frame.getHeight() + 20; // get font height from ctx
    }
};

// EXPORT
module.exports = AnimInterpreter;



},{"./arrayobjects.js":2,"./puddi/puddi.js":6,"./puddi/puddidrawable.js":7,"victor":5}],2:[function(require,module,exports){
var Puddi = require('./puddi/puddi.js');
var Drawable = require('./puddi/puddidrawable.js');
var Vector = require('victor');

// CELL

var MIN_CELL_WIDTH = 25;
var MIN_CELL_HEIGHT = 25;
var DEFAULT_CELL_VELOCITY = 0.1;

function Cell(parent, value = "") {
    Drawable.call(this, parent);
    this.setVelocity(DEFAULT_CELL_VELOCITY);
    // this._width = MIN_CELL_WIDTH; // set by setValue
    this._height = MIN_CELL_HEIGHT;
    this._redStrength = 0.0;
    this._greenStrength = 0.0;
    this._blueStrength = 0.0;
    this.setValue(value);
}

Cell.prototype = Object.create(Drawable.prototype);
Cell.prototype.constructor = Cell;

Cell.prototype.getValue = function() { return this._value; };
Cell.prototype.getWidth = function() { return this._width; };
Cell.prototype.getHeight = function() { return this._height; };

Cell.prototype.setValue = function(v) {
    this._value = v;
    let ctx = Puddi.getCtx();
    let textWidth = ctx.measureText(this._value).width;
    this._width = Math.max(MIN_CELL_WIDTH, textWidth + 8);
};

Cell.prototype.flashRed = function() { this._redStrength = 1.0; };
Cell.prototype.flashGreen = function() { this._greenStrength = 1.0; };
Cell.prototype.flashBlue = function() { this._blueStrength = 1.0; };

Cell.prototype._updateSelf = function(time_elapsed) {
    // do stuff
    let fade = this._velocity / 50 * time_elapsed;
    this._redStrength -= fade;
    this._greenStrength -= fade;
    this._blueStrength -= fade;
    
    this.setColor("rgb(" + Math.floor(this._redStrength * 255) + ", " +
    		  Math.floor(this._greenStrength * 255) + ", " +
    		  Math.floor(this._blueStrength * 255) + ")");
    
    // console.log("cell position: " + this.getPosition());
    // console.log("cell target position: " + this.getTargetPosition());
};

Cell.prototype._drawSelf = function(ctx) {
    ctx.lineWidth = 2;
    let textWidth = ctx.measureText(this._value).width;
    let textHeight = 10; // get font size from ctx
    ctx.fillStyle = "white";
    ctx.fillRect(0, -this._height / 2, this._width, this._height);
    ctx.strokeRect(0, -this._height / 2, this._width, this._height);
    ctx.fillStyle = "black";
    ctx.fillText(this._value, this._width / 2 - textWidth / 2,
		 textHeight / 2.5);
};


// VARIABLE

// var MAX_LABEL_WIDTH = 50;

function Variable(parent, label = "") {
    Drawable.call(this, parent);
    this._label = label;
}

Variable.prototype = Object.create(Drawable.prototype);
Variable.prototype.constructor = Variable;

Variable.prototype.getLabel = function() { return this._label; };
Variable.prototype.getWidth = function() { return this._element.getWidth(); };
Variable.prototype.getHeight = function() { return this._element.getHeight(); };
Variable.prototype.getElement = function() { return this._element; };
// Variable.prototype.getMaxLabelWidth = function(ctx) { return MAX_LABEL_WIDTH; }
Variable.prototype.getLabelWidth = function(ctx) {
    return ctx.measureText(this._label).width;
};

Variable.prototype.setLabel = function(l) { this._label = l; };
// Variable.prototype.setValue = function(v) { this._cell.setValue(v); };
// Variable.prototype.clear = function() { this._cell.setValue(""); };
Variable.prototype.setElement = function(el) {
    if (this._element) {
	this.removeChild(this._element);
    }
    this._element = el;
    el.flashRed();
};

Variable.prototype._drawSelf = function(ctx) {
    // draw label
    //let labelWidth = ctx.measureText(this._label).width;
    ctx.fillText(this._label, 0 // need single cell width
		 - this.getLabelWidth(ctx) - 6, 2.5);
}


// ARRAY

function Array(parent) {
    Drawable.call(this, parent);
    this._elements = [];
}

Array.prototype = Object.create(Drawable.prototype);
Array.prototype.constructor = Array;

Array.prototype.getWidth = function() {
    let w = 0;
    for (let el of this._elements) {
	w += el.getWidth();
    }
    return Math.max(w, MIN_CELL_WIDTH);
};

Array.prototype.getHeight = function () {
    let maxHeight = 0;
    for (let el of this._elements) {
	let h = el.getHeight();
	if (h > maxHeight) {
	    maxHeight = h;
	}
    }
    return Math.max(maxHeight, MIN_CELL_HEIGHT);
}

Array.prototype.getElements = function() { return this._elements; };

Array.prototype._setElementPosition = function(el, i) {
    let w = 0;
    for (let j = 0; j < i; j++) {
	w += this._elements[j].getWidth();
    }
    el.setPosition(new Vector(w, 0));
    el.setTargetPosition(new Vector(w, 0));
}

Array.prototype._computeElementPositions = function() {
    positions = [];
    acc = 0;
    for (let el of this._elements) {
	positions.push(new Vector(acc, 0));
	acc += el.getWidth();
    }
    return positions;
}

Array.prototype._setAllElementPositions = function() {
    let positions = this._computeElementPositions();
    for (let i = 0; i < positions.length; i++) {
	this._elements[i].setPosition(positions[i]);
    }
}

Array.prototype._setAllElementTargetPositions = function() {
    let positions = this._computeElementPositions();
    for (let i = 0; i < positions.length; i++) {
	this._elements[i].setTargetPosition(positions[i]);
    }
}

// hard set the elements to their positions
Array.prototype.setPositions = function() {
    this._setAllElementPositions();
    this._setAllElementTargetPositions();
}

Array.prototype.addElement = function(o) {
    this._elements.push(o);
    // this.addChild(o); // the element adds itself
    this._setElementPosition(o, this._elements.length - 1);
    o.flashGreen();
};

Array.prototype.insertElement = function(o, i) {
    this._elements.splice(i, 0, o);
    this._setElementPosition(o, i);
    this._setAllElementTargetPositions();
    o.flashGreen();
};

Array.prototype.deleteAt = function(i) {
    this.removeChild(this._elements[i]);
    this._elements.splice(i, 1);
    this._setAllElementTargetPositions();
};

Array.prototype.assignAt = function(i, o) {
    this.removeChild(this._elements[i]);
    this._elements[i] = o;
    o.flashGreen();
};

Array.prototype.clear = function() {
    this.clearChildren();
    this._elements = [];
};

// need to create copies
// Array.prototype.copy = function(arr) {
//     this.clear();
//     for (let el of arr.getElements()) {
// 	this.addElement(el);
//     }
//     this._setAllElementPositions();
// };

Array.prototype.swap = function(index1, index2) {
    let el1 = this._elements[index1];
    let el2 = this._elements[index2];
    let tmp = el1.getTargetPosition();
    // swap graphically
    // el1.setTargetPosition(el2.getTargetPosition());
    // el2.setTargetPosition(tmp);
    // el1.flashBlue();
    // el2.flashBlue();
    // swap internally
    this._elements[index1] = el2;
    this._elements[index2] = el1;
    // swap graphically
    el1.flashBlue();
    el2.flashBlue();
    this._setAllElementTargetPositions();
}

Array.prototype.flashRed = function() {
    for (let el of this._elements) {
	el.flashRed();
    }
}
Array.prototype.flashGreen = function() {
    for (let el of this._elements) {
	el.flashGreen();
    }
}
Array.prototype.flashBlue = function() {
    for (let el of this._elements) {
	el.flashBlue();
    }
}

Array.prototype.setCellVelocity = function(v) {
    for (let el of this._elements) {
	if (el.setCellVelocity) {
	    el.setCellVelocity(v);
	}
	else {
	    el.setVelocity(v);
	}
    }
}

Array.prototype._drawSelf = function(ctx) {
    // console.log("array position: " + this.getPosition());
    // let labelWidth = ctx.measureText(this._label).width;
    // ctx.fillText(this._label, -labelWidth, 0);
}

module.exports = {
    Cell: Cell,
    Variable: Variable,
    Array: Array
};

},{"./puddi/puddi.js":6,"./puddi/puddidrawable.js":7,"victor":5}],3:[function(require,module,exports){
var sexp = require('sexp');

var Puddi = require('./puddi/puddi.js');
var PuddiDrawable = require('./puddi/puddidrawable.js');
var Vector = require('victor');

var Objects = require('./arrayobjects.js');
var Cell = Objects.Cell;
var Variable = Objects.Variable;
var AArray = Objects.Array;

var Interp = require('./animinterp.js');

var hotkeysEnabled = false;
var autoplaying = false;
var compiling = false;

var timeoutId = null;

function startEdit() {
    hotkeysEnabled = false;

    $("#canvas").css("visibility", "hidden");
    $("#status").css("visibility", "hidden");
    $("#editbutton").css("display", "none");
    $("#playbutton").css("display", "none");
    $("#stopbutton").css("display", "none");
    $("#stepbutton").css("display", "none");
    $("#backbutton").css("display", "none");
    $("#fasterbutton").css("display", "none");
    $("#slowerbutton").css("display", "none");
    $("#resetbutton").css("display", "none");
    $("#cancelbutton").css("display", "none");
    $("#stepinterval").css("display", "none");

    $("#gobutton").css("display", "inline");

    interpreter.reset();
    let editor = ace.edit("editor");
    editor.setReadOnly(false);

    $("#feedback").text("Press 'Go' to compile.");
}

function startCompile() {
    hotkeysEnabled = true;
    compiling = true;

    $("#gobutton").css("display", "none");
    $("#cancelbutton").css("display", "inline");
    $("#feedback").html("Compiling...<br>Note: if your program doesn't terminate this will run for 10 seconds before timing out and may use a lot of memory.<br>Press 'Cancel' to cancel compilation early and return to editing.");

    let editor = ace.edit("editor");
    editor.setReadOnly(true);
}

function stopCompile() {
    compiling = false;
}

function startAnimation(aprog) {
    let coms = aprog[2];
    interpreter.setProg(coms);
    $("#cancelbutton").css("display", "none");

    $("#canvas").css("visibility", "visible");
    $("#status").css("visibility", "visible");
    $("#editbutton").css("display", "inline");
    $("#playbutton").css("display", "inline");
    $("#stepbutton").css("display", "inline");
    $("#backbutton").css("display", "inline");
    $("#resetbutton").css("display", "inline");

    $("#status").text("Paused");

    $("#feedback").html("Ready.<br>Press 'Play' to start the animation or 'Step' to go one step at a time.<br>Press 'Edit' to end the animation and return to editing the program.");
}

function startAutoplay() {
    interpreter.setAutoplay(true);
    autoplaying = true;

    $("#stopbutton").css("display", "inline");
    $("#fasterbutton").css("display", "inline");
    $("#slowerbutton").css("display", "inline");
    $("#stepinterval").css("display", "inline");

    $("#playbutton").css("display", "none");
    $("#stepbutton").css("display", "none");
    $("#backbutton").css("display", "none");

    $("#status").text("Playing");
}

function stopAutoplay() {
    interpreter.setAutoplay(false);
    autoplaying = false;

    $("#stopbutton").css("display", "none");
    $("#fasterbutton").css("display", "none");
    $("#slowerbutton").css("display", "none");
    $("#stepinterval").css("display", "none");

    $("#playbutton").css("display", "inline");
    $("#stepbutton").css("display", "inline");
    $("#backbutton").css("display", "inline");

    $("#status").text("Paused");
}


function errorMsg(msg) {
    $("#feedback").html(msg);
}

function updateStepInterval() {
    $("#stepinterval").text("Step interval: " +
			    interpreter.getAutoplayPeriod()+ "ms");   
}

function cancelTimeout() {
    if (timeoutId !== null) {
	clearTimeout(timeoutId);
	timeoutId = null;
    }
}

function createWorker() {
    var worker = new Worker ("./scripts/aaljs.js");
    worker.onmessage = function (m) {
	if (typeof m.data == 'string') {
            console.log("" + m.data);
	} else {
            console.log ("[ASYNCH] back from " + m.data.fname);
            var handler = worker_handler[m.data.fname];
            handler (m.data.result);
	}
    }
    worker.onerror = function(event) {
	startEdit();
	cancelTimeout();
	$("#feedback").text("Compiler exception: " + event.message);
    };
    return worker;
}

var worker_handler = new Object ();
var worker = createWorker();

function ASYNCH (action_name, action_args, cont) {
    worker_handler[action_name] = cont;
    worker.postMessage ({fname: action_name, args: action_args});
    console.log ("[ASYNCH] " + action_name + " (" + action_args + ")");
}

function cancelWorker () {
    worker.terminate();
    worker = undefined;
    worker = createWorker();
}

function startTimeout() {
    timeoutId = setTimeout(function() {
	cancelWorker();
	startEdit();
	$("#feedback").text("Compilation timed out after 10 seconds.");
    }, 10000);
}

function compile () {
    let editor = ace.edit("editor");
    var txt = editor.getValue();
    startTimeout();
    ASYNCH ("compile", [txt], function (resp) {
	stopCompile();
	cancelTimeout();
	// console.log("response from compile: " + resp);
	let response = sexp(resp);
	switch (response[0]) {
	case "SuccessResponse":
	    let success = response[1];
	    let result = success[0];
	    let aprog = success[1];
	    startAnimation(aprog);
	    break;
	case "ErrorResponse":
	    let error = response[1];
	    startEdit();
	    errorMsg(error);
	    break;
	default:
	    startEdit();
	    errorMsg("unknown response from server");
	}
    })
}

var playEnabled = true;
function setPlayDisabled(b) {
    $("#playbutton").prop('disabled', b);
    $("#stepbutton").prop('disabled', b);
    playEnabled = !b;
}

var backEnabled = true;
function setBackDisabled(b) {
    $("#backbutton").prop('disabled', b);
    backEnabled = !b;
}

function increaseFontSize(editor) {
    editor.setOption("fontSize", editor.getOption("fontSize") + 1);
    editor.resize();
}

function decreaseFontSize(editor) {
    editor.setOption("fontSize",
		     Math.max(6, editor.getOption("fontSize") - 1));
    editor.resize();
}

function init() {
    $("#gobutton").click(function() {
	startCompile();
	compile();
	setPlayDisabled(false);	
    });

    $("#cancelbutton").click(function() {
	cancelTimeout();
	cancelWorker();
	stopCompile();
	startEdit();
    });

    $("#stepbutton").click(function() {
	interpreter.stepForward();
    });

    $("#editbutton").click(function() {
	stopAutoplay();
	startEdit();
    });

    $("#resetbutton").click(function() {
	interpreter.reset();
	setPlayDisabled(false);
    });

    $("#playbutton").click(function() {
	if (!interpreter.isDone()) {
	    startAutoplay();
	}
    });

    $("#stopbutton").click(function() {
	stopAutoplay();
    });

    $("#fasterbutton").click(function() {
	let cur_period = interpreter.getAutoplayPeriod();	    
	interpreter.setAutoplayPeriod(Math.max(1, cur_period - 50));
	updateStepInterval();
    });

    $("#slowerbutton").click(function() {
	let cur_period = interpreter.getAutoplayPeriod();
	if (cur_period === 1) {
	    interpreter.setAutoplayPeriod(50);
	}
	else {
	    interpreter.setAutoplayPeriod(cur_period + 50);
	}
	updateStepInterval();
    });

    $("#backbutton").click(function() {
	interpreter.stepBack();
	$("#status").text("Paused");
	setPlayDisabled(false);
    });

    updateStepInterval();
    
    let ctx = document.getElementById('canvas').getContext('2d');
    // ctx.scale(2, 2); // not working .. ?
    Puddi.run(ctx);
    startEdit();

    // configure ace editor
    // editor.setTheme("ace/theme/twilight");
    let editor = ace.edit("editor");
    editor.setTheme("ace/theme/iplastic");
    editor.session.setMode("ace/mode/javascript");
    editor.session.setUseWorker(false); // disable errors/warnings
    // editor.setAutoScrollEditorIntoView(true);
    editor.commands.removeCommand(editor.commands.byName.showSettingsMenu)
    editor.setOption("fontSize", 14);
    editor.setOption("tabSize", 2);
    editor.setOption("showPrintMargin", false)
    // add commands for changing font size
    editor.commands.addCommand({
	name: 'fontSizeDecrease',
	bindKey: {win: 'Ctrl-,',  mac: 'Command-,'},
	exec: decreaseFontSize
    });
    editor.commands.addCommand({
	name: 'fontSizeIncrease',
	bindKey: {win: 'Ctrl-.',  mac: 'Command-.'},
	exec: increaseFontSize
    });

    $("#editorplusbutton").click(function() {
	increaseFontSize(editor);
    });

    $("#editorminusbutton").click(function() {
	decreaseFontSize(editor);
    });
}

function programEndCallback() {
    stopAutoplay();
    $("#status").text("Finished");
    setPlayDisabled(true);
}

function statusCallback(status) {
    setBackDisabled(!status.pc);
}

var interpreter = new Interp(programEndCallback, statusCallback,
			     // (status) => setBackDisabled(!status.pc),
			     document.getElementById('canvas'));

init();

// small default screen size
let screen_width = 640;
let screen_height = 480;

function rescale() {
    screen_width = window.innerWidth
	|| document.documentElement.clientWidth
	|| document.body.clientWidth;
    screen_height = window.innerHeight
	|| document.documentElement.clientHeight
	|| document.body.clientHeight;
    console.log("width: " + screen_width + ", height: " + screen_height);
    
    let w = screen_width - 75; // 25 margin on both sides
    let h = screen_height - 135; // vertical space available
    // give editor 80 columns or half the width if not enough space
    let editor_width = Math.min(545, w / 2);
    $("#editor").css("width", editor_width);
    $("#feedback").css("width", editor_width - 4); // minus left margin
    
    // give canvas the remaining width
    let canvas = document.getElementById('canvas');
    canvas.width = w - editor_width;
    $("#status").css("width", w - editor_width);

    // give canvas the max height possible and
    // editor 105 less than that
    canvas.height = h;
    $("#editor").css("height", h - 105);

    // refresh editor
    let editor = ace.edit("editor");
    editor.resize();

    // refresh canvas scale
    let ctx = document.getElementById('canvas').getContext('2d');
    ctx.scale(Puddi.getScale(), Puddi.getScale());
}

$(document).ready(function() {
    rescale();
});

window.addEventListener('resize', function(event){
    rescale();
});

$("#canvasplusbutton").click(function() {
    Puddi.scale(1.1);
    rescale();
    // let ctx = document.getElementById('canvas').getContext('2d');
    // ctx.scale(Puddi.getScale(), Puddi.getScale());
});

$("#canvasminusbutton").click(function() {
    Puddi.scale(0.9);
    rescale();
    // let ctx = document.getElementById('canvas').getContext('2d');
    // ctx.scale(Puddi.getScale(), Puddi.getScale());
});

document.addEventListener('keydown', function(event) {
    if (!hotkeysEnabled) { return; }

    switch (event.keyCode) {
    case 37: // left
	break;
    case 38: // up
	break;
    case 39: // right
	break;
    case 40: // down
	break;
    case 66: // b
	document.getElementById("backbutton").click();w
	break;
    case 67: // c
	if (compiling) {
	    document.getElementById("cancelbutton").click();
	}
	break;
    case 69: // e
	document.getElementById("editbutton").click();
	break;
    case 70: // f
	document.getElementById("fasterbutton").click();
	break;
    // case 71: // g
    //  document.getElementById("gobutton").click();
    // 	break;
    case 80: // p
	document.getElementById("playbutton").click();
	break;
    case 82: // r
	document.getElementById("resetbutton").click();
	break;
    case 83: // s
	if (autoplaying) {
	    document.getElementById("stopbutton").click();
	}
	else {
	    document.getElementById("stepbutton").click();
	}
	break;
    case 87: // w
	document.getElementById("slowerbutton").click();
	break;
    default:
    }
    if(event.keyCode == 37) {
        console.log('Left was pressed');
    }
    else if(event.keyCode == 39) {
        console.log('Right was pressed');
    }
});

},{"./animinterp.js":1,"./arrayobjects.js":2,"./puddi/puddi.js":6,"./puddi/puddidrawable.js":7,"sexp":4,"victor":5}],4:[function(require,module,exports){
var SPACE   = /[ \r\n\t]/,
    ATOM    = /[^\(\)'"\r\n\t ]/,
    NUMBER  = /^-?\d+(?:\.\d+)?$/;

function sexp(source, opts) {

    opts = opts || {};

    var tSymbol = opts.translateSymbol || function(sym) { return sym; },
        tString = opts.translateString || function(str) { return str; },
        tNumber = opts.translateNumber || parseFloat;

    var ix  = 0,
        len = source.length;

    function parseAtom() {
        var start = ix++;
        while (ATOM.test(source[ix]))
            ix++;
        var atom = source.substring(start, ix);
        if (NUMBER.test(atom)) {
            return tNumber(atom);
        } else {
            return tSymbol(atom);
        }
    }

    function parseString(quote) {
        var start = ix++;
        while (ix < len && source[ix] !== quote)
            ix++;
        if (ix === len)
            throw new Error("parse error - unterminated string");
        ix++;
        return tString(source.substring(start + 1, ix - 1));
    }

    function parseSexp() {

        while (SPACE.test(source[ix]))
            ix++;

        if (source[ix++] !== '(')
            throw new Error("parse error");

        var items   = [],
            state   = 'out',
            start   = null;

        while (ix < source.length) {
            var ch = source[ix];
            if (ch === ')') {
                ix++;
                return items;
            } else if (ch === '(') {
                items.push(parseSexp());
            } else if (ch === '"' || ch === '\'') {
                items.push(parseString(ch));
            } else if (SPACE.test(ch)) {
                ix++;
            } else {
                items.push(parseAtom());
            }
        }

        throw new Error("parse error");

    }

    return parseSexp();

}

module.exports = sexp;
},{}],5:[function(require,module,exports){
exports = module.exports = Victor;

/**
 * # Victor - A JavaScript 2D vector class with methods for common vector operations
 */

/**
 * Constructor. Will also work without the `new` keyword
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = Victor(42, 1337);
 *
 * @param {Number} x Value of the x axis
 * @param {Number} y Value of the y axis
 * @return {Victor}
 * @api public
 */
function Victor (x, y) {
	if (!(this instanceof Victor)) {
		return new Victor(x, y);
	}

	/**
	 * The X axis
	 *
	 * ### Examples:
	 *     var vec = new Victor.fromArray(42, 21);
	 *
	 *     vec.x;
	 *     // => 42
	 *
	 * @api public
	 */
	this.x = x || 0;

	/**
	 * The Y axis
	 *
	 * ### Examples:
	 *     var vec = new Victor.fromArray(42, 21);
	 *
	 *     vec.y;
	 *     // => 21
	 *
	 * @api public
	 */
	this.y = y || 0;
};

/**
 * # Static
 */

/**
 * Creates a new instance from an array
 *
 * ### Examples:
 *     var vec = Victor.fromArray([42, 21]);
 *
 *     vec.toString();
 *     // => x:42, y:21
 *
 * @name Victor.fromArray
 * @param {Array} array Array with the x and y values at index 0 and 1 respectively
 * @return {Victor} The new instance
 * @api public
 */
Victor.fromArray = function (arr) {
	return new Victor(arr[0] || 0, arr[1] || 0);
};

/**
 * Creates a new instance from an object
 *
 * ### Examples:
 *     var vec = Victor.fromObject({ x: 42, y: 21 });
 *
 *     vec.toString();
 *     // => x:42, y:21
 *
 * @name Victor.fromObject
 * @param {Object} obj Object with the values for x and y
 * @return {Victor} The new instance
 * @api public
 */
Victor.fromObject = function (obj) {
	return new Victor(obj.x || 0, obj.y || 0);
};

/**
 * # Manipulation
 *
 * These functions are chainable.
 */

/**
 * Adds another vector's X axis to this one
 *
 * ### Examples:
 *     var vec1 = new Victor(10, 10);
 *     var vec2 = new Victor(20, 30);
 *
 *     vec1.addX(vec2);
 *     vec1.toString();
 *     // => x:30, y:10
 *
 * @param {Victor} vector The other vector you want to add to this one
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.addX = function (vec) {
	this.x += vec.x;
	return this;
};

/**
 * Adds another vector's Y axis to this one
 *
 * ### Examples:
 *     var vec1 = new Victor(10, 10);
 *     var vec2 = new Victor(20, 30);
 *
 *     vec1.addY(vec2);
 *     vec1.toString();
 *     // => x:10, y:40
 *
 * @param {Victor} vector The other vector you want to add to this one
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.addY = function (vec) {
	this.y += vec.y;
	return this;
};

/**
 * Adds another vector to this one
 *
 * ### Examples:
 *     var vec1 = new Victor(10, 10);
 *     var vec2 = new Victor(20, 30);
 *
 *     vec1.add(vec2);
 *     vec1.toString();
 *     // => x:30, y:40
 *
 * @param {Victor} vector The other vector you want to add to this one
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.add = function (vec) {
	this.x += vec.x;
	this.y += vec.y;
	return this;
};

/**
 * Adds the given scalar to both vector axis
 *
 * ### Examples:
 *     var vec = new Victor(1, 2);
 *
 *     vec.addScalar(2);
 *     vec.toString();
 *     // => x: 3, y: 4
 *
 * @param {Number} scalar The scalar to add
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.addScalar = function (scalar) {
	this.x += scalar;
	this.y += scalar;
	return this;
};

/**
 * Adds the given scalar to the X axis
 *
 * ### Examples:
 *     var vec = new Victor(1, 2);
 *
 *     vec.addScalarX(2);
 *     vec.toString();
 *     // => x: 3, y: 2
 *
 * @param {Number} scalar The scalar to add
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.addScalarX = function (scalar) {
	this.x += scalar;
	return this;
};

/**
 * Adds the given scalar to the Y axis
 *
 * ### Examples:
 *     var vec = new Victor(1, 2);
 *
 *     vec.addScalarY(2);
 *     vec.toString();
 *     // => x: 1, y: 4
 *
 * @param {Number} scalar The scalar to add
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.addScalarY = function (scalar) {
	this.y += scalar;
	return this;
};

/**
 * Subtracts the X axis of another vector from this one
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(20, 30);
 *
 *     vec1.subtractX(vec2);
 *     vec1.toString();
 *     // => x:80, y:50
 *
 * @param {Victor} vector The other vector you want subtract from this one
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.subtractX = function (vec) {
	this.x -= vec.x;
	return this;
};

/**
 * Subtracts the Y axis of another vector from this one
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(20, 30);
 *
 *     vec1.subtractY(vec2);
 *     vec1.toString();
 *     // => x:100, y:20
 *
 * @param {Victor} vector The other vector you want subtract from this one
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.subtractY = function (vec) {
	this.y -= vec.y;
	return this;
};

/**
 * Subtracts another vector from this one
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(20, 30);
 *
 *     vec1.subtract(vec2);
 *     vec1.toString();
 *     // => x:80, y:20
 *
 * @param {Victor} vector The other vector you want subtract from this one
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.subtract = function (vec) {
	this.x -= vec.x;
	this.y -= vec.y;
	return this;
};

/**
 * Subtracts the given scalar from both axis
 *
 * ### Examples:
 *     var vec = new Victor(100, 200);
 *
 *     vec.subtractScalar(20);
 *     vec.toString();
 *     // => x: 80, y: 180
 *
 * @param {Number} scalar The scalar to subtract
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.subtractScalar = function (scalar) {
	this.x -= scalar;
	this.y -= scalar;
	return this;
};

/**
 * Subtracts the given scalar from the X axis
 *
 * ### Examples:
 *     var vec = new Victor(100, 200);
 *
 *     vec.subtractScalarX(20);
 *     vec.toString();
 *     // => x: 80, y: 200
 *
 * @param {Number} scalar The scalar to subtract
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.subtractScalarX = function (scalar) {
	this.x -= scalar;
	return this;
};

/**
 * Subtracts the given scalar from the Y axis
 *
 * ### Examples:
 *     var vec = new Victor(100, 200);
 *
 *     vec.subtractScalarY(20);
 *     vec.toString();
 *     // => x: 100, y: 180
 *
 * @param {Number} scalar The scalar to subtract
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.subtractScalarY = function (scalar) {
	this.y -= scalar;
	return this;
};

/**
 * Divides the X axis by the x component of given vector
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *     var vec2 = new Victor(2, 0);
 *
 *     vec.divideX(vec2);
 *     vec.toString();
 *     // => x:50, y:50
 *
 * @param {Victor} vector The other vector you want divide by
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.divideX = function (vector) {
	this.x /= vector.x;
	return this;
};

/**
 * Divides the Y axis by the y component of given vector
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *     var vec2 = new Victor(0, 2);
 *
 *     vec.divideY(vec2);
 *     vec.toString();
 *     // => x:100, y:25
 *
 * @param {Victor} vector The other vector you want divide by
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.divideY = function (vector) {
	this.y /= vector.y;
	return this;
};

/**
 * Divides both vector axis by a axis values of given vector
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *     var vec2 = new Victor(2, 2);
 *
 *     vec.divide(vec2);
 *     vec.toString();
 *     // => x:50, y:25
 *
 * @param {Victor} vector The vector to divide by
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.divide = function (vector) {
	this.x /= vector.x;
	this.y /= vector.y;
	return this;
};

/**
 * Divides both vector axis by the given scalar value
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.divideScalar(2);
 *     vec.toString();
 *     // => x:50, y:25
 *
 * @param {Number} The scalar to divide by
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.divideScalar = function (scalar) {
	if (scalar !== 0) {
		this.x /= scalar;
		this.y /= scalar;
	} else {
		this.x = 0;
		this.y = 0;
	}

	return this;
};

/**
 * Divides the X axis by the given scalar value
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.divideScalarX(2);
 *     vec.toString();
 *     // => x:50, y:50
 *
 * @param {Number} The scalar to divide by
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.divideScalarX = function (scalar) {
	if (scalar !== 0) {
		this.x /= scalar;
	} else {
		this.x = 0;
	}
	return this;
};

/**
 * Divides the Y axis by the given scalar value
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.divideScalarY(2);
 *     vec.toString();
 *     // => x:100, y:25
 *
 * @param {Number} The scalar to divide by
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.divideScalarY = function (scalar) {
	if (scalar !== 0) {
		this.y /= scalar;
	} else {
		this.y = 0;
	}
	return this;
};

/**
 * Inverts the X axis
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.invertX();
 *     vec.toString();
 *     // => x:-100, y:50
 *
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.invertX = function () {
	this.x *= -1;
	return this;
};

/**
 * Inverts the Y axis
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.invertY();
 *     vec.toString();
 *     // => x:100, y:-50
 *
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.invertY = function () {
	this.y *= -1;
	return this;
};

/**
 * Inverts both axis
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.invert();
 *     vec.toString();
 *     // => x:-100, y:-50
 *
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.invert = function () {
	this.invertX();
	this.invertY();
	return this;
};

/**
 * Multiplies the X axis by X component of given vector
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *     var vec2 = new Victor(2, 0);
 *
 *     vec.multiplyX(vec2);
 *     vec.toString();
 *     // => x:200, y:50
 *
 * @param {Victor} vector The vector to multiply the axis with
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.multiplyX = function (vector) {
	this.x *= vector.x;
	return this;
};

/**
 * Multiplies the Y axis by Y component of given vector
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *     var vec2 = new Victor(0, 2);
 *
 *     vec.multiplyX(vec2);
 *     vec.toString();
 *     // => x:100, y:100
 *
 * @param {Victor} vector The vector to multiply the axis with
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.multiplyY = function (vector) {
	this.y *= vector.y;
	return this;
};

/**
 * Multiplies both vector axis by values from a given vector
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *     var vec2 = new Victor(2, 2);
 *
 *     vec.multiply(vec2);
 *     vec.toString();
 *     // => x:200, y:100
 *
 * @param {Victor} vector The vector to multiply by
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.multiply = function (vector) {
	this.x *= vector.x;
	this.y *= vector.y;
	return this;
};

/**
 * Multiplies both vector axis by the given scalar value
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.multiplyScalar(2);
 *     vec.toString();
 *     // => x:200, y:100
 *
 * @param {Number} The scalar to multiply by
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.multiplyScalar = function (scalar) {
	this.x *= scalar;
	this.y *= scalar;
	return this;
};

/**
 * Multiplies the X axis by the given scalar
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.multiplyScalarX(2);
 *     vec.toString();
 *     // => x:200, y:50
 *
 * @param {Number} The scalar to multiply the axis with
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.multiplyScalarX = function (scalar) {
	this.x *= scalar;
	return this;
};

/**
 * Multiplies the Y axis by the given scalar
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.multiplyScalarY(2);
 *     vec.toString();
 *     // => x:100, y:100
 *
 * @param {Number} The scalar to multiply the axis with
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.multiplyScalarY = function (scalar) {
	this.y *= scalar;
	return this;
};

/**
 * Normalize
 *
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.normalize = function () {
	var length = this.length();

	if (length === 0) {
		this.x = 1;
		this.y = 0;
	} else {
		this.divide(Victor(length, length));
	}
	return this;
};

Victor.prototype.norm = Victor.prototype.normalize;

/**
 * If the absolute vector axis is greater than `max`, multiplies the axis by `factor`
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.limit(80, 0.9);
 *     vec.toString();
 *     // => x:90, y:50
 *
 * @param {Number} max The maximum value for both x and y axis
 * @param {Number} factor Factor by which the axis are to be multiplied with
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.limit = function (max, factor) {
	if (Math.abs(this.x) > max){ this.x *= factor; }
	if (Math.abs(this.y) > max){ this.y *= factor; }
	return this;
};

/**
 * Randomizes both vector axis with a value between 2 vectors
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.randomize(new Victor(50, 60), new Victor(70, 80`));
 *     vec.toString();
 *     // => x:67, y:73
 *
 * @param {Victor} topLeft first vector
 * @param {Victor} bottomRight second vector
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.randomize = function (topLeft, bottomRight) {
	this.randomizeX(topLeft, bottomRight);
	this.randomizeY(topLeft, bottomRight);

	return this;
};

/**
 * Randomizes the y axis with a value between 2 vectors
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.randomizeX(new Victor(50, 60), new Victor(70, 80`));
 *     vec.toString();
 *     // => x:55, y:50
 *
 * @param {Victor} topLeft first vector
 * @param {Victor} bottomRight second vector
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.randomizeX = function (topLeft, bottomRight) {
	var min = Math.min(topLeft.x, bottomRight.x);
	var max = Math.max(topLeft.x, bottomRight.x);
	this.x = random(min, max);
	return this;
};

/**
 * Randomizes the y axis with a value between 2 vectors
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.randomizeY(new Victor(50, 60), new Victor(70, 80`));
 *     vec.toString();
 *     // => x:100, y:66
 *
 * @param {Victor} topLeft first vector
 * @param {Victor} bottomRight second vector
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.randomizeY = function (topLeft, bottomRight) {
	var min = Math.min(topLeft.y, bottomRight.y);
	var max = Math.max(topLeft.y, bottomRight.y);
	this.y = random(min, max);
	return this;
};

/**
 * Randomly randomizes either axis between 2 vectors
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.randomizeAny(new Victor(50, 60), new Victor(70, 80));
 *     vec.toString();
 *     // => x:100, y:77
 *
 * @param {Victor} topLeft first vector
 * @param {Victor} bottomRight second vector
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.randomizeAny = function (topLeft, bottomRight) {
	if (!! Math.round(Math.random())) {
		this.randomizeX(topLeft, bottomRight);
	} else {
		this.randomizeY(topLeft, bottomRight);
	}
	return this;
};

/**
 * Rounds both axis to an integer value
 *
 * ### Examples:
 *     var vec = new Victor(100.2, 50.9);
 *
 *     vec.unfloat();
 *     vec.toString();
 *     // => x:100, y:51
 *
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.unfloat = function () {
	this.x = Math.round(this.x);
	this.y = Math.round(this.y);
	return this;
};

/**
 * Rounds both axis to a certain precision
 *
 * ### Examples:
 *     var vec = new Victor(100.2, 50.9);
 *
 *     vec.unfloat();
 *     vec.toString();
 *     // => x:100, y:51
 *
 * @param {Number} Precision (default: 8)
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.toFixed = function (precision) {
	if (typeof precision === 'undefined') { precision = 8; }
	this.x = this.x.toFixed(precision);
	this.y = this.y.toFixed(precision);
	return this;
};

/**
 * Performs a linear blend / interpolation of the X axis towards another vector
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 100);
 *     var vec2 = new Victor(200, 200);
 *
 *     vec1.mixX(vec2, 0.5);
 *     vec.toString();
 *     // => x:150, y:100
 *
 * @param {Victor} vector The other vector
 * @param {Number} amount The blend amount (optional, default: 0.5)
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.mixX = function (vec, amount) {
	if (typeof amount === 'undefined') {
		amount = 0.5;
	}

	this.x = (1 - amount) * this.x + amount * vec.x;
	return this;
};

/**
 * Performs a linear blend / interpolation of the Y axis towards another vector
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 100);
 *     var vec2 = new Victor(200, 200);
 *
 *     vec1.mixY(vec2, 0.5);
 *     vec.toString();
 *     // => x:100, y:150
 *
 * @param {Victor} vector The other vector
 * @param {Number} amount The blend amount (optional, default: 0.5)
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.mixY = function (vec, amount) {
	if (typeof amount === 'undefined') {
		amount = 0.5;
	}

	this.y = (1 - amount) * this.y + amount * vec.y;
	return this;
};

/**
 * Performs a linear blend / interpolation towards another vector
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 100);
 *     var vec2 = new Victor(200, 200);
 *
 *     vec1.mix(vec2, 0.5);
 *     vec.toString();
 *     // => x:150, y:150
 *
 * @param {Victor} vector The other vector
 * @param {Number} amount The blend amount (optional, default: 0.5)
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.mix = function (vec, amount) {
	this.mixX(vec, amount);
	this.mixY(vec, amount);
	return this;
};

/**
 * # Products
 */

/**
 * Creates a clone of this vector
 *
 * ### Examples:
 *     var vec1 = new Victor(10, 10);
 *     var vec2 = vec1.clone();
 *
 *     vec2.toString();
 *     // => x:10, y:10
 *
 * @return {Victor} A clone of the vector
 * @api public
 */
Victor.prototype.clone = function () {
	return new Victor(this.x, this.y);
};

/**
 * Copies another vector's X component in to its own
 *
 * ### Examples:
 *     var vec1 = new Victor(10, 10);
 *     var vec2 = new Victor(20, 20);
 *     var vec2 = vec1.copyX(vec1);
 *
 *     vec2.toString();
 *     // => x:20, y:10
 *
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.copyX = function (vec) {
	this.x = vec.x;
	return this;
};

/**
 * Copies another vector's Y component in to its own
 *
 * ### Examples:
 *     var vec1 = new Victor(10, 10);
 *     var vec2 = new Victor(20, 20);
 *     var vec2 = vec1.copyY(vec1);
 *
 *     vec2.toString();
 *     // => x:10, y:20
 *
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.copyY = function (vec) {
	this.y = vec.y;
	return this;
};

/**
 * Copies another vector's X and Y components in to its own
 *
 * ### Examples:
 *     var vec1 = new Victor(10, 10);
 *     var vec2 = new Victor(20, 20);
 *     var vec2 = vec1.copy(vec1);
 *
 *     vec2.toString();
 *     // => x:20, y:20
 *
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.copy = function (vec) {
	this.copyX(vec);
	this.copyY(vec);
	return this;
};

/**
 * Sets the vector to zero (0,0)
 *
 * ### Examples:
 *     var vec1 = new Victor(10, 10);
 *		 var1.zero();
 *     vec1.toString();
 *     // => x:0, y:0
 *
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.zero = function () {
	this.x = this.y = 0;
	return this;
};

/**
 * Calculates the dot product of this vector and another
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(200, 60);
 *
 *     vec1.dot(vec2);
 *     // => 23000
 *
 * @param {Victor} vector The second vector
 * @return {Number} Dot product
 * @api public
 */
Victor.prototype.dot = function (vec2) {
	return this.x * vec2.x + this.y * vec2.y;
};

Victor.prototype.cross = function (vec2) {
	return (this.x * vec2.y ) - (this.y * vec2.x );
};

/**
 * Projects a vector onto another vector, setting itself to the result.
 *
 * ### Examples:
 *     var vec = new Victor(100, 0);
 *     var vec2 = new Victor(100, 100);
 *
 *     vec.projectOnto(vec2);
 *     vec.toString();
 *     // => x:50, y:50
 *
 * @param {Victor} vector The other vector you want to project this vector onto
 * @return {Victor} `this` for chaining capabilities
 * @api public
 */
Victor.prototype.projectOnto = function (vec2) {
    var coeff = ( (this.x * vec2.x)+(this.y * vec2.y) ) / ((vec2.x*vec2.x)+(vec2.y*vec2.y));
    this.x = coeff * vec2.x;
    this.y = coeff * vec2.y;
    return this;
};


Victor.prototype.horizontalAngle = function () {
	return Math.atan2(this.y, this.x);
};

Victor.prototype.horizontalAngleDeg = function () {
	return radian2degrees(this.horizontalAngle());
};

Victor.prototype.verticalAngle = function () {
	return Math.atan2(this.x, this.y);
};

Victor.prototype.verticalAngleDeg = function () {
	return radian2degrees(this.verticalAngle());
};

Victor.prototype.angle = Victor.prototype.horizontalAngle;
Victor.prototype.angleDeg = Victor.prototype.horizontalAngleDeg;
Victor.prototype.direction = Victor.prototype.horizontalAngle;

Victor.prototype.rotate = function (angle) {
	var nx = (this.x * Math.cos(angle)) - (this.y * Math.sin(angle));
	var ny = (this.x * Math.sin(angle)) + (this.y * Math.cos(angle));

	this.x = nx;
	this.y = ny;

	return this;
};

Victor.prototype.rotateDeg = function (angle) {
	angle = degrees2radian(angle);
	return this.rotate(angle);
};

Victor.prototype.rotateTo = function(rotation) {
	return this.rotate(rotation-this.angle());
};

Victor.prototype.rotateToDeg = function(rotation) {
	rotation = degrees2radian(rotation);
	return this.rotateTo(rotation);
};

Victor.prototype.rotateBy = function (rotation) {
	var angle = this.angle() + rotation;

	return this.rotate(angle);
};

Victor.prototype.rotateByDeg = function (rotation) {
	rotation = degrees2radian(rotation);
	return this.rotateBy(rotation);
};

/**
 * Calculates the distance of the X axis between this vector and another
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(200, 60);
 *
 *     vec1.distanceX(vec2);
 *     // => -100
 *
 * @param {Victor} vector The second vector
 * @return {Number} Distance
 * @api public
 */
Victor.prototype.distanceX = function (vec) {
	return this.x - vec.x;
};

/**
 * Same as `distanceX()` but always returns an absolute number
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(200, 60);
 *
 *     vec1.absDistanceX(vec2);
 *     // => 100
 *
 * @param {Victor} vector The second vector
 * @return {Number} Absolute distance
 * @api public
 */
Victor.prototype.absDistanceX = function (vec) {
	return Math.abs(this.distanceX(vec));
};

/**
 * Calculates the distance of the Y axis between this vector and another
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(200, 60);
 *
 *     vec1.distanceY(vec2);
 *     // => -10
 *
 * @param {Victor} vector The second vector
 * @return {Number} Distance
 * @api public
 */
Victor.prototype.distanceY = function (vec) {
	return this.y - vec.y;
};

/**
 * Same as `distanceY()` but always returns an absolute number
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(200, 60);
 *
 *     vec1.distanceY(vec2);
 *     // => 10
 *
 * @param {Victor} vector The second vector
 * @return {Number} Absolute distance
 * @api public
 */
Victor.prototype.absDistanceY = function (vec) {
	return Math.abs(this.distanceY(vec));
};

/**
 * Calculates the euclidean distance between this vector and another
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(200, 60);
 *
 *     vec1.distance(vec2);
 *     // => 100.4987562112089
 *
 * @param {Victor} vector The second vector
 * @return {Number} Distance
 * @api public
 */
Victor.prototype.distance = function (vec) {
	return Math.sqrt(this.distanceSq(vec));
};

/**
 * Calculates the squared euclidean distance between this vector and another
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(200, 60);
 *
 *     vec1.distanceSq(vec2);
 *     // => 10100
 *
 * @param {Victor} vector The second vector
 * @return {Number} Distance
 * @api public
 */
Victor.prototype.distanceSq = function (vec) {
	var dx = this.distanceX(vec),
		dy = this.distanceY(vec);

	return dx * dx + dy * dy;
};

/**
 * Calculates the length or magnitude of the vector
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.length();
 *     // => 111.80339887498948
 *
 * @return {Number} Length / Magnitude
 * @api public
 */
Victor.prototype.length = function () {
	return Math.sqrt(this.lengthSq());
};

/**
 * Squared length / magnitude
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *
 *     vec.lengthSq();
 *     // => 12500
 *
 * @return {Number} Length / Magnitude
 * @api public
 */
Victor.prototype.lengthSq = function () {
	return this.x * this.x + this.y * this.y;
};

Victor.prototype.magnitude = Victor.prototype.length;

/**
 * Returns a true if vector is (0, 0)
 *
 * ### Examples:
 *     var vec = new Victor(100, 50);
 *     vec.zero();
 *
 *     // => true
 *
 * @return {Boolean}
 * @api public
 */
Victor.prototype.isZero = function() {
	return this.x === 0 && this.y === 0;
};

/**
 * Returns a true if this vector is the same as another
 *
 * ### Examples:
 *     var vec1 = new Victor(100, 50);
 *     var vec2 = new Victor(100, 50);
 *     vec1.isEqualTo(vec2);
 *
 *     // => true
 *
 * @return {Boolean}
 * @api public
 */
Victor.prototype.isEqualTo = function(vec2) {
	return this.x === vec2.x && this.y === vec2.y;
};

/**
 * # Utility Methods
 */

/**
 * Returns an string representation of the vector
 *
 * ### Examples:
 *     var vec = new Victor(10, 20);
 *
 *     vec.toString();
 *     // => x:10, y:20
 *
 * @return {String}
 * @api public
 */
Victor.prototype.toString = function () {
	return 'x:' + this.x + ', y:' + this.y;
};

/**
 * Returns an array representation of the vector
 *
 * ### Examples:
 *     var vec = new Victor(10, 20);
 *
 *     vec.toArray();
 *     // => [10, 20]
 *
 * @return {Array}
 * @api public
 */
Victor.prototype.toArray = function () {
	return [ this.x, this.y ];
};

/**
 * Returns an object representation of the vector
 *
 * ### Examples:
 *     var vec = new Victor(10, 20);
 *
 *     vec.toObject();
 *     // => { x: 10, y: 20 }
 *
 * @return {Object}
 * @api public
 */
Victor.prototype.toObject = function () {
	return { x: this.x, y: this.y };
};


var degrees = 180 / Math.PI;

function random (min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function radian2degrees (rad) {
	return rad * degrees;
}

function degrees2radian (deg) {
	return deg / degrees;
}

},{}],6:[function(require,module,exports){
var state = {
    _objects: [],
    _scale: 1.0
};
var engine = {};

function update(tFrame) {
    // compute the time elapsed since the last update
    let time_elapsed = tFrame - state._time;

    // update the timestamp
    state._time = tFrame;

    // update all objects
    for (let o of state._objects) {
	o.update(time_elapsed);
    }
}

function draw() {
    // clear canvas
    state._ctx.clearRect(0, 0, state._ctx.canvas.width * (1 / state._scale),
			 state._ctx.canvas.height * (1 / state._scale));

    // draw all objects
    for (let o of state._objects) {
	if (o.draw) {
	    o.draw(state._ctx);
	}
    }
}

// deregister from the browser update loop
function stop() {
    window.cancelAnimationFrame(engine._stopCycle);
}

// The function to be called by the browser at every frame
function cycle(tFrame) {
    // re-register for the next frame
    engine._stopCycle = window.requestAnimationFrame(cycle);

    // update
    if (update(tFrame) < 0) {
	stop();
	return;
    }

    // draw
    draw();
}

// EXPORTS

exports._engine = engine;

exports.run = function(ctx) {
    state._ctx = ctx;
    // initialize state._time to the current time
    state._time = performance.now();
    // register the cycle function with the browser update loop
    engine._stopCycle = window.requestAnimationFrame(cycle);
};

exports.stop = stop;

exports.addObject = function(o) {
    state._objects.push(o);
};

exports.removeObject = function(o) {
    for (let i = 0; i < state._objects.length; i++) {
	// use the object's provided equals method
	if (o.equals(state._objects[i])) {
	    state._objects.splice(i, 1);
	}
    }
};

exports.getCtx = function() { return state._ctx; };

exports.scale = function(s) {
    state._scale *= s;
    state._ctx.scale(state._scale, state._scale);
};

exports.getScale = function() { return state._scale; };

},{}],7:[function(require,module,exports){
var PuddiObject = require('./puddiobject.js');

function PuddiDrawable(parent) {
    // call superclass constructor
    PuddiObject.call(this, parent);
    
    this._color = "black";
}

// set up inheritance
PuddiDrawable.prototype = Object.create(PuddiObject.prototype);
PuddiDrawable.prototype.constructor = PuddiDrawable;

PuddiDrawable.prototype.getColor = function() { return this._color; };

PuddiDrawable.prototype.setColor = function(c) { this._color = c; };

// subclasses should override this function for their drawing code
PuddiDrawable.prototype._drawSelf = function(ctx) {}

PuddiDrawable.prototype.draw = function(ctx) {
    ctx.save();
    this.transform(ctx);

    ctx.fillStyle = this._color;
    ctx.strokeStyle = this._color;

    // draw myself
    this._drawSelf(ctx);
    
    // draw children
    for (let o of this._children) {
	if (o.draw) {
	    o.draw(ctx);
	}
    }
    
    ctx.restore();
};

// EXPORT
module.exports = PuddiDrawable;

},{"./puddiobject.js":8}],8:[function(require,module,exports){
var Puddi = require('./puddi.js');
var Vector = require('victor');

var idCounter = 0;

var PuddiObject = function (parent) {
    this._id = idCounter++;
    this._position = new Vector(0, 0);
    this._rotation = 0.0;
    this._scale = 1.0
    this._targetPosition = new Vector(0, 0);
    this._velocity = 0.0;
    this._children = []
    
    if (parent) {
	parent.addChild(this);
    }
    else {
	Puddi.addObject(this);
    }
};

PuddiObject.prototype.equals = function(o) {
    if (!o._id) { return false; }
    return this._id == o._id;
};

PuddiObject.prototype.getId = function() { return this._id; };
PuddiObject.prototype.getPosition = function() { return this._position; };
PuddiObject.prototype.getRotation = function() { return this._rotation; };
PuddiObject.prototype.getScale = function() { return this._scale; };
PuddiObject.prototype.getTargetPosition = function() {
    return this._targetPosition;
};
PuddiObject.prototype.getVelocity = function() { return this._velocity; };

PuddiObject.prototype.setPosition = function(p) { this._position = p; };
PuddiObject.prototype.setRotation = function(r) { this._rotation = r; };
PuddiObject.prototype.setScale = function(s) { this._scale = s; };
PuddiObject.prototype.setTargetPosition = function(tp) {
    this._targetPosition = tp;
};
PuddiObject.prototype.setVelocity = function(v) { this._velocity = v; };

PuddiObject.prototype.translate = function(v) {
    this.setPosition(this._position.add(v));
};
PuddiObject.prototype.rotate = function(r) { this._rotation += r; };
PuddiObject.prototype.scale = function(s) { this._scale *= s; };

PuddiObject.prototype.addChild = function(o) { this._children.push(o); };
PuddiObject.prototype.removeChild = function(o) {
    for (let i = 0; i < this._children.length; i++) {
	if (o.equals(this._children[i])) {
	    this._children.splice(i, 1);
	}
    }
};
PuddiObject.prototype.removeChildAt = function(i) {
    this._children.splice(i, 1);
}
PuddiObject.prototype.clearChildren = function() {
    this._children = [];
}

PuddiObject.prototype.transform = function(ctx) {
    ctx.transform(this._scale, 0, 0, this._scale,
		  this._position.x, this._position.y);
    ctx.rotate(this._rotation);
};

// subclasses should override this for their update code
PuddiObject.prototype._updateSelf = function(time_elapsed) {}

PuddiObject.prototype.update = function(time_elapsed) {
    if (this._position.x != this._targetPosition.x ||
	this._position.y != this._targetPosition.y) {
	let v = this._velocity * time_elapsed;
	let displacement =
	    this._targetPosition.clone().subtract(this._position);
	if (displacement.length() <= v) {
	    this.setPosition(this._targetPosition.clone());
	}
	else {
	    this.translate(displacement.normalize().multiply(new Vector(v, v)));
	}
    }
    
    this._updateSelf(time_elapsed);

    for (let o of this._children) {
	o.update(time_elapsed);
    }
}

PuddiObject.prototype.delete = function() {
    for (let o of this._children) {
	o.delete();
    }
    Puddi.removeObject(this);
}

// EXPORT
module.exports = PuddiObject;

},{"./puddi.js":6,"victor":5}]},{},[3]);
