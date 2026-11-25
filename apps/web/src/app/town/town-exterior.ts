import type { TownHealthStages } from './health';
import {
  REST_CAMERA,
  SCENE_SCALES,
  clampCamera,
  roomRect,
  sceneFrame,
  type RoomRect,
  type SceneCamera,
  type ScenePlacement,
  type SceneSize,
} from './library-room.scene';
import { buildingSprite, type TownSpriteId } from './town-sprites';
import { formatTownDay } from './town-text';
import type { Building, Habit, TownResponse } from './town.types';
import { treasuryFace, type TreasuryView } from './weeks-kept';

/** Exterior space is the Reading Hall frame: y-down, origin at the top left. */
export const EXTERIOR_ROOM = { width: 1000, height: 640 } as const;

export const EXTERIOR_ART = {
  attribution: 'Original artwork for Terraria-on-Sea',
  license: 'No separate license published',
} as const;

export type DistrictId = 'civic' | 'residential' | 'harbor' | 'culture' | 'wellness' | 'garden';

export type ExteriorHealth = TownHealthStages | { state: 'loading' };

export interface DistrictSpec {
  readonly id: DistrictId;
  readonly label: string;
  readonly focus: RoomRect;
}

export const DISTRICTS: readonly DistrictSpec[] = Object.freeze([
  Object.freeze({ id: 'residential', label: 'Residential', focus: Object.freeze({ left: 38, top: 16, width: 206, height: 174 }) }),
  Object.freeze({ id: 'civic', label: 'Civic', focus: Object.freeze({ left: 266, top: 16, width: 380, height: 174 }) }),
  Object.freeze({ id: 'harbor', label: 'Harbor', focus: Object.freeze({ left: 734, top: 68, width: 240, height: 196 }) }),
  Object.freeze({ id: 'culture', label: 'Culture', focus: Object.freeze({ left: 113, top: 159, width: 484, height: 254 }) }),
  Object.freeze({ id: 'wellness', label: 'Wellness', focus: Object.freeze({ left: 669, top: 226, width: 316, height: 240 }) }),
  Object.freeze({ id: 'garden', label: 'Garden', focus: Object.freeze({ left: 23, top: 443, width: 938, height: 183 }) }),
]);

export interface LotFace {
  readonly name: string;
  readonly label: string;
  readonly sprite: TownSpriteId;
  readonly link: string;
  readonly external: boolean;
  readonly control: 'external' | 'link' | 'habit' | 'locked';
}

/** One face for a fixed lot or habit lot. Treasury uses Finance weeks, never a habit streak. */
export function lotFace(input: {
  kind: 'library' | 'inn' | 'treasury' | 'habit';
  building?: Building;
  lot?: { state: 'occupied' | 'empty' | 'locked'; unlock_level: number };
  habit?: Habit;
  vaultPresent?: boolean;
  treasury?: TreasuryView | null;
}): LotFace {
  const kind = input.kind;
  const habit = input.habit;
  const lot = input.lot;
  const building = input.building;
  if (kind === 'treasury') {
    const face = treasuryFace(!input.vaultPresent
      ? { status: 'locked' }
      : (input.treasury ?? { status: 'loading' }));
    const sprite: TownSpriteId = face.stage == null ? 'treasury-locked' : buildingSprite('treasury', face.stage);
    return {
      name: 'Treasury',
      label: face.label,
      sprite,
      link: face.href,
      external: face.external,
      control: face.external ? 'external' : 'link',
    };
  }
  if (kind === 'library' || kind === 'inn') {
    const source = kind === 'library' ? 'Media' : 'Travel';
    return {
      name: kind === 'library' ? 'Library' : 'Inn',
      label: building?.source === 'unavailable' ? `Lv — · ${source} unavailable` : `Lv ${building?.level} · ${source}`,
      sprite: buildingSprite(kind, building?.stage ?? 1),
      link: kind === 'library' ? '/town/library' : '/travel',
      external: false,
      control: 'link',
    };
  }
  if (lot?.state === 'occupied' && habit) {
    return {
      name: habit.name,
      label: `Lv ${habit.level} · ${habit.streak.current}-${habit.streak.unit === 'days' ? 'day' : 'week'} streak`,
      sprite: buildingSprite(habit.building_style, habit.stage),
      link: '',
      external: false,
      control: 'habit',
    };
  }
  const locked = lot?.state === 'locked';
  return {
    name: locked ? 'Locked lot' : 'Empty lot',
    label: locked ? `Unlocks at Lv ${lot?.unlock_level}` : 'Build here',
    sprite: locked ? 'lot-locked' : 'lot-empty',
    link: '',
    external: false,
    control: locked ? 'locked' : 'habit',
  };
}

