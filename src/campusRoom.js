import {buildStudio} from './studioRoom.js';
import {buildThemedRoom} from './themedRooms.js';

export function buildCampus(scene, roomId) {
  return roomId === 'studio' ? buildStudio(scene) : buildThemedRoom(scene, roomId);
}
