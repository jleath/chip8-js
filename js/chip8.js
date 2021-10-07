let emulator = new Chip8Emulator();
let canvas;
let context;
let frameTime = 1000 / 60;
let intervalHandle;
let instructionTemplate;

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && intervalHandle !== undefined) {
    context.fillStyle = 'black';
    context.fillRect(0, 0, emulator.displayWidth, emulator.displayHeight);
    emulator.halt('user halted execution');
    return;
  }
  if (e.key === 'Tab') {
    if (intervalHandle) {
      clearInterval(intervalHandle);
    }
    emulator.debugging = true;
    return;
  }

  if (e.key === 'n') {
    if (emulator.debugging) {
      executeFrame();
    }
    return;
  }
  let code = emulator.getKeyCode(e.key);
  if (code === undefined) {
    return;
  }
  if (emulator.waiting) {
    emulator.waiting(emulator.getKeyCode(currKey));
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
  let instructionTemplateHTML = document.querySelector('#instruction-template').innerHTML;
  instructionTemplate = Handlebars.compile(instructionTemplateHTML);

  document.getElementById('file-input').onchange = e => {
    clearInterval(intervalHandle);
    let file = e.target.files[0];
    let reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = e => {
      let view = new Uint8Array(reader.result);
      emulator.loadProgram(view);
      render();
    };
  };

  document.getElementById('start-button').addEventListener('click', e => {
    if (emulator.debugging) {
      executeFrame();
    } else {
      intervalHandle = setInterval(executeFrame, frameTime);
    }
  });

  initCanvas();
});

function initCanvas() {
  context.scale(canvas.width / emulator.displayWidth, canvas.height / emulator.displayHeight);
  context.fillStyle = 'black';
  context.fillRect(0, 0, 64, 32);
}

function render() {
  let index = 0;
  for (let y = 0; y < emulator.displayHeight; y += 1) {
    for (let x = 0; x < emulator.displayWidth; x += 1, index += 1) {
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
let instructionsSinceLastTick = 0;

function executeFrame() {
  if (emulator.halted) {
    console.log(emulator.haltedMsg);
    clearInterval(intervalHandle);
    return;
  }
  if (emulator.debugging) {
    if (emulator.waiting) {
      // wait for keypress before stepping forward
      // handle the keypress by calling the emulator's waiting method
    }
    let instructions = emulator.cycle();
    instructionsSinceLastTick += 1;
    if (instructionsSinceLastTick === emulator.cyclesPerFrame) {
      emulator.dt = Math.max(0, emulator.dt - 1);
      emulator.st = Math.max(0, emulator.st - 1);
    }
    let instructionList = document.querySelector('#instructions');
    while (instructionList.firstChild) {
      instructionList.removeChild(instructionList.firstChild);
    }
    instructionList.insertAdjacentHTML('beforeend', instructionTemplate({ instructions }))
    let currInstruction = document.querySelector(`#address-${toHex(emulator.PC, 4)}`);
    currInstruction.classList.add('curr-instruction');
    document.querySelector('#instruction-panel').scrollTop = currInstruction.offsetTop;
    render();
  } else {
    diff = (Date.now() - lastFrame);
    lastFrame += diff;
    for (let i = 0; origin < lastFrame - frameTime && i < 2; origin += frameTime, i += 1) {
      for (let j = 0; j < emulator.cyclesPerFrame; j += 1) {
        if (!emulator.waiting) {
          emulator.cycle();
        }
      }
      if (!emulator.waiting) {
        emulator.dt = Math.max(0, emulator.dt - 1);
        emulator.st = Math.max(0, emulator.st - 1);
      }
    }
    render();
  }
}