export interface ExteriorBuilding {
  readonly id: string;
  readonly district: DistrictId;
  readonly name: string;
  readonly label: string;
  readonly landmark: LandmarkArt;
  readonly previousLandmark: LandmarkArt | null;
  readonly control: 'external' | 'link' | 'habit' | 'locked' | 'select';
  readonly path: string;
  readonly query: Readonly<Record<string, string>> | null;
  readonly href: string;
  readonly slot: number | null;
  readonly habitId: number | null;
  readonly layer: number;
  readonly rect: RoomRect;
  readonly frame: RoomRect;
  readonly captionAnchor: { readonly left: number; readonly top: number };
}

type ExteriorSprite = TownSpriteId | 'home' | 'hall' | 'theater' | 'music' | 'arcade';

export interface LandmarkArt {
  readonly href: string;
  readonly state: string;
}

function landmarkArt(sprite: ExteriorSprite): LandmarkArt {
  const [kind, state = '1'] = sprite.split('-');
  return { href: `/town/exterior/landmarks.svg#${kind}`, state };
}

interface Placement {
  readonly id: string;
  readonly district: DistrictId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly layer: number;
  readonly captionX?: number;
  readonly captionY?: number;
}

const PLACED: readonly Placement[] = Object.freeze([
  Object.freeze({ id: 'home', district: 'residential', x: 62, y: 36, width: 154, height: 128, layer: 2 }),
  Object.freeze({ id: 'treasury', district: 'civic', x: 281, y: 41, width: 154, height: 128, layer: 2 }),
  Object.freeze({ id: 'hall', district: 'civic', x: 477, y: 29, width: 158, height: 128, layer: 2 }),
  Object.freeze({ id: 'inn', district: 'harbor', x: 762, y: 92, width: 166, height: 128, layer: 3 }),
  Object.freeze({ id: 'library', district: 'culture', x: 127, y: 188, width: 152, height: 128, layer: 3 }),
  Object.freeze({ id: 'theater', district: 'culture', x: 295, y: 176, width: 160, height: 128, layer: 3, captionX: .72 }),
  Object.freeze({ id: 'music', district: 'culture', x: 244, y: 259, width: 152, height: 128, layer: 4, captionX: .36 }),
  Object.freeze({ id: 'arcade', district: 'culture', x: 421, y: 251, width: 156, height: 128, layer: 4 }),
  Object.freeze({ id: 'clinic', district: 'wellness', x: 686, y: 245, width: 152, height: 128, layer: 4 }),
  Object.freeze({ id: 'gym', district: 'wellness', x: 817, y: 324, width: 150, height: 128, layer: 5 }),
  ...([0, 1, 2, 3, 4, 5] as const).map(slot => Object.freeze({
    id: `slot-${slot}`,
    district: 'garden' as const,
    x: 31 + slot * 154,
    y: 480 + (slot % 2) * 15,
    width: 150,
    height: 108,
    layer: 5,
    captionY: slot % 2 === 0 ? -.6 : 0,
  })),
]);

const PLACEMENT = new Map(PLACED.map(item => [item.id, item]));

function placed(id: string): Placement {
  const found = PLACEMENT.get(id);
  if (!found) throw new Error(`missing exterior placement ${id}`);
  return found;
}

function withFrame(
  placement: Placement,
  sprite: ExteriorSprite,
  fields: Omit<ExteriorBuilding, 'id' | 'district' | 'layer' | 'rect' | 'frame' | 'landmark' | 'captionAnchor'>,
): ExteriorBuilding {
  const object: ScenePlacement = {
    x: placement.x,
    y: placement.y,
    asset: {
      id: placement.id,
      layer: placement.layer,
      bounds: { width: placement.width, height: placement.height },
      anchor: { x: 0, y: 0 },
    },
  };
  const rect = roomRect(object);
  const frame = sceneFrame(rect, EXTERIOR_ROOM);
  return {
    id: placement.id,
    district: placement.district,
    layer: placement.layer,
    rect,
    frame,
    captionAnchor: {
      left: frame.left + frame.width * (placement.captionX ?? .5),
      top: frame.top + frame.height * (placement.captionY ?? 1),
    },
    landmark: landmarkArt(sprite),
    ...fields,
  };
}

