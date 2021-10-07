"use strict";

function toHex(value, length = 1) {
  return value.toString(16).padStart(length, '0').toUpperCase();
}

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
    this.backBuffer = new Uint8Array(this.displayWidth * this.displayHeight);
    this.cyclesPerFrame = 20;
    this.displayWidth = 64;
    this.displayHeight = 32;
    this.debugging = false;
    this.reset();
  }

  Chip8Emulator.prototype.reset = function() {
    this.memory = new Uint8Array(MEMORY_SIZE);
    this.memory.set(FONT_DATA, FONT_START_ADDRESS);
    this.pixels = new Uint8Array(this.displayWidth * this.displayHeight);
    this.pixels.fill(0);
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
    this.memory.set(programData, PROGRAM_START_ADDRESS);
  };

  Chip8Emulator.prototype.fetchInstruction = function(memoryLocation) {
    return (this.memory[memoryLocation] << 8) | this.memory[memoryLocation + 1];
  }

  Chip8Emulator.prototype.cycle = function() {
    if (this.PC >= MEMORY_SIZE - 2) {
      this.halt(`Invalid Program Counter: ${this.PC}`);
      return;
    }
    let instructions = [];
    if (this.debugging) {
      let tempPC = PROGRAM_START_ADDRESS;
      while (tempPC < MEMORY_SIZE) {
        let instruction = this.fetchInstruction(tempPC);
        if (instruction !== 0) {
          instructions.push({ 
            address: toHex(tempPC, 4), 
            code: toHex(instruction, 4), 
            str: decode(instruction).str,
          });
        }
        tempPC += 2;
      }
    }
    let instruction = this.fetchInstruction(this.PC);
    this.PC += 2;
    decode(instruction).op.call(this);
    return instructions;
  }

  function decode(instruction) {
    let address =  instruction & 0xFFF;
    let nibble = instruction & 0xF;
    let byte = instruction & 0xFF;
    let y = (instruction >> 4) & 0xF;
    let x = (instruction >> 8) & 0xF;
    let opcode = (instruction >> 12) & 0xF;

    const unknownInstruction = { str: '<unknown>', op() { }, };
  
    if (instruction === 0x00E0) {
      return {
        str: `CLS`,
        op() { this.pixels.fill(0); },
      };
    }
    if (instruction === 0x00EE) {
      return {
        str: 'RET',
        op() {
          if (this.stack.length === 0) {
            this.halt('Attempt to pop from empty stack');
            return;
          }
          this.PC = this.stack.pop();
        },
      };
    }
    switch (opcode) {
      case 0x1:
        return {
          str: `JP ${toHex(address, 3)}`,
          op() { this.PC = address; },
        };
      case 0x2:
        return {
          str: `CALL ${toHex(address, 3)}`,
          op() {
            this.stack.push(this.PC);
            this.PC = address;
          },
        };
      case 0x3:
        return {
          str: `SE_X_NN ${toHex(x)} ${toHex(byte, 2)}`,
          op() {
            if (this.registers[x] === byte) this.PC += 2;
          },
        };
      case 0x4:
        return {
          str: `SNE_X_NN ${toHex(x)} ${toHex(byte, 2)}`,
          op() { if (this.registers[x] !== byte) this.PC += 2; },
        };
      case 0x5:
        return {
          str: `SE_X_Y ${toHex(x)} ${toHex(y)}`,
          op() { if (this.registers[x] === this.registers[y]) this.PC += 2; },
        };
      case 0x6:
        return {
          str: `LD_X_NN ${toHex(x)} ${toHex(byte, 2)}`,
          op() { this.registers[x] = byte },
        };
      case 0x7:
        return {
          str: `ADD_X_NN ${toHex(x)} ${toHex(byte, 2)}`,
          op() { this.registers[x] = (this.registers[x] + byte) & 0xFF; },
        };
      case 0x8:
        switch (nibble) {
          case 0x0:
            return {
              str: `LD_X_Y ${toHex(x)} ${toHex(y)}`,
              op() { this.registers[x] = this.registers[y]; },
            };
          case 0x1:
            return {
              str: `OR_X_Y ${toHex(x)} ${toHex(y)}`,
              op() { this.registers[x] |= this.registers[y]; },
            };
          case 0x2:
            return {
              str: `AND_X_Y ${toHex(x)} ${toHex(y)}`,
              op() { this.registers[x] &= this.registers[y]; },
            };
          case 0x3:
            return {
              str: `XOR_X_Y ${toHex(x)} ${toHex(y)}`,
              op() { this.registers[x] ^= this.registers[y]; },
            };
          case 0x4:
            return {
              str: `ADD_X_Y ${toHex(x)} ${toHex(y)}`,
              op() {
                let result = this.registers[x] + this.registers[y];
                if (result > 255) this.registers[0xF] = 1;
                this.registers[x] = result & 0xFF;
              },
            };
          case 0x5:
            return {
              str: `SUB_X_Y ${toHex(x)} ${toHex(y)}`,
              op() {
                if (this.registers[x] > this.registers[y]) {
                  this.registers[0xF] = 1;
                } else {
                  this.registers[0xF] = 0;
                }
                this.registers[x] = (this.registers[x] - this.registers[y]) & 0xFF;
              },
            };
          case 0x6:
            return {
              str: `SHR_X ${toHex(x)}`,
              op() {
                if ((0x1 & this.registers[x]) !== 0) {
                  this.registers[0xF] = 1;
                } else {
                  this.registers[0xF] = 0;
                }
                this.registers[x] = (this.registers[x] >>> 1) & 0xFF;
              },
            };
          case 0x7:
            return {
              str: `SUBN_X_Y ${toHex(x)} ${toHex(y)}`,
              op() {
                if (this.registers[y] > this.registers[x]) {
                  this.registers[0xF] = 1;
                } else {
                  this.registers[0xF] = 0;
                }
                this.registers[x] = (this.registers[y] - this.registers[x]) & 0xFF;
              },
            };
          case 0xE:
            return {
              str: `SHL_X ${toHex(x)}`,
              op() {
                if ((0x80 & this.registers[x]) !== 0) {
                  this.registers[0xF] = 1;
                } else {
                  this.registers[0xF] = 0;
                }
                this.registers[x] = (this.registers[x] << 1) & 0xFF;
              },
            };
          default:
            return unknownInstruction;
        }
      case 0x9:
        return {
          str: `SNE_X_Y ${toHex(x)} ${toHex(y)}`,
          op() { if (this.registers[x] !== this.registers[y]) this.PC += 2; },
        };
      case 0xA:
        return {
          str: `LD_I_NNN ${toHex(address, 3)}`,
          op() { this.I = address },
        };
      case 0xB:
        return {
          str: `JP_NNN ${toHex(address, 3)}`,
          op() { this.PC = address + this.registers[0]; },
        };
      case 0xC:
        return {
          str: `RND_X_NN ${toHex(x)} ${toHex(byte)}`,
          op() { this.registers[x] = Math.floor(Math.random() * 255) & byte },
        };
      case 0xD:
        return {
          str: `DRW_X_Y_N ${toHex(x)} ${toHex(y)} ${toHex(nibble)}`,
          op() {
            let yPos = this.registers[y] & (this.displayHeight - 1);
            this.registers[0xF] = 0;
            for (let row = 0; row < nibble && yPos < this.displayHeight; row += 1, yPos += 1) {
              let mask = 0x80;
              let xPos = this.registers[x] & (this.displayWidth - 1);
              while (mask > 0) {
                let masked = this.memory[this.I + row] & mask;
                if (masked !== 0) {
                  let index = (yPos * this.displayWidth) + xPos;
                  if (this.pixels[index] === 1) {
                    this.pixels[index] = 0
                    this.registers[0xF] = 1;
                  } else {
                    this.pixels[index] = 1;
                  }
                }
                mask = mask >>> 1;
                if (xPos === (this.displayWidth - 1)) break;
                xPos += 1;
              }
            }
          }
        };
      case 0xE:
        return {
          str: `SKP_X ${toHex(x)}`,
          op() {
            if (byte === 0x9E && this.currKey === this.registers[x]) {
              this.PC += 2;
            } else if (byte === 0xA1 && this.currKey !== this.registers[x]) {
              this.PC += 2;
            }
          },
        };
      case 0xF:
        switch (byte) {
          case 0x07:
            return {
              str: `LD_X_DT ${toHex(x)}`,
              op() { this.registers[x] = this.dt },
            };
          case 0x0A:
            return {
              str: `LD_X_K ${toHex(x)}`,
              op() {
                if (this.currKey !== undefined) {
                  this.registers[x] = this.currKey;
                  this.currKey = undefined;
                } else {
                  this.waiting = (code => {
                    this.registers[x] = code;
                    this.waiting = undefined;
                  });
                }
              },
            };
          case 0x15:
            return {
              str: `LD_DT_X ${toHex(x)}`,
              op() { this.dt = this.registers[x]; },
            };
          case 0x18:
            return {
              str: `LD_ST_X ${toHex(x)}`,
              op() { this.st = this.registers[x]; },
            };
          case 0x1E:
            return {
              str: `ADD_I_X ${toHex(x)}`,
              op() {
                this.I += this.registers[x];
                if (this.I > MEMORY_SIZE) this.registers[0xF] = 1;
              },
            };
          case 0x29:
            return {
              str: `LD_F_X ${toHex(x)}`,
              op() { this.I = FONT_START_ADDRESS + (this.registers[x] * 5); },
            };
          case 0x33:
            return {
              str: `LD_B_X ${toHex(x)}`,
              op() {
                if (this.I + 2 >= MEMORY_SIZE) {
                  this.halt(`Invalid memory access: ${this.I + 2}`);
                  return;
                }
                let value = this.registers[x];
                this.memory[this.I] = Math.floor(value / 100);
                this.memory[this.I + 1] = Math.floor(value / 10) % 10;
                this.memory[this.I + 2] = value % 10;
              },
            };
          case 0x55:
            return {
              str: `LD_I_X ${toHex(x)}`,
              op() {
                if (this.I + x >= MEMORY_SIZE) {
                  this.halt(`Invalid memory access: ${this.I + x}`);
                  return;
                }
                for (let num = 0; num <= x; num += 1) {
                  this.memory[this.I + num] = this.registers[num];
                }
              },
            };
          case 0x65:
            return {
              str: `LD_X_I ${toHex(x)}`,
              op() {
                if (this.I + x >= MEMORY_SIZE) {
                  this.halt(`Invalid memory access: ${this.I + x}`);
                  return;
                }
                for (let num = 0; num <= x; num += 1) {
                  this.registers[num] = this.memory[this.I + num];
                }
              },
            };
          default: {
            return unknownInstruction;
          }
        }
        break;
      default:
        return unknownInstruction;
    }
  }

  return Chip8Emulator;
})();
