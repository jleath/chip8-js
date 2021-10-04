"use strict";

let Chip8Emulator = (function() {
  const MEMORY_SIZE = 0x1000;
  const FONT_START_ADDRESS = 0x50;
  const PROGRAM_START_ADDRESS = 0x200;
  const NUM_REGISTERS = 16;

  const FONT_DATA = [
    0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
    0x20, 0x60, 0x20, 0x20, 0x70, // 1
    0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
    0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
    0x90, 0x90, 0xF0, 0x10, 0x10, // 4
    0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
    0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
    0xF0, 0x10, 0x20, 0x40, 0x40, // 7
    0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
    0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
    0xF0, 0x90, 0xF0, 0x90, 0x90, // A
    0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
    0xF0, 0x80, 0x80, 0x80, 0xF0, // C
    0xE0, 0x90, 0x90, 0x90, 0xE0, // D
    0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
    0xF0, 0x80, 0xF0, 0x80, 0x80, // F
    0xF0, 0x90, 0xF0, 0x80, 0x80, // P
    0x90, 0xD0, 0xB0, 0x90, 0x90, // N
    0x88, 0xD8, 0xA8, 0x88, 0x88, // M
    0xF0, 0x90, 0xF0, 0xA0, 0x90, // R
  ];

  const KEY_CODES = {
    '1': 0, '2': 1, '3': 2, '4': 3, 'q': 4, 'w': 5, 'e': 6, 'r': 7,
    'a': 8, 's': 9, 'd': 10, 'f': 11, 'z': 12, 'x': 13, 'c': 14, 'v': 15,
  };

  function Chip8Emulator() {
    this.cyclesPerFrame = 20;
    this.reset();
  }

  Chip8Emulator.prototype.reset = function() {
    this.memory = new Uint8Array(MEMORY_SIZE);
    this.memory.set(FONT_DATA, FONT_START_ADDRESS);
    this.pixels = new Uint8Array(64 * 32);
    this.backBuffer = new Uint8Array(64 * 32);
    this.pixels.fill(0);
    this.backBuffer.fill(0);
    this.stack = [];
    this.registers = new Uint8Array(NUM_REGISTERS);
    this.I = 0;
    this.PC = PROGRAM_START_ADDRESS;
    this.dt = 0;
    this.st = 0;
    this.halted = false;
    this.haltedMsg = '';
    this.currKey = undefined;
    this.waiting = false;
    this.waitingRegister = undefined;
    this.clearDisplay = false;
  };

  Chip8Emulator.prototype.getKeyCode = function(key) {
    return KEY_CODES[key];
  }

  Chip8Emulator.prototype.halt = function(msg) {
    this.halted = true;
    this.haltedMsg = msg;
  };

  Chip8Emulator.prototype.loadProgram = function(programData) {
    this.reset();
    this.pixels.fill(0);
    this.memory.set(programData, PROGRAM_START_ADDRESS);
  };

  Chip8Emulator.prototype.cycle = function() {
    if (this.PC >= MEMORY_SIZE - 2) {
      this.halt(`Invalid Program Counter: ${this.PC}`);
      return;
    }
    let instruction = (this.memory[this.PC] << 8) | this.memory[this.PC + 1];
    this.PC += 2;
    let address =  instruction & 0xFFF;
    let nibble = instruction & 0xF;
    let byte = instruction & 0xFF;
    let y = (instruction >> 4) & 0xF;
    let x = (instruction >> 8) & 0xF;
    let opcode = (instruction >> 12) & 0xF;

    if (instruction === 0x00E0) {
      this.pixels.fill(0);
      this.clearDisplay = true;
      return;
    }
    if (instruction === 0x00EE) {
      if (this.stack.length === 0) {
        this.halt('Attempt to pop from empty stack');
        return;
      }
      this.PC = this.stack.pop();
      return;
    }

    switch (opcode) {
      case 0x1:
        this.PC = address;
        break;
      case 0x2:
        this.stack.push(this.PC);
        this.PC = address;
        break;
      case 0x3:
        if (this.registers[x] === byte) this.PC += 2;
        break;
      case 0x4:
        if (this.registers[x] !== byte) this.PC += 2;
        break;
      case 0x5:
        if (this.registers[x] === this.registers[y]) this.PC += 2;
        break;
      case 0x6:
        this.registers[x] = byte;
        break;
      case 0x7:
        this.registers[x] = (this.registers[x] + byte) & 0xFF;
        break;
      case 0x8:
        switch (nibble) {
          case 0x0:
            this.registers[x] = this.registers[y];
            break;
          case 0x1:
            this.registers[x] |= this.registers[y];
            break;
          case 0x2:
            this.registers[x] &= this.registers[y];
            break;
          case 0x3:
            this.registers[x] ^= this.registers[y];
            break;
          case 0x4:
            let result = this.registers[x] + this.registers[y];
            if (result > 255) this.registers[0xF] = 1;
            this.registers[x] = result & 0xFF;
            break;
          case 0x5:
            if (this.registers[x] > this.registers[y]) {
              this.registers[0xF] = 1;
            } else {
              this.registers[0xF] = 0;
            }
            this.registers[x] = (this.registers[x] - this.registers[y]) & 0xFF;
            break;
          case 0x6:
            if ((0x1 & this.registers[x]) !== 0) {
              this.registers[0xF] = 1;
            } else {
              this.registers[0xF] = 0;
            }
            this.registers[x] = (this.registers[x] >>> 1) & 0xFF;
            break;
          case 0x7:
            if (this.registers[y] > this.registers[x]) {
              this.registers[0xF] = 1;
            } else {
              this.registers[0xF] = 0;
            }
            this.registers[x] = (this.registers[y] - this.registers[x]) & 0xFF;
            break;
          case 0xE:
            if ((0x80 & this.registers[x]) !== 0) {
              this.registers[0xF] = 1;
            } else {
              this.registers[0xF] = 0;
            }
            this.registers[x] = (this.registers[x] << 1) & 0xFF;
            break;
        }
        break;
      case 0x9:
        if (this.registers[x] !== this.registers[y]) this.PC += 2;
        break;
      case 0xA:
        this.I = address;
        break;
      case 0xB:
        this.PC = address + this.registers[0]; 
        break
      case 0xC:
        this.registers[x] = Math.floor(Math.random() * 255) & byte;
        break;
      case 0xD:
        let yPos = this.registers[y] & 31;
        this.registers[0xF] = 0;
        for (let row = 0; row < nibble && yPos < 32; row += 1, yPos += 1) {
          let mask = 0x80;
          let xPos = this.registers[x] & 63;
          while (mask > 0) {
            let masked = this.memory[this.I + row] & mask;
            if (masked !== 0) {
              let index = (yPos * 64) + xPos;
              if (this.pixels[index] === 1) {
                this.pixels[index] = 0
                this.registers[0xF] = 1;
              } else {
                this.pixels[index] = 1;
              }
            }
            mask = mask >>> 1;
            if (xPos === 63) break;
            xPos += 1;
          }
        }
        break;
      case 0xE:
        if (byte === 0x9E && this.currKey === this.registers[x]) {
          this.PC += 2;
        } else if (byte === 0xA1 && this.currKey !== this.registers[x]) {
          this.PC += 2;
        }
        break;
      case 0xF:
        switch (byte) {
          case 0x07:
            this.registers[x] = this.dt;
            break;
          case 0x0A:
            if (this.currKey !== undefined) {
              this.registers[x] = this.currKey;
              this.currKey = undefined;
            } else {
              this.waiting = true;
              this.waitingRegister = x;
            }
            break;
          case 0x15:
            this.dt = this.registers[x];
            break;
          case 0x18:
            this.st = this.registers[x];
            break;
          case 0x1E:
            this.I += this.registers[x];
            if (this.I > 0x1000) this.registers[0xF] = 1;
            break;
          case 0x29:
            this.I = 0x50 + (this.registers[x] * 5);
            break;
          case 0x33:
            if (this.I + 2 >= MEMORY_SIZE) {
              this.halt(`Invalid memory access: ${this.I + 2}`);
              return;
            }
            let value = this.registers[x];
            this.memory[this.I] = Math.floor(value / 100);
            this.memory[this.I + 1] = Math.floor(value / 10) % 10;
            this.memory[this.I + 2] = value % 10;
            break;
          case 0x55:
            if (this.I + x >= MEMORY_SIZE) {
              this.halt(`Invalid memory access: ${this.I + x}`);
              return;
            }
            for (let num = 0; num <= x; num += 1) {
              this.memory[this.I + num] = this.registers[num];
            }
            break;
          case 0x65:
            if (this.I + x >= MEMORY_SIZE) {
              this.halt(`Invalid memory access: ${this.I + x}`);
              return;
            }
            for (let num = 0; num <= x; num += 1) {
              this.registers[num] = this.memory[this.I + num];
            }
            break;
        }
        break;
      default:
        console.log(`unrecognized instruction: ${instruction}`)
        break;
    }
  }

  return Chip8Emulator;
})();
