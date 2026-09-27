import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { drawCodec, type CodecSpec } from '../../hud/screens';
import { blink, clamp } from '../../core/util';

/** Full-screen radio call between STRIDE and the support team. */
abstract class CodecSeq extends Sequence {
  abstract spec: CodecSpec;
  header?: string;

  build() {
    this.shot(0, this.duration, cam(0, 0, 10, 0, 0, 0));
  }
  update(t: number, fx: FX) {
    fx.sceneMix = 0;
    const s = this.spec;
    // incoming-call static burst, then clean
    fx.static = t < s.open ? 0.35 + 0.3 * Math.sin(t * 40) : t < s.open + 0.25 ? 0.4 * (1 - (t - s.open) / 0.25) : t > s.close ? clamp((t - s.close) / 0.3) * 0.5 : 0;
    fx.scan = 0.12;
  }
  drawUI(ui: UI, t: number) {
    const s = this.spec;
    if (t < s.open) {
      if (blink(t, 0.22)) ui.text('!', 480, 200, { scale: 10, color: COL.red, align: 'center' });
      ui.text('CALL', 480, 290, { scale: 3, color: COL.green, align: 'center' });
      if (this.header) ui.text(this.header, 480, 330, { scale: 2, color: COL.grey, align: 'center' });
      return;
    }
    drawCodec(ui, s, t);
    if (this.header && t > s.open + 0.4) ui.text(this.header, 480, 516, { scale: 1, color: COL.greenDim, align: 'center' });
  }
}

export class HingeBrief extends CodecSeq {
  header = 'HACKNEY // 21.05.2022';
  spec: CodecSpec = {
    caller: 'lactate',
    open: 0.8,
    close: 6.7,
    lines: [
      { who: 'lactate', text: "STRIDE, YOUR LAST LOG ENTRY READS 'TESTING THE KNEE'.", at: 1.1 },
      { who: 'stride', text: 'HACKNEY HALF IS TOMORROW.', at: 3.2 },
      { who: 'lactate', text: 'THEN TOMORROW THE KNEE TESTS YOU.', at: 4.7 },
    ],
  };
}

export class RichmondBrief extends CodecSeq {
  header = '16.07.2023 // 8 WEEKS OUT';
  spec: CodecSpec = {
    caller: 'tempo',
    open: 0.6,
    close: 5.8,
    lines: [
      { who: 'tempo', text: 'EIGHT WEEKS TO RICHMOND. YOUR FIRST MARATHON.', at: 0.9 },
      { who: 'stride', text: '26 KILOMETRES TODAY. 32 BY AUGUST.', at: 2.7 },
      { who: 'tempo', text: 'THE MARATHON STARTS AFTER THAT.', at: 4.2 },
    ],
  };
}

export class Shingles extends CodecSeq {
  header = 'OAK HILL PARKRUN // 30.03.2024';
  spec: CodecSpec = {
    caller: 'lactate',
    open: 0.6,
    close: 6.8,
    lines: [
      { who: 'lactate', text: 'STRIDE. YOUR EYE IS SWOLLEN.', at: 0.9 },
      { who: 'stride', text: 'I RAN A PARKRUN ON IT.', at: 2.4 },
      { who: 'lactate', text: "UPDATE: TURNS OUT YOU'VE GOT SHINGLES.", at: 3.8 },
      { who: 'stride', text: '...', at: 5.9 },
    ],
  };
}