function hrefOf(path: string, query: Readonly<Record<string, string>> | null): string {
  if (!query) return path;
  const params = new URLSearchParams(query);
  return `${path}?${params.toString()}`;
}

function previousLandmark(
  swaps: Readonly<Record<string, 1 | 2 | 3>>,
  key: string,
  kind: 'library' | 'inn' | Habit['building_style'],
): LandmarkArt | null {
  const from = swaps[key];
  if (from == null) return null;
  return landmarkArt(buildingSprite(kind, from));
}

function healthSprite(health: ExteriorHealth, kind: 'clinic' | 'gym'): TownSpriteId {
  if (health.state === 'locked') return kind === 'clinic' ? 'clinic-locked' : 'gym-locked';
  if (health.state === 'ready') return buildingSprite(kind, kind === 'clinic' ? health.clinic : health.gym);
  return buildingSprite(kind, 1);
}

function healthLabel(health: ExteriorHealth): string {
  switch (health.state) {
    case 'locked': return 'Health locked';
    case 'unavailable': return 'Unavailable';
    case 'loading': return 'Loading';
    case 'ready': return 'Open';
  }
}

const CULTURE: readonly { id: 'theater' | 'music' | 'arcade'; name: string; label: string; kind: string }[] = Object.freeze([
  Object.freeze({ id: 'theater', name: 'Theater', label: 'Movies', kind: 'movie' }),
  Object.freeze({ id: 'music', name: 'Music bar', label: 'Artists', kind: 'artist' }),
  Object.freeze({ id: 'arcade', name: 'Arcade', label: 'Games', kind: 'game' }),
]);

/**
 * Every functional entrance is present for an unfounded town and a rich one.
 * Locked habit lots stay locked. Clinic and Gym stay linked in every Health state.
 */
export function exteriorBuildings(input: {
  data: TownResponse;
  treasury: TreasuryView;
  vaultPresent: boolean;
  health: ExteriorHealth;
  swaps?: Readonly<Record<string, 1 | 2 | 3>>;
}): readonly ExteriorBuilding[] {
  const swaps = input.swaps ?? {};
  const habits = new Map(input.data.habits.map(habit => [habit.id, habit]));
  const lots = new Map(input.data.lots.map(lot => [lot.slot, lot]));
  const buildings: ExteriorBuilding[] = [
    withFrame(placed('home'), 'home', {
      name: 'Home',
      label: 'Residential',
      previousLandmark: null,
      control: 'link',
      path: '/town/home/living',
      query: null,
      href: '/town/home/living',
      slot: null,
      habitId: null,
    }),
    (() => {
      const face = lotFace({
        kind: 'treasury',
        vaultPresent: input.vaultPresent,
        treasury: input.treasury,
      });
      return withFrame(placed('treasury'), face.sprite, {
        name: face.name,
        label: face.label,
        previousLandmark: null,
        control: face.control,
        path: face.external ? '' : face.link,
        query: null,
        href: face.link,
        slot: null,
        habitId: null,
      });
    })(),
    withFrame(placed('hall'), 'hall', {
      name: 'Hall',
      label: 'Civic hall',
      previousLandmark: null,
      control: 'link',
      path: '/town/hall',
      query: null,
      href: '/town/hall',
      slot: null,
      habitId: null,
    }),
    (() => {
      const face = lotFace({ kind: 'inn', building: input.data.buildings.inn });
      return withFrame(placed('inn'), face.sprite, {
        name: face.name,
        label: face.label,
        previousLandmark: previousLandmark(swaps, 'inn', 'inn'),
        control: face.control,
        path: face.link,
        query: null,
        href: face.link,
        slot: null,
        habitId: null,
      });
    })(),
    (() => {
      const face = lotFace({ kind: 'library', building: input.data.buildings.library });
      return withFrame(placed('library'), face.sprite, {
        name: face.name,
        label: face.label,
        previousLandmark: previousLandmark(swaps, 'library', 'library'),
        control: face.control,
        path: face.link,
        query: null,
        href: face.link,
        slot: null,
        habitId: null,
      });
    })(),
    ...CULTURE.map(item => {
      const query = { kind: item.kind };
      return withFrame(placed(item.id), item.id, {
        name: item.name,
        label: item.label,
        previousLandmark: null,
        control: 'link' as const,
        path: '/media/library',
        query,
        href: hrefOf('/media/library', query),
        slot: null,
        habitId: null,
      });
    }),
    ...(['clinic', 'gym'] as const).map(kind => withFrame(placed(kind), healthSprite(input.health, kind), {
      name: kind === 'clinic' ? 'Clinic' : 'Gym',
      label: healthLabel(input.health),
      previousLandmark: null,
      control: 'link' as const,
      path: kind === 'clinic' ? '/town/clinic' : '/town/gym',
      query: null,
      href: kind === 'clinic' ? '/town/clinic' : '/town/gym',
      slot: null,
      habitId: null,
    })),
  ];
  for (let slot = 0; slot < 6; slot += 1) {
    const lot = lots.get(slot) ?? { slot, unlock_level: 1, state: 'empty' as const, habit_id: null };
    const habit = lot.habit_id == null ? undefined : habits.get(lot.habit_id);
    const face = lotFace({ kind: 'habit', lot, habit });
    buildings.push(withFrame(placed(`slot-${slot}`), face.sprite, {
      name: face.name,
      label: face.label,
      previousLandmark: habit ? previousLandmark(swaps, `h${habit.id}`, habit.building_style) : null,
      control: face.control,
      path: '',
      query: null,
      href: '',
      slot,
      habitId: lot.habit_id,
    }));
  }
  return buildings;
}

