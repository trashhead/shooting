// Whether the local player is alive. Kept in its own tiny module so movement
// and the weapon can check it without importing the networking/HUD code.
let alive = true;

export const isAlive = () => alive;
export const setAlive = (value: boolean) => {
  alive = value;
};
