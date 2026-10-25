// Which map the game runs on. Client and server both read this, so change it
// here and restart: 'field' (open field, scattered boxes) or 'arena' (2v2).
export type MapName = 'field' | 'arena';
export const ACTIVE_MAP: MapName = 'arena';
