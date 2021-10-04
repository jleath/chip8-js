let emulator = new Chip8Emulator();
let canvas;
let context;
let frameTime = 1000 / 60;
let intervalHandle;

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && intervalHandle !== undefined) {
    context.fillStyle = 'black';
    context.fillRect(0, 0, 64, 32);
    emulator.halt('user halted execution');
    return;
  }
  let code = emulator.getKeyCode(e.key);
  if (code === undefined) {
    return;
  }
  if (emulator.waiting) {
    emulator.registers[emulator.waitingRegister] = code;
    emulator.waiting = false;
  } else {
    emulator.currKey = code;
  }
});

document.addEventListener('keyup', e => {
  e.preventDefault();
  emulator.currKey = undefined;
});

document.addEventListener('DOMContentLoaded', () => {
  canvas = document.querySelector('canvas');
  context = canvas.getContext('2d');

  document.getElementById('file-input').onchange = e => {
    let file = e.target.files[0];
    let reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = e => {
      let view = new Uint8Array(reader.result);
      emulator.loadProgram(view);
    };
  };

  document.getElementById('start-button').addEventListener('click', e => {
    intervalHandle = setInterval(executeFrame, frameTime);
  });

  initCanvas();
});

function initCanvas() {
  context.scale(canvas.width / 64, canvas.height / 32);
  context.fillStyle = 'black';
  context.fillRect(0, 0, 64, 32);
}

function render() {
  let index = 0;
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 64; x += 1, index += 1) {
      if (emulator.pixels[index] === emulator.backBuffer[index]) continue;
      if (emulator.pixels[index] === 1) {
        context.fillStyle = 'green';
        emulator.backBuffer[index] = 1;
      } else {
        context.fillStyle = 'black';
        emulator.backBuffer[index] = 0;
      }
      context.fillRect(x, y, 1, 1);
    }
  }
}

let lastFrame = Date.now();
let diff;
let origin = lastFrame + frameTime / 2;

function executeFrame() {
  if (emulator.halted) {
    console.log(emulator.haltedMsg);
    clearInterval(intervalHandle);
    return;
  }
  diff = (Date.now() - lastFrame);
  lastFrame += diff;
  for (let i = 0; origin < lastFrame - frameTime && i < 2; origin += frameTime, i += 1) {
    for (let j = 0; j < emulator.cyclesPerFrame; j += 1) {
      if (!emulator.waiting) {
        emulator.cycle();
        if (emulator.clearDisplay) {
          render();
          emulator.clearDisplay = false;
        }
      }
    }
    if (!emulator.waiting) {
      emulator.dt = Math.max(0, emulator.dt - 1);
      emulator.st = Math.max(0, emulator.st - 1);
    }
  }
  render();
}