/** Pan and zoom so a district fills the viewport, using the shared camera scale steps. */
export function frameDistrict(focus: RoomRect, viewport: SceneSize): SceneCamera {
  if (viewport.width <= 0 || viewport.height <= 0) return REST_CAMERA;
  const fit = Math.min(EXTERIOR_ROOM.width / focus.width, EXTERIOR_ROOM.height / focus.height);
  const scale = SCENE_SCALES.filter(step => step <= fit).at(-1) ?? SCENE_SCALES[0];
  const centerX = (focus.left + focus.width / 2) / EXTERIOR_ROOM.width * viewport.width;
  const centerY = (focus.top + focus.height / 2) / EXTERIOR_ROOM.height * viewport.height;
  return clampCamera({
    scale,
    x: viewport.width / 2 - centerX * scale,
    y: viewport.height / 2 - centerY * scale,
  }, viewport);
}

export interface InspectedPlace {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly state: 'empty' | 'locked' | 'occupied' | 'archived' | 'missing';
  readonly action: string | null;
  readonly slot: number | null;
  readonly habitId: number | null;
}

function missingPlace(id: string): InspectedPlace {
  return {
    id,
    name: 'Missing place',
    detail: 'That place is not on this town.',
    state: 'missing',
    action: null,
    slot: null,
    habitId: null,
  };
}

/** One inspector record for a lot or an archived habit. Unknown ids stay visible and do nothing. */
export function inspectedPlace(data: TownResponse, id: string | null): InspectedPlace | null {
  if (!id) return null;
  if (id.startsWith('archived-')) {
    const habitId = Number(id.slice('archived-'.length));
    const item = data.archived.find(habit => habit.id === habitId);
    if (!item || !Number.isInteger(habitId)) return missingPlace(id);
    const weeks = item.best_weeks > item.best_days;
    return {
      id,
      name: item.name,
      detail: `Archived ${formatTownDay(item.archived_on)}. Level ${item.level}. Best ${weeks ? `${item.best_weeks} weeks` : `${item.best_days} days`}.`,
      state: 'archived',
      action: 'Open history',
      slot: null,
      habitId: item.id,
    };
  }
  if (!id.startsWith('slot-')) return missingPlace(id);
  const slot = Number(id.slice('slot-'.length));
  const lot = Number.isInteger(slot) ? data.lots.find(item => item.slot === slot) : undefined;
  if (!lot) return missingPlace(id);
  if (lot.state === 'locked') {
    return {
      id,
      name: 'Locked lot',
      detail: `Unlocks at level ${lot.unlock_level}. Nothing can be built here yet.`,
      state: 'locked',
      action: null,
      slot,
      habitId: null,
    };
  }
  if (lot.state === 'empty' || lot.habit_id == null) {
    return {
      id,
      name: 'Empty lot',
      detail: 'This lot is ready for a habit.',
      state: 'empty',
      action: 'Build here',
      slot,
      habitId: null,
    };
  }
  const habit = data.habits.find(item => item.id === lot.habit_id);
  if (!habit) return missingPlace(id);
  const unit = habit.streak.unit === 'days' ? 'day' : 'week';
  return {
    id,
    name: habit.name,
    detail: `Level ${habit.level}. ${habit.streak.current}-${unit} streak.`,
    state: 'occupied',
    action: 'Edit habit',
    slot,
    habitId: habit.id,
  };
}
