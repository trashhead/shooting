// Gameplay numbers both client and (later) server need, so movement can be
// predicted on the client and validated on the server with the same values.
export const PLAYER_RADIUS = 0.5;
export const EYE_HEIGHT = 1.7;
export const MOVE_SPEED = 14;
export const SNEAK_SPEED = 5;
export const DAMPING = 10;
export const GRAVITY = 30;
export const JUMP_SPEED = 10;

export const BOX_HALF_EXTENT = 1; // the field map's boxes are 2x2x2

// Combat
export const MAX_HEALTH = 100;
export const SHOT_DAMAGE = 10;
export const SHOT_RANGE = 250;
export const BOLT_SPEED = 130; // units/sec - the visible bolt and the server's hit simulation both use this
export const RESPAWN_DELAY_MS = 1500; // earliest a dead player may respawn
export const HIT_RADIUS = PLAYER_RADIUS + 0.1; // forgiving: positions are ~50 ms stale
export const HEAD_ABOVE_EYE = 0.3;
