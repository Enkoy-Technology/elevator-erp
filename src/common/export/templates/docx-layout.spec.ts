import { Table, TableCell, TableRow, Paragraph } from 'docx';

import { collapseMargins, gap, heading, paletteOf, prose } from './docx-layout';

const palette = paletteOf(null);
const table = () =>
  new Table({
    rows: [
      new TableRow({
        children: [new TableCell({ children: [new Paragraph('x')] })],
      }),
    ],
  });

// Word adds the space below one block to the space above the next; the
// PDF's CSS keeps only the larger. These are the cases the documents meet.
describe('collapseMargins', () => {
  it('keeps the larger of two gaps in a row', () => {
    const small = gap(150);
    const large = gap(300);
    expect(collapseMargins([small, large])).toEqual([large]);
    expect(collapseMargins([large, small])).toEqual([large]);
  });

  it("lets a heading's own space above stand in for the gap before it", () => {
    const h = heading('Offer', palette);
    expect(collapseMargins([gap(240), h])).toEqual([h]);
  });

  it('shortens a gap after a heading by the heading’s space below', () => {
    const h = heading('Special notes', palette);
    const g = gap(270);
    const out = collapseMargins([h, g]);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(h);
    expect(out[1]).not.toBe(g);
  });

  it("drops a clause's space below before a heading", () => {
    const p = prose('1.5 "Work" means the supply of the equipment.');
    const h = heading('Article 2: Object of the Contract', palette);
    const out = collapseMargins([p, h]);
    expect(out[0]).not.toBe(p);
    expect(out[1]).toBe(h);
  });

  it('opens a clause straight after a table 12px down', () => {
    const t = table();
    const p = prose(
      '5.1 The advance payment is released only against a guarantee.',
    );
    const out = collapseMargins([t, p]);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(t);
    expect(out[2]).toBe(p);
  });

  it('leaves clauses that follow one another alone', () => {
    const a = prose('1.1 One.');
    const b = prose('1.2 Two.');
    expect(collapseMargins([a, b])).toEqual([a, b]);
  });
});
