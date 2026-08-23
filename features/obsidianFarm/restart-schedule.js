'use strict';

const SERVER_TIME_ZONE = 'Europe/Kyiv';
const SCHEDULED_RESTART_CONNECTION_EVENTS = new Set([
  'bot_disconnected',
  'bot_reconnected',
  'bot_kicked',
  'repeated_reconnects'
]);

function getServerRestartDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SERVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function isRestartPreparationWindow({ hour, minute }) {
  return (hour === 8 && minute >= 59) || (hour === 9 && minute <= 30);
}

function isPostRestartStartupWindow({ hour, minute }) {
  return hour === 9 && minute <= 30;
}

function isScheduledRestartConnectionEvent(eventType, date = new Date()) {
  if (!SCHEDULED_RESTART_CONNECTION_EVENTS.has(String(eventType || ''))) return false;
  return isRestartPreparationWindow(getServerRestartDateParts(date));
}

module.exports = {
  SERVER_TIME_ZONE,
  SCHEDULED_RESTART_CONNECTION_EVENTS,
  getServerRestartDateParts,
  isRestartPreparationWindow,
  isPostRestartStartupWindow,
  isScheduledRestartConnectionEvent
};
