import type { TownResponse } from './town.types';

export const HOME_MILESTONES = [
  {
    id: 'habit-level-2', label: 'Building level 2', requirement: 'Reach level 2 with an active habit.',
    options: [
      { id: 'stepping-stone', label: 'Stepping stone', art: 'stone' },
      { id: 'small-planter', label: 'Small planter', art: 'planter' },
      { id: 'wooden-lantern', label: 'Wooden lantern', art: 'lantern' },
    ],
  },
  {
    id: 'town-level-3', label: 'Town level 3', requirement: 'Reach Town level 3.',
    options: [
      { id: 'wind-vane', label: 'Wind vane', art: 'vane' },
      { id: 'shell-marker', label: 'Shell marker', art: 'shell' },
      { id: 'path-lamp', label: 'Path lamp', art: 'lamp' },
    ],
  },
  {
    id: 'town-level-5', label: 'Town level 5', requirement: 'Reach Town level 5.',
    options: [
      { id: 'bench', label: 'Bench', art: 'bench' },
      { id: 'bird-bath', label: 'Bird bath', art: 'bath' },
      { id: 'civic-pennant', label: 'Civic pennant', art: 'pennant' },
    ],
  },
] as const;

export type HomeMilestone = (typeof HOME_MILESTONES)[number];
export type HomeMilestoneOption = HomeMilestone['options'][number];

export function homeMilestoneOption(id: string, milestoneId: string): HomeMilestoneOption | undefined {
  for (const milestone of HOME_MILESTONES) {
    const option = milestone.id === milestoneId && milestone.options.find(item => item.id === id);
    if (option) return option;
  }
  return undefined;
}

export function homeMilestoneEligible(milestone: HomeMilestone['id'], town: TownResponse | null): boolean {
  if (!town) return false;
  switch (milestone) {
    case 'habit-level-2':
      return town.habits.some(habit => habit.level >= 2 &&
        town.lots.some(lot => lot.state === 'occupied' && lot.habit_id === habit.id));
    case 'town-level-3': return town.town.level >= 3;
    case 'town-level-5': return town.town.level >= 5;
  }
}
