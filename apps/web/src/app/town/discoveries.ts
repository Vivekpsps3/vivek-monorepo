import { sceneFrame, type RoomRect } from './library-room.scene';
import { EXTERIOR_ROOM, type DistrictId } from './town-exterior';

export interface DiscoveryMark {
  readonly id: string;
  readonly name: string;
  readonly district: DistrictId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly frame: RoomRect;
}

function mark(
  id: string,
  name: string,
  district: DistrictId,
  x: number,
  y: number,
  width = 36,
  height = 36,
): DiscoveryMark {
  return {
    id,
    name,
    district,
    x,
    y,
    width,
    height,
    frame: sceneFrame({ left: x, top: y, width, height }, EXTERIOR_ROOM),
  };
}

/** Scene gaps only. These marks do not cover a building footprint. */
export const DISCOVERY_MARKS: readonly DiscoveryMark[] = Object.freeze([
  mark('tidepool-shells', 'Tidepool shells', 'harbor', 688, 168),
  mark('ferry-bell', 'Ferry bell', 'harbor', 692, 48),
  mark('library-globe', 'Library globe', 'culture', 36, 220),
  mark('theater-light-booth', 'Theater light booth', 'culture', 460, 188),
  mark('music-mural', 'Music mural', 'culture', 188, 340),
  mark('gym-chalkboard', 'Gym chalkboard', 'wellness', 748, 400),
  mark('clinic-garden', 'Clinic garden', 'wellness', 620, 300),
  mark('hall-sundial', 'Hall sundial', 'civic', 496, 168),
  mark('courtyard-birdbath', 'Courtyard birdbath', 'residential', 16, 88),
  mark('lantern-alley', 'Lantern alley', 'garden', 16, 600, 36, 32),
  mark('rooftop-telescope', 'Rooftop telescope', 'residential', 176, 2, 36, 32),
  mark('arcade-sign', 'Arcade sign', 'culture', 596, 210),
]);
