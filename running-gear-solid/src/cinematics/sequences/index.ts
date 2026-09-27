import type { SeqId, SeqSlot } from '../schedule';
import type { FilmHost, Sequence } from '../Sequence';
import { ColdOpen } from './ColdOpen';
import { Title } from './Title';
import { Placeholder } from './Placeholder';
import { Training } from './Training';
import { HingeBrief, RichmondBrief, Shingles } from './Codecs';
import { HingeSeq } from './Hinge';
import { ClawSeq } from './Claw';
import { DoubleZero } from './DoubleZero';
import { Phantom1, Phantom2 } from './Phantoms';
import { FurnaceSeq } from './Furnace';

type Ctor = new (host: FilmHost, slot: SeqSlot) => Sequence;

export const SEQUENCES: Record<SeqId, Ctor> = {
  coldOpen: ColdOpen,
  title: Title,
  training: Training,
  hingeBrief: HingeBrief,
  hinge: HingeSeq,
  doubleZero: DoubleZero,
  phantom1: Phantom1,
  richmondBrief: RichmondBrief,
  furnace: FurnaceSeq,
  claw: ClawSeq,
  shingles: Shingles,
  phantom2: Phantom2,
  setback: Placeholder,
  comeback: Placeholder,
  wallBuild: Placeholder,
  wall: Placeholder,
  aftermath: Placeholder,
  records: Placeholder,
  next: Placeholder,
};
