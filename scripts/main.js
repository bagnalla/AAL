var $ = require('jquery-browserify')
var sexp = require('sexp');

var Puddi = require('./puddi/puddi.js');
var PuddiDrawable = require('./puddi/puddidrawable.js');
var Vector = require('victor');

var Objects = require('./arrayobjects.js');
var Cell = Objects.Cell;
var Variable = Objects.Variable;
var AArray = Objects.Array;

var ary = sexp("(foo bar 'string with spaces' 1 (2 3 4))");

var Interp = require('./animinterp.js');

function arr_to_string(arr) {
    let str = "";
    str += '[';
    for (let i = 0; i < arr.length; i++) {
	if (Array.isArray(arr[i])) {
	    str += arr_to_string(arr[i]);
	}
	else {
	    str += arr[i].toString();
	}
	if (i < arr.length - 1) {
	    str += ", ";
	}
    }
    return str + ']';
}

function startEdit() {
    $("#canvas").css("display", "none");
    $("#editbutton").css("display", "none");
    $("#playbutton").css("display", "none");
    $("#stopbutton").css("display", "none");
    $("#stepbutton").css("display", "none");
    $("#backbutton").css("display", "none");
    $("#fasterbutton").css("display", "none");
    $("#slowerbutton").css("display", "none");
    $("#resetbutton").css("display", "none");
    $("#cancelbutton").css("display", "none");

    $("#gobutton").css("display", "inline");

    interpreter.reset();
    let editor = ace.edit("editor");
    editor.setReadOnly(false);

    $("#feedback").text("Press 'Go' to compile.");
}

function startCompile() {
    $("#gobutton").css("display", "none");
    $("#cancelbutton").css("display", "inline");
    $("#feedback").html("Compiling...<br>Note: if your program doesn't terminate this will run for 30 seconds before timing out and may use a lot of memory.<br>Press 'Cancel' to cancel compilation early and return to editing.");

    let editor = ace.edit("editor");
    editor.setReadOnly(true);
}

function startAnimation(aprog) {
    let coms = aprog[2];
    interpreter.setProg(coms);
    $("#cancelbutton").css("display", "none");

    $("#canvas").css("display", "block");
    $("#editbutton").css("display", "inline");
    $("#playbutton").css("display", "inline");
    $("#stepbutton").css("display", "inline");
    $("#backbutton").css("display", "inline");
    $("#resetbutton").css("display", "inline");

    $("#feedback").html("Ready.<br>Press 'Play' to start the animation or 'Step' to go one step at a time.<br>Press 'Edit' to end the animation and return to editing the program.");
}

function startAutoplay() {
    interpreter.setAutoplay(true);

    $("#stopbutton").css("display", "inline");
    $("#fasterbutton").css("display", "inline");
    $("#slowerbutton").css("display", "inline");

    $("#stepbutton").css("display", "none");
    $("#backbutton").css("display", "none");
}

function stopAutoplay() {
    interpreter.setAutoplay(false);

    $("#stopbutton").css("display", "none");
    $("#fasterbutton").css("display", "none");
    $("#slowerbutton").css("display", "none");

    $("#stepbutton").css("display", "inline");
    $("#backbutton").css("display", "inline");
}


function errorMsg(msg) {
    $("#feedback").html(msg);
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

var timeoutId = null;
function startTimeout() {
    timeoutId = setTimeout(function() {
	cancelWorker();
	startEdit();
	$("#feedback").text("Compilation timed out after 30 seconds.");
    }, 30000);
}

function cancelTimeout() {
    if (timeoutId !== null) {
	clearTimeout(timeoutId);
	timeoutId = null;
    }
}

function compile () {
    let editor = ace.edit("editor");
    var txt = editor.getValue();
    startTimeout();
    ASYNCH ("compile", [txt], function (resp) {
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

function init() {
    $("#gobutton").click(function() {
	startCompile();
	compile();
    });

    $("#cancelbutton").click(function() {
	cancelTimeout();
	cancelWorker();
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
    });

    $("#playbutton").click(function() {
	startAutoplay();
    });

    $("#stopbutton").click(function() {
	stopAutoplay();
    });

    $("#fasterbutton").click(function() {
	let cur_period = interpreter.getAutoplayPeriod();
	interpreter.setAutoplayPeriod(Math.max(1, cur_period - 50));
    });

    $("#slowerbutton").click(function() {
	let cur_period = interpreter.getAutoplayPeriod();
	interpreter.setAutoplayPeriod(cur_period + 50);
    });

    $("#backbutton").click(function() {
	interpreter.stepBack();
    });
    
    let ctx = document.getElementById('canvas').getContext('2d');
    Puddi.run(ctx);
    startEdit();

    // configure ace editor
    // editor.setTheme("ace/theme/twilight");
    let editor = ace.edit("editor");
    editor.setTheme("ace/theme/iplastic");
    editor.session.setMode("ace/mode/javascript");
    editor.session.setUseWorker(false); // disable errors/warnings
}

var interpreter = new Interp();

init();
