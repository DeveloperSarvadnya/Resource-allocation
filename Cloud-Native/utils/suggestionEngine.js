'use strict';

/**
 * suggestionEngine.js
 *
 * Predictive slot suggestion engine.
 * Analyses real historical booking data to recommend the best
 * available time slots for a given resource and duration.
 *
 * Intelligence layers applied (in order):
 *   1. User preference pattern  — what hour does THIS user usually book?
 *   2. Resource demand heatmap  — which hours are least contested?
 *   3. Day-of-week analysis     — which days are lightest for this resource?
 *   4. Conflict risk scoring    — how likely is this slot to get taken?
 *   5. Slot availability check  — confirm the slot is actually free right now
 */

const { Op } = require('sequelize');
const { DateTime } = require('luxon');
const { Schedule } = require('../models');

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const LOOK_BACK_DAYS   = 60;   // analyse last 60 days of history
const LOOK_AHEAD_DAYS  = 14;   // suggest slots within next 14 days
const MAX_SUGGESTIONS  = 5;    // return at most 5 suggestions
const BUSINESS_START   = 8;    // 08:00 — earliest suggestion hour
const BUSINESS_END     = 20;   // 20:00 — latest suggestion start hour

// ─────────────────────────────────────────────────────────────
// HELPER: fetch historical confirmed bookings
// ─────────────────────────────────────────────────────────────
const fetchHistory = async (resourceId, userId) => {
  const since = DateTime.utc().minus({ days: LOOK_BACK_DAYS }).toJSDate();

  const [resourceHistory, userHistory] = await Promise.all([
    // All confirmed bookings on this resource (last 60 days)
    Schedule.findAll({
      where: {
        resourceId,
        status: 'confirmed',
        startTime: { [Op.gte]: since },
      },
      attributes: ['startTime', 'endTime', 'userId'],
    }),

    // This user's bookings on ANY resource (last 60 days)
    Schedule.findAll({
      where: {
        userId,
        status: 'confirmed',
        startTime: { [Op.gte]: since },
      },
      attributes: ['startTime', 'endTime'],
    }),
  ]);

  return { resourceHistory, userHistory };
};

// ─────────────────────────────────────────────────────────────
// HELPER: build hour → booking count map  (0-23)
// ─────────────────────────────────────────────────────────────
const buildHourMap = (schedules) => {
  const map = new Array(24).fill(0);
  for (const s of schedules) {
    const hour = DateTime.fromJSDate(s.startTime, { zone: 'utc' }).hour;
    map[hour] += 1;
  }
  return map;
};

// ─────────────────────────────────────────────────────────────
// HELPER: build dayOfWeek → booking count map  (1=Mon … 7=Sun)
// ─────────────────────────────────────────────────────────────
const buildDayMap = (schedules) => {
  const map = new Array(8).fill(0); // index 1-7
  for (const s of schedules) {
    const dow = DateTime.fromJSDate(s.startTime, { zone: 'utc' }).weekday;
    map[dow] += 1;
  }
  return map;
};

// ─────────────────────────────────────────────────────────────
// HELPER: check if a candidate slot is free (no overlap)
// ─────────────────────────────────────────────────────────────
const isSlotFree = async (resourceId, startUTC, endUTC) => {
  const conflict = await Schedule.findOne({
    where: {
      resourceId,
      status: 'confirmed',
      startTime: { [Op.lt]: endUTC },
      endTime:   { [Op.gt]: startUTC },
    },
  });
  return conflict === null;
};

// ─────────────────────────────────────────────────────────────
// HELPER: compute conflict risk label
// ─────────────────────────────────────────────────────────────
const riskLabel = (demandScore) => {
  if (demandScore === 0)  return 'very low';
  if (demandScore <= 2)   return 'low';
  if (demandScore <= 5)   return 'medium';
  return 'high';
};

// ─────────────────────────────────────────────────────────────
// HELPER: build a human-readable reason string
// ─────────────────────────────────────────────────────────────
const buildReason = ({ isUserPreferred, isDemandLow, isDayLight, isEarlyInDay }) => {
  const reasons = [];

  if (isUserPreferred)  reasons.push('matches your usual booking time');
  if (isDemandLow)      reasons.push('historically low demand for this resource');
  if (isDayLight)       reasons.push('lightest day of the week for this resource');
  if (isEarlyInDay)     reasons.push('early slot — less likely to be taken');

  if (reasons.length === 0) return 'available slot within your search window';
  return reasons.join(', ');
};

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT: generateSuggestions
// ─────────────────────────────────────────────────────────────

/**
 * @param {string}  resourceId   - UUID of the resource to book
 * @param {string}  userId       - UUID of the requesting user
 * @param {number}  durationMins - desired booking length in minutes
 * @param {string}  preferredDate- optional ISO date string (YYYY-MM-DD) to start searching from
 * @returns {Array} up to MAX_SUGGESTIONS ranked suggestion objects
 */
