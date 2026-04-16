'use strict';

const { Op } = require('sequelize');
const { Schedule, RecurringSchedule } = require('../models');
const { DateTime } = require('luxon');

/**
 * Build a Sequelize WHERE clause that catches any schedule overlapping
 * with [newStart, newEnd] on the given resource.
 *
 * Overlap condition:  existingStart < newEnd  AND  existingEnd > newStart
 */
const overlapWhere = (resourceId, newStart, newEnd, excludeScheduleId = null) => {
  const where = {
    resourceId,
    status: 'confirmed',
    startTime: { [Op.lt]: newEnd },
    endTime:   { [Op.gt]: newStart },
  };
  if (excludeScheduleId) {
    where.id = { [Op.ne]: excludeScheduleId };
  }
  return where;
};

/**
 * Check exact or partial overlap in the schedules table.
 * Returns the conflicting schedules (array) or [].
 */
const checkOverlap = async (resourceId, newStart, newEnd, excludeScheduleId = null) => {
  const conflicts = await Schedule.findAll({
    where: overlapWhere(resourceId, newStart, newEnd, excludeScheduleId),
  });
  return conflicts;
};

/**
 * Check if any ACTIVE recurring schedule would produce an occurrence
 * that overlaps the requested window.
 *
 * Strategy: for each active recurring schedule on the resource,
 * generate candidate occurrences around the requested window and test overlap.
 */
const checkRecurringConflict = async (resourceId, newStart, newEnd) => {
  const recurrings = await RecurringSchedule.findAll({
    where: {
      resourceId,
      isActive: true,
      recurStart: { [Op.lte]: newEnd },
      [Op.or]: [
        { recurEnd: null },
        { recurEnd: { [Op.gte]: newStart } },
      ],
    },
  });

  const conflicts = [];

  for (const rec of recurrings) {
    const tz       = rec.timezone || 'UTC';
    const startDT  = DateTime.fromJSDate(newStart, { zone: 'utc' }).setZone(tz);
    const endDT    = DateTime.fromJSDate(newEnd,   { zone: 'utc' }).setZone(tz);

    // Generate candidate dates: 1 week window around the requested date
    const candidates = generateOccurrences(rec, startDT.minus({ days: 7 }), endDT.plus({ days: 7 }), tz);

    for (const { occStart, occEnd } of candidates) {
      // Overlap: occStart < newEnd AND occEnd > newStart
      if (occStart < newEnd && occEnd > newStart) {
        conflicts.push({ recurringSchedule: rec, occStart, occEnd });
        break;
      }
    }
  }

  return conflicts;
};

/**
 * Generate concrete UTC occurrence Date objects for a recurring schedule
 * within a Luxon DateTime window.
 */
const generateOccurrences = (rec, windowStart, windowEnd, tz) => {
  const occurrences = [];
  const [sh, sm] = rec.startTime.split(':').map(Number);
  const [eh, em] = rec.endTime.split(':').map(Number);

  let cursor = DateTime.fromISO(rec.recurStart, { zone: tz });
  const hardEnd = rec.recurEnd
    ? DateTime.fromISO(rec.recurEnd, { zone: tz })
    : windowEnd.plus({ years: 1 });

  // Cap iterations to avoid infinite loop
  let iterations = 0;
  const MAX_ITER = 400;

  while (cursor <= hardEnd && cursor <= windowEnd && iterations < MAX_ITER) {
    iterations++;
    let match = false;

    if (rec.frequency === 'daily') {
      match = true;
    } else if (rec.frequency === 'weekly') {
      // Luxon weekday: 1=Mon … 7=Sun, but we store 0=Sun … 6=Sat
      const luxonDay = cursor.weekday % 7; // converts to 0=Sun
      match = (rec.dayOfWeek === luxonDay);
    } else if (rec.frequency === 'monthly') {
      match = (cursor.day === rec.dayOfMonth);
    }

    if (match && cursor >= windowStart) {
      const occStart = cursor.set({ hour: sh, minute: sm, second: 0, millisecond: 0 }).toUTC().toJSDate();
      const occEnd   = cursor.set({ hour: eh, minute: em, second: 0, millisecond: 0 }).toUTC().toJSDate();
      occurrences.push({ occStart, occEnd });
    }

    // Advance cursor
    if (rec.frequency === 'daily')        cursor = cursor.plus({ days: 1 });
    else if (rec.frequency === 'weekly')  cursor = cursor.plus({ days: 1 });
    else if (rec.frequency === 'monthly') cursor = cursor.plus({ days: 1 }); // check each day, match on day-of-month
  }

  return occurrences;
};

module.exports = { checkOverlap, checkRecurringConflict };