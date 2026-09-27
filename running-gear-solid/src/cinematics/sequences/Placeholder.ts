import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';

/** Temporary stand-in used while a sequence is under construction. */
export class Placeholder extends Sequence {
  build() {
    this.shot(0, this.duration, cam(0, 2, 10, 0, 1, 0));
  }
  update(_t: number, fx: FX) {
    fx.sceneMix = 0;
  }
  drawUI(ui: UI, t: number) {
    ui.text(this.slot.id.toUpperCase(), 480, 250, { scale: 4, align: 'center' });
    ui.text(t.toFixed(2), 480, 300, { scale: 2, align: 'center' });
  }
}
