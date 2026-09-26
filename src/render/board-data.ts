import type { BoardLayout } from '@/board';
import type { SimResult } from '@/sim';

/**
 * Everything a view of the machine needs: the layout to draw, the run to
 * animate, and the words for the header. The flat board view and the 3D model
 * take exactly this, which is why they always agree.
 */
export interface BoardData {
  /** 0 assembles the parts onto the board; 1 pulls them fully apart. */
  readonly explode: number;
  readonly layout: BoardLayout;
  readonly result: SimResult;
  readonly subtitle: string;
  readonly title: string;
  /** How much simulated time the traced spans cover, for the playback clock. */
  readonly windowNs: number;
}