const generateSuggestions = async (resourceId, userId, durationMins, preferredDate) => {

  // ── 1. Fetch history ────────────────────────────────────────
  const { resourceHistory, userHistory } = await fetchHistory(resourceId, userId);

  // ── 2. Build analysis maps ──────────────────────────────────
  const resourceHourMap = buildHourMap(resourceHistory);  // demand per hour on this resource
  const userHourMap     = buildHourMap(userHistory);      // this user's preferred hours
  const resourceDayMap  = buildDayMap(resourceHistory);   // demand per day on this resource

  // User's most-booked hour (their preference)
  const userPreferredHour = userHourMap.indexOf(Math.max(...userHourMap));

  // Day with least resource demand (1=Mon…7=Sun)
  const nonZeroDays = resourceDayMap.slice(1); // ignore index 0
  const minDayDemand = Math.min(...nonZeroDays);
  const lightestDayOfWeek = nonZeroDays.indexOf(minDayDemand) + 1;

  // ── 3. Generate candidate slots ─────────────────────────────
  const searchStart = preferredDate
    ? DateTime.fromISO(preferredDate, { zone: 'utc' }).startOf('day')
    : DateTime.utc().plus({ hours: 1 }).startOf('hour'); // start from next full hour

  const searchEnd = searchStart.plus({ days: LOOK_AHEAD_DAYS });

  const suggestions = [];
  let   cursor      = searchStart;

  while (cursor < searchEnd && suggestions.length < MAX_SUGGESTIONS) {

    // Only suggest business hours
    if (cursor.hour >= BUSINESS_START && cursor.hour <= BUSINESS_END) {

      const slotStart = cursor.toJSDate();
      const slotEnd   = cursor.plus({ minutes: durationMins }).toJSDate();

      // Skip past slots
      if (slotStart > new Date()) {

        const free = await isSlotFree(resourceId, slotStart, slotEnd);

        if (free) {
          const hour       = cursor.hour;
          const dow        = cursor.weekday; // 1=Mon…7=Sun

          // ── Scoring signals ──────────────────────────────────
          const demandScore    = resourceHourMap[hour];           // how busy is this hour?
          const isUserPreferred = Math.abs(hour - userPreferredHour) <= 1; // within 1hr of user pref
          const isDemandLow    = demandScore <= 2;
          const isDayLight     = dow === lightestDayOfWeek;
          const isEarlyInDay   = hour <= 10;

          // ── Composite score (lower = better suggestion) ──────
          // Start with demand score, subtract bonuses for preferred signals
          let score = demandScore;
          if (isUserPreferred)  score -= 3;
          if (isDemandLow)      score -= 2;
          if (isDayLight)       score -= 1;
          if (isEarlyInDay)     score -= 0.5;

          suggestions.push({
            startTime:    cursor.toISO(),
            endTime:      cursor.plus({ minutes: durationMins }).toISO(),
            score,                                          // used for sorting, not exposed
            conflictRisk: riskLabel(demandScore),
            reason:       buildReason({ isUserPreferred, isDemandLow, isDayLight, isEarlyInDay }),
            meta: {
              dayOfWeek:        cursor.toFormat('cccc'),   // e.g. "Monday"
              timeOfDay:        cursor.toFormat('hh:mm a'),
              demandScore,
              userPreferenceMatch: isUserPreferred,
            },
          });
        }
      }
    }

    // Advance by 30-minute increments
    cursor = cursor.plus({ minutes: 30 });
  }

  // ── 4. Sort by score ascending (best first) ─────────────────
  suggestions.sort((a, b) => a.score - b.score);

  // ── 5. Remove internal score before returning ───────────────
  return suggestions.slice(0, MAX_SUGGESTIONS).map(({ score, ...rest }) => rest);
};

// ─────────────────────────────────────────────────────────────
// RESOURCE-LEVEL ANALYTICS  (bonus: used in suggestions response)
// ─────────────────────────────────────────────────────────────

/**
 * Returns a demand heatmap and peak hours for a resource.
 * Useful for the frontend to display a visual availability calendar.
 */
const getResourceAnalytics = async (resourceId) => {
  const since = DateTime.utc().minus({ days: LOOK_BACK_DAYS }).toJSDate();

  const history = await Schedule.findAll({
    where: {
      resourceId,
      status: 'confirmed',
      startTime: { [Op.gte]: since },
    },
    attributes: ['startTime'],
  });

  const hourMap = buildHourMap(history);
  const dayMap  = buildDayMap(history);

  const peakHour = hourMap.indexOf(Math.max(...hourMap));
  const quietHour = hourMap.indexOf(Math.min(...hourMap.slice(BUSINESS_START, BUSINESS_END)));

  const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return {
    totalBookingsAnalysed: history.length,
    lookBackDays: LOOK_BACK_DAYS,
    peakHour: `${peakHour}:00`,
    quietestBusinessHour: `${BUSINESS_START + quietHour}:00`,
    hourlyDemandMap: hourMap.map((count, hour) => ({ hour: `${hour}:00`, bookingCount: count })),
    dailyDemandMap:  dayMap.slice(1).map((count, i) => ({ day: dayNames[i + 1], bookingCount: count })),
  };
};

module.exports = { generateSuggestions, getResourceAnalytics };