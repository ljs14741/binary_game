import Phaser from 'phaser';
import { bakeAll } from '../art/textures.js';
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() { bakeAll(this); this.scene.start('Title'); }
}
