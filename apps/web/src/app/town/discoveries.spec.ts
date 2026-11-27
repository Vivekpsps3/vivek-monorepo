import { DISCOVERY_MARKS } from './discoveries';
import { exteriorFootprints } from './town-exterior';

const IDS = [
  'tidepool-shells',
  'ferry-bell',
  'library-globe',
  'theater-light-booth',
  'music-mural',
  'gym-chalkboard',
  'clinic-garden',
  'hall-sundial',
  'courtyard-birdbath',
  'lantern-alley',
  'rooftop-telescope',
  'arcade-sign',
];

function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

describe('Town discovery marks', () => {
  it('names the twelve hotspots and leaves every building footprint clear', () => {
    expect(DISCOVERY_MARKS.map(item => item.id)).toEqual(IDS);
    const buildings = exteriorFootprints();
    expect(buildings).toHaveSize(16);
    for (const mark of DISCOVERY_MARKS) {
      expect(mark.x).toBeGreaterThanOrEqual(0);
      expect(mark.y).toBeGreaterThanOrEqual(0);
      expect(mark.x + mark.width).toBeLessThanOrEqual(1000);
      expect(mark.y + mark.height).toBeLessThanOrEqual(640);
      for (const building of buildings) {
        expect(overlaps(mark, building)).withContext(`${mark.id} ${building.id}`).toBeFalse();
      }
    }
    for (let i = 0; i < DISCOVERY_MARKS.length; i += 1) {
      for (let j = i + 1; j < DISCOVERY_MARKS.length; j += 1) {
        expect(overlaps(DISCOVERY_MARKS[i], DISCOVERY_MARKS[j]))
          .withContext(`${DISCOVERY_MARKS[i].id} ${DISCOVERY_MARKS[j].id}`)
          .toBeFalse();
      }
    }
  });
});
