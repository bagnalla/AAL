var state = { objects: [] };
var engine = {};

function update(tFrame) {
    let time_elapsed = tFrame - state.time;
    state.time = tFrame;
    for (let o of state.objects) {
	o.update(time_elapsed);
    }
}

function draw() {
    // clear canvas
    state.ctx.clearRect(0, 0, state.ctx.canvas.width, state.ctx.canvas.height);

    for (let o of state.objects) {
	if (o.draw) {
	    o.draw(state.ctx);
	}
    }
}

function stop() {
    window.cancelAnimationFrame(engine.stopMain);
}

function cycle(tFrame) {
    engine.stopMain = window.requestAnimationFrame(cycle);
    if (update(tFrame) < 0) {
	stop();
	return;
    }
    draw();
}

// EXPORTS

exports.engine = engine;

exports.run = function(ctx){
    state.ctx = ctx;
    state.time = performance.now();
    window.requestAnimationFrame(cycle);
}

exports.stop = stop;

exports.addObject = function(o) {
    state.objects.push(o);
}

exports.removeObject = function(o) {
    for (let i = 0; i < state.objects.length; i++) {
	if (o.equals(state.objects[i])) {
	    state.objects.splice(i, 1);
	}
    }
}
