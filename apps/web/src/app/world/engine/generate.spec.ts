import {
generateChunk,
worldSeed,
type DayInput,
type WeekInput
} from './index';

describe('generateChunk', () => {

  it('does not mutate its input', () => {
    const days: DayInput[] = [];
    for (let i = 0; i < 7; i++) {
      days.push({
        biome: i === 0 ? 'forest' : 'meadow',
        trip: i < 2 ? 41 : null,
        items: i === 1 ? [{ k: 'artifact', kind: 'tome', id: 9 }, { k: 'concept', id: 7 }] : [],
        lit: i < 3,
      });
    }
    const input: WeekInput = {
      v: 1,
      week: '2026-10-26',
      days,
      habits: [
        { id: 15, style: 'garden', n: 2, first: 0 },
        { id: 12, style: 'forge', n: 5, first: 0 },
      ],
    };
    const before = structuredClone(input);
    const dayItems = input.days[1].items;
    generateChunk(worldSeed(1), input);
    expect(input).toEqual(before);
    expect(input.days).toBe(days);
    expect(input.days[1].items).toBe(dayItems);
    expect(input.habits[0].id).toBe(15);
  });
});
