'use strict';

const NEW_PLAYER_WINDOW_DAYS = 14;
const NEW_PLAYER_WINDOW_MS = NEW_PLAYER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function isNewPlayerRegistration(registrationAt, now = Date.now()) {
  const registeredAt = new Date(registrationAt).getTime();
  const currentTime = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(registeredAt) || !Number.isFinite(currentTime)) return false;
  const age = currentTime - registeredAt;
  return age >= 0 && age < NEW_PLAYER_WINDOW_MS;
}

module.exports = { NEW_PLAYER_WINDOW_DAYS, NEW_PLAYER_WINDOW_MS, isNewPlayerRegistration };
