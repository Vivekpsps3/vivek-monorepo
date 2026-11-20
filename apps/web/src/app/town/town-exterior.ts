import type { TownHealthStages } from './health';
import {
  REST_CAMERA,
  SCENE_SCALES,
  clampCamera,
  nearestScale,
  roomRect,
  sceneFrame,
  type RoomRect,
  type SceneCamera,
  type ScenePlacement,
  type SceneSize,
} from './library-room.scene';
import { buildingSprite, townSpriteUrl, type TownSpriteId } from './town-sprites';
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
  Object.freeze({ id: 'residential', label: 'Residential', focus: Object.freeze({ left: 0, top: 0, width: 210, height: 160 }) }),
  Object.freeze({ id: 'civic', label: 'Civic', focus: Object.freeze({ left: 230, top: 0, width: 380, height: 160 }) }),
  Object.freeze({ id: 'harbor', label: 'Harbor', focus: Object.freeze({ left: 790, top: 0, width: 210, height: 160 }) }),
  Object.freeze({ id: 'culture', label: 'Culture', focus: Object.freeze({ left: 0, top: 160, width: 760, height: 170 }) }),
  Object.freeze({ id: 'wellness', label: 'Wellness', focus: Object.freeze({ left: 790, top: 160, width: 210, height: 320 }) }),
  Object.freeze({ id: 'garden', label: 'Garden', focus: Object.freeze({ left: 0, top: 490, width: 1000, height: 150 }) }),
]);

export interface LotFace {
  readonly name: string;
  readonly label: string;
  readonly src: string;
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
      src: townSpriteUrl(sprite),
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
      src: townSpriteUrl(buildingSprite(kind, building?.stage ?? 1)),
      link: kind === 'library' ? '/town/library' : '/travel',
      external: false,
      control: 'link',
    };
  }
  if (lot?.state === 'occupied' && habit) {
    return {
      name: habit.name,
      label: `Lv ${habit.level} · ${habit.streak.current}-${habit.streak.unit === 'days' ? 'day' : 'week'} streak`,
      src: townSpriteUrl(buildingSprite(habit.building_style, habit.stage)),
      link: '',
      external: false,
      control: 'habit',
    };
  }
  const locked = lot?.state === 'locked';
  return {
    name: locked ? 'Locked lot' : 'Empty lot',
    label: locked ? `Unlocks at Lv ${lot?.unlock_level}` : 'Build here',
    src: townSpriteUrl(locked ? 'lot-locked' : 'lot-empty'),
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
  readonly sprite: string;
  readonly previousSprite: string | null;
  readonly control: 'external' | 'link' | 'habit' | 'locked' | 'select';
  readonly path: string;
  readonly query: Readonly<Record<string, string>> | null;
  readonly href: string;
  readonly slot: number | null;
  readonly habitId: number | null;
  readonly layer: number;
  readonly rect: RoomRect;
  readonly frame: RoomRect;
}

export interface ExteriorPlate {
  readonly id: DistrictId;
  readonly label: string;
  readonly frame: RoomRect;
}

interface Placement {
  readonly id: string;
  readonly district: DistrictId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly layer: number;
}

const PLACED: readonly Placement[] = Object.freeze([
  Object.freeze({ id: 'home', district: 'residential', x: 8, y: 16, width: 158, height: 124, layer: 2 }),
  Object.freeze({ id: 'treasury', district: 'civic', x: 250, y: 16, width: 158, height: 124, layer: 2 }),
  Object.freeze({ id: 'hall', district: 'civic', x: 424, y: 16, width: 158, height: 124, layer: 2 }),
  Object.freeze({ id: 'inn', district: 'harbor', x: 820, y: 16, width: 158, height: 124, layer: 3 }),
  Object.freeze({ id: 'library', district: 'culture', x: 8, y: 176, width: 158, height: 124, layer: 2 }),
  Object.freeze({ id: 'theater', district: 'culture', x: 182, y: 176, width: 158, height: 124, layer: 2 }),
  Object.freeze({ id: 'music', district: 'culture', x: 356, y: 176, width: 158, height: 124, layer: 2 }),
  Object.freeze({ id: 'arcade', district: 'culture', x: 530, y: 176, width: 158, height: 124, layer: 2 }),
  Object.freeze({ id: 'clinic', district: 'wellness', x: 820, y: 176, width: 158, height: 124, layer: 3 }),
  Object.freeze({ id: 'gym', district: 'wellness', x: 820, y: 336, width: 158, height: 124, layer: 3 }),
  ...([0, 1, 2, 3, 4, 5] as const).map(slot => Object.freeze({
    id: `slot-${slot}`,
    district: 'garden' as const,
    x: 8 + slot * 166,
    y: 508,
    width: 158,
    height: 112,
    layer: 2,
  })),
]);

const PLACEMENT = new Map(PLACED.map(item => [item.id, item]));

function placed(id: string): Placement {
  const found = PLACEMENT.get(id);
  if (!found) throw new Error(`missing exterior placement ${id}`);
  return found;
}

