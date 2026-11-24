import { homePlacementProblem, withHomeItem, type HomeLayoutItem } from './home-layout';
import { HOME_ROOM_IDS, homeObjects, homeSceneItem, starterHomeLayout } from './home-rooms';

describe('Home room placement', () => {
  it('uses only public fields for every starter and keeps the authored rooms placeable', () => {
    for (const room of HOME_ROOM_IDS) {
      const items = starterHomeLayout(room);
      expect(items.map(item => item.catalog_id)).withContext(room).toEqual(homeObjects(room).map(object => object.catalogId));
      expect(homePlacementProblem(room, items)).withContext(room).toBeNull();
      expect(Object.keys(items[0])).toEqual([
        'instance_id', 'catalog_id', 'anchor', 'column', 'row', 'slot', 'orientation', 'palette',
      ]);
    }
    expect(starterHomeLayout('study').map(item => item.instance_id)).toEqual(['study-desk', 'study-lamp', 'study-shelf']);
    expect(starterHomeLayout('living').find(item => item.instance_id === 'living-frame')).toEqual({
      instance_id: 'living-frame', catalog_id: 'plain-frame', anchor: 'wall',
      column: null, row: null, slot: 'living-north', orientation: 0, palette: 0,
    });
  });

  const table: HomeLayoutItem = {
    instance_id: 'table', catalog_id: 'low-table', anchor: 'floor',
    column: 11, row: 0, slot: null, orientation: 0, palette: 2,
  };

  it('uses the turned footprint for both placement and drawing', () => {
    const starting = starterHomeLayout('study');
    expect(homePlacementProblem('study', [...starting, table])).toBe('The item extends past the floor.');
    const turned = { ...table, orientation: 1 as const };
    expect(homePlacementProblem('study', [...starting, turned])).toBeNull();
    const scene = homeSceneItem('study', turned);
    expect(scene?.asset.bounds).toEqual({ width: 24, height: 48 });
    expect(scene?.palette).toBe(2);
  });

  it('carries the desk lamp when the desk moves and turns', () => {
    const study = starterHomeLayout('study');
    const placed = withHomeItem(study, { ...study[0], column: 4, row: 2, orientation: 1 });
    expect(homePlacementProblem('study', placed)).toBeNull();
    expect(placed[1]).toEqual({ ...study[1], column: 4, row: 3 });
    expect(study[1].column).toBe(3);
  });

  it('reserves door cells, stack surfaces, and single-occupancy wall slots', () => {
    const study = starterHomeLayout('study');
    expect(homePlacementProblem('study', [...study, { ...table, column: 5, row: 10 }])).toBe('Keep the doorway clear.');
    expect(homePlacementProblem('study', [...study, { ...table, column: 2, row: 5 }])).toBe('That space is occupied.');
    expect(homePlacementProblem('study', withHomeItem(study, { ...study[1], column: 0, row: 0 })))
      .toBe('A stackable item needs one clear surface.');
    const living = starterHomeLayout('living');
    const frame = living.find(item => item.anchor === 'wall')!;
    expect(homePlacementProblem('living', [...living, { ...frame, instance_id: 'second-frame' }])).toBe('That wall slot is occupied.');
    expect(homePlacementProblem('living', [...living, { ...frame, instance_id: 'second-frame', slot: 'living-west' }])).toBeNull();
  });
});
