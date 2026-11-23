import { homeLayoutWrite } from './home-layout';
import { homeObjects } from './home-rooms';

describe('home layout write', () => {
  it('sends catalog ids, cells, and a palette without a private note', () => {
    const body = homeLayoutWrite('study', 4, 2);
    expect(body.expected_revision).toBe(4);
    expect(body.items.map(item => item.catalog_id)).toEqual(homeObjects('study').map(object => object.catalogId));
    expect(body.items.map(item => item.instance_id)).toEqual(['study-desk', 'study-lamp', 'study-shelf']);
    expect(body.items[0]).toEqual({
      instance_id: 'study-desk', catalog_id: 'desk', anchor: 'floor',
      column: 2, row: 5, slot: null, orientation: 0, palette: 2,
    });
    expect(body.items[1].column).toBe(3);
    const text = JSON.stringify(body);
    expect(text).not.toContain('note');
    expect(text).not.toContain('Harbor');
    expect(text).not.toContain('label');
    expect(text).not.toContain('href');
    const frame = homeLayoutWrite('living', 0, 0).items.find(item => item.instance_id === 'living-frame');
    expect(frame).toEqual({
      instance_id: 'living-frame', catalog_id: 'plain-frame', anchor: 'wall',
      column: null, row: null, slot: 'living-north', orientation: 0, palette: 0,
    });
  });
});