function withFrame(placement: Placement, fields: Omit<ExteriorBuilding, 'id' | 'district' | 'layer' | 'rect' | 'frame'>): ExteriorBuilding {
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
  return {
    id: placement.id,
    district: placement.district,
    layer: placement.layer,
    rect,
    frame: sceneFrame(rect, EXTERIOR_ROOM),
    ...fields,
  };
}

function hrefOf(path: string, query: Readonly<Record<string, string>> | null): string {
  if (!query) return path;
  const params = new URLSearchParams(query);
  return `${path}?${params.toString()}`;
}

function previousSprite(swaps: Readonly<Record<string, 1 | 2 | 3>>, key: string, kind: 'library' | 'inn' | Habit['building_style']): string | null {
  const from = swaps[key];
  if (from == null) return null;
  return townSpriteUrl(buildingSprite(kind, from));
}

function healthSprite(health: ExteriorHealth, kind: 'clinic' | 'gym'): string {
  if (health.state === 'locked') return townSpriteUrl(kind === 'clinic' ? 'clinic-locked' : 'gym-locked');
  if (health.state === 'ready') return townSpriteUrl(buildingSprite(kind, kind === 'clinic' ? health.clinic : health.gym));
  return townSpriteUrl(buildingSprite(kind, 1));
}

function healthLabel(health: ExteriorHealth): string {
  switch (health.state) {
    case 'locked': return 'Health locked';
    case 'unavailable': return 'Unavailable';
    case 'loading': return 'Loading';
    case 'ready': return 'Open';
  }
}

const CULTURE: readonly { id: string; name: string; label: string; kind: string }[] = Object.freeze([
  Object.freeze({ id: 'theater', name: 'Theater', label: 'Movies', kind: 'movie' }),
  Object.freeze({ id: 'music', name: 'Music bar', label: 'Artists', kind: 'artist' }),
  Object.freeze({ id: 'arcade', name: 'Arcade', label: 'Games', kind: 'game' }),
]);

export function exteriorPlates(): readonly ExteriorPlate[] {
  return DISTRICTS.map(district => ({
    id: district.id,
    label: district.label,
    frame: sceneFrame(district.focus, EXTERIOR_ROOM),
  }));
}

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
    withFrame(placed('home'), {
      name: 'Home',
      label: 'Residential',
      sprite: '/town/exterior/home.svg',
      previousSprite: null,
      control: 'select',
      path: '',
      query: null,
      href: '',
      slot: null,
      habitId: null,
    }),
    (() => {
      const face = lotFace({
        kind: 'treasury',
        vaultPresent: input.vaultPresent,
        treasury: input.treasury,
      });
      return withFrame(placed('treasury'), {
        name: face.name,
        label: face.label,
        sprite: face.src,
        previousSprite: null,
        control: face.control,
        path: face.external ? '' : face.link,
        query: null,
        href: face.link,
        slot: null,
        habitId: null,
      });
    })(),
    withFrame(placed('hall'), {
      name: 'Hall',
      label: 'Civic hall',
      sprite: '/town/exterior/hall.svg',
      previousSprite: null,
      control: 'select',
      path: '',
      query: null,
      href: '',
      slot: null,
      habitId: null,
    }),
    (() => {
      const face = lotFace({ kind: 'inn', building: input.data.buildings.inn });
      return withFrame(placed('inn'), {
        name: face.name,
        label: face.label,
        sprite: face.src,
        previousSprite: previousSprite(swaps, 'inn', 'inn'),
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
      return withFrame(placed('library'), {
        name: face.name,
        label: face.label,
        sprite: face.src,
        previousSprite: previousSprite(swaps, 'library', 'library'),
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
      return withFrame(placed(item.id), {
        name: item.name,
        label: item.label,
        sprite: `/town/exterior/${item.id}.svg`,
        previousSprite: null,
        control: 'link' as const,
        path: '/media/library',
        query,
        href: hrefOf('/media/library', query),
        slot: null,
        habitId: null,
      });
    }),
    ...(['clinic', 'gym'] as const).map(kind => withFrame(placed(kind), {
      name: kind === 'clinic' ? 'Clinic' : 'Gym',
      label: healthLabel(input.health),
      sprite: healthSprite(input.health, kind),
      previousSprite: null,
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
    buildings.push(withFrame(placed(`slot-${slot}`), {
      name: face.name,
      label: face.label,
      sprite: face.src,
      previousSprite: habit ? previousSprite(swaps, `h${habit.id}`, habit.building_style) : null,
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
  const scale = nearestScale(Math.min(SCENE_SCALES[SCENE_SCALES.length - 1], Math.max(SCENE_SCALES[0], fit)));
  const centerX = (focus.left + focus.width / 2) / EXTERIOR_ROOM.width * viewport.width;
  const centerY = (focus.top + focus.height / 2) / EXTERIOR_ROOM.height * viewport.height;
  return clampCamera({
    scale,
    x: viewport.width / 2 - centerX * scale,
    y: viewport.height / 2 - centerY * scale,
  }, viewport);
}
