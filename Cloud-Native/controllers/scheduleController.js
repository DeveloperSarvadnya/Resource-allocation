'use strict';

const { DateTime } = require('luxon');
const sequelize = require('../config/database');
const { Schedule, RecurringSchedule, Resource, User, BookingHistory } = require('../models');
const { checkOverlap, checkRecurringConflict } = require('../utils/conflictDetector');
const { generateSuggestions, getResourceAnalytics } = require('../utils/suggestionEngine');
const AppError = require('../utils/AppError');

// ── helpers ──────────────────────────────────────────────────────────────────

const toUTCDate = (isoString) => {
  const dt = DateTime.fromISO(isoString, { setZone: true });
  if (!dt.isValid) throw new AppError(`Invalid datetime: ${isoString}`, 400);
  return dt.toUTC().toJSDate();
};

const rejectPastBooking = (startUTC) => {
  if (startUTC < new Date()) {
    throw new AppError('Cannot book a time slot in the past', 422);
  }
};

// ── GET /api/schedules ────────────────────────────────────────────────────────
const getAll = async (req, res, next) => {
  try {
    const where = {};
    // Regular users see only their own schedules
    if (req.user.role === 'user') where.userId = req.user.id;

    const schedules = await Schedule.findAll({
      where,
      include: [
        { model: Resource, as: 'resource', attributes: ['id', 'name', 'location'] },
        { model: User,     as: 'user',     attributes: ['id', 'name', 'email'] },
      ],
      order: [['startTime', 'ASC']],
    });
    res.json({ data: schedules });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/schedules/:id ────────────────────────────────────────────────────
const getOne = async (req, res, next) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id, {
      include: [
        { model: Resource,         as: 'resource' },
        { model: User,             as: 'user',     attributes: ['id', 'name', 'email'] },
        { model: BookingHistory,   as: 'history',  include: [{ model: User, as: 'changedByUser', attributes: ['id', 'name'] }] },
      ],
    });
    if (!schedule) throw new AppError('Schedule not found', 404);
    // Users can only see their own
    if (req.user.role === 'user' && schedule.userId !== req.user.id) {
      throw new AppError('Access denied', 403);
    }
    res.json({ data: schedule });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/schedules ───────────────────────────────────────────────────────
const create = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { resourceId, title, startTime, endTime, notes } = req.body;

    const startUTC = toUTCDate(startTime);
    const endUTC   = toUTCDate(endTime);

    // 1. Reject past bookings
    rejectPastBooking(startUTC);

    // 2. Ensure end > start
    if (endUTC <= startUTC) {
      throw new AppError('endTime must be after startTime', 422);
    }

    // 3. Confirm resource exists and is active
    const resource = await Resource.findByPk(resourceId, { transaction: t });
    if (!resource || !resource.isActive) {
      throw new AppError('Resource not found or inactive', 404);
    }

    // 4. Exact / partial overlap check
    const conflicts = await checkOverlap(resourceId, startUTC, endUTC);
    if (conflicts.length > 0) {
      throw new AppError('Time slot conflicts with an existing booking', 409, {
        conflicts: conflicts.map((c) => ({
          id: c.id,
          title: c.title,
          startTime: c.startTime,
          endTime: c.endTime,
        })),
      });
    }

    // 5. Recurring conflict check
    const recurringConflicts = await checkRecurringConflict(resourceId, startUTC, endUTC);
    if (recurringConflicts.length > 0) {
      throw new AppError('Time slot conflicts with a recurring schedule', 409, {
        recurringConflicts: recurringConflicts.map((c) => ({
          recurringScheduleId: c.recurringSchedule.id,
          title: c.recurringSchedule.title,
          occurrenceStart: c.occStart,
          occurrenceEnd:   c.occEnd,
        })),
      });
    }

    // 6. Create the schedule (inside transaction)
    const schedule = await Schedule.create(
      { resourceId, userId: req.user.id, title, startTime: startUTC, endTime: endUTC, notes },
      { transaction: t }
    );

    // 7. Audit trail
    await BookingHistory.create(
      {
        scheduleId: schedule.id,
        changedBy:  req.user.id,
        action:     'created',
        newStatus:  'confirmed',
        notes:      'Schedule created',
      },
      { transaction: t }
    );

    await t.commit();

    res.status(201).json({ data: schedule });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// ── PUT /api/schedules/:id ────────────────────────────────────────────────────
const update = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const schedule = await Schedule.findByPk(req.params.id, { transaction: t });
    if (!schedule) throw new AppError('Schedule not found', 404);

    // Only owner, manager, or admin may update
    if (req.user.role === 'user' && schedule.userId !== req.user.id) {
      throw new AppError('Access denied', 403);
    }
    if (schedule.status === 'cancelled') {
      throw new AppError('Cannot update a cancelled schedule', 422);
    }

    const { title, startTime, endTime, notes } = req.body;
    const startUTC = startTime ? toUTCDate(startTime) : schedule.startTime;
    const endUTC   = endTime   ? toUTCDate(endTime)   : schedule.endTime;

    rejectPastBooking(startUTC);

    if (endUTC <= startUTC) throw new AppError('endTime must be after startTime', 422);

    const conflicts = await checkOverlap(schedule.resourceId, startUTC, endUTC, schedule.id);
    if (conflicts.length > 0) throw new AppError('Updated slot conflicts with existing booking', 409);

    const recurringConflicts = await checkRecurringConflict(schedule.resourceId, startUTC, endUTC);
    if (recurringConflicts.length > 0) throw new AppError('Updated slot conflicts with a recurring schedule', 409);

    await schedule.update({ title, startTime: startUTC, endTime: endUTC, notes }, { transaction: t });

    await BookingHistory.create(
      { scheduleId: schedule.id, changedBy: req.user.id, action: 'updated', oldStatus: 'confirmed', newStatus: 'confirmed' },
      { transaction: t }
    );

    await t.commit();
    res.json({ data: schedule });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// ── DELETE /api/schedules/:id  (cancel) ──────────────────────────────────────
const cancel = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const schedule = await Schedule.findByPk(req.params.id, { transaction: t });
    if (!schedule) throw new AppError('Schedule not found', 404);

    if (req.user.role === 'user' && schedule.userId !== req.user.id) {
      throw new AppError('Access denied', 403);
    }
    if (schedule.status === 'cancelled') {
      throw new AppError('Schedule is already cancelled', 422);
    }

    const oldStatus = schedule.status;
    await schedule.update({ status: 'cancelled' }, { transaction: t });

    await BookingHistory.create(
      { scheduleId: schedule.id, changedBy: req.user.id, action: 'cancelled', oldStatus, newStatus: 'cancelled' },
      { transaction: t }
    );

    await t.commit();
    res.json({ message: 'Schedule cancelled', data: schedule });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// ── POST /api/schedules/recurring ────────────────────────────────────────────
const createRecurring = async (req, res, next) => {
  try {
    const {
      resourceId, title, frequency, dayOfWeek, dayOfMonth,
      startTime, endTime, recurStart, recurEnd, timezone, notes,
    } = req.body;

    const resource = await Resource.findByPk(resourceId);
    if (!resource || !resource.isActive) throw new AppError('Resource not found or inactive', 404);

    const tz = timezone || req.user.timezone || 'UTC';

    const rec = await RecurringSchedule.create({
      resourceId, userId: req.user.id, title, frequency,
      dayOfWeek, dayOfMonth, startTime, endTime,
      recurStart, recurEnd, timezone: tz,
    });

    res.status(201).json({ data: rec });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/schedules/recurring ─────────────────────────────────────────────
const getRecurring = async (req, res, next) => {
  try {
    const where = req.user.role === 'user' ? { userId: req.user.id } : {};
    const recs = await RecurringSchedule.findAll({
      where,
      include: [
        { model: Resource, as: 'resource', attributes: ['id', 'name'] },
        { model: User,     as: 'user',     attributes: ['id', 'name'] },
      ],
    });
    res.json({ data: recs });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/schedules/suggestions ───────────────────────────────────────────
//
// Query params:
//   resourceId   (required) UUID
//   duration     (optional) minutes, default 60
//   date         (optional) YYYY-MM-DD to start searching from, default today
//
// Example: GET /api/schedules/suggestions?resourceId=xxx&duration=90&date=2026-06-01
//
const getSuggestions = async (req, res, next) => {
  try {
    const { resourceId, duration, date } = req.query;

    // ── Validate inputs ───────────────────────────────────────
    if (!resourceId) {
      throw new AppError('resourceId query parameter is required', 400);
    }

    const durationMins = parseInt(duration, 10) || 60;
    if (durationMins < 15 || durationMins > 480) {
      throw new AppError('duration must be between 15 and 480 minutes', 400);
    }

    // ── Confirm resource exists ───────────────────────────────
    const resource = await Resource.findByPk(resourceId);
    if (!resource || !resource.isActive) {
      throw new AppError('Resource not found or inactive', 404);
    }

    // ── Validate optional date ────────────────────────────────
    let preferredDate = null;
    if (date) {
      const parsed = DateTime.fromISO(date, { zone: 'utc' });
      if (!parsed.isValid) throw new AppError('date must be a valid YYYY-MM-DD string', 400);
      if (parsed < DateTime.utc().startOf('day')) {
        throw new AppError('date cannot be in the past', 400);
      }
      preferredDate = date;
    }

    // ── Run the suggestion engine ─────────────────────────────
    const suggestions = await generateSuggestions(
      resourceId,
      req.user.id,
      durationMins,
      preferredDate
    );

    // ── Also return resource analytics ────────────────────────
    const analytics = await getResourceAnalytics(resourceId);

    return res.json({
      meta: {
        resource: { id: resource.id, name: resource.name, location: resource.location },
        requestedDurationMins: durationMins,
        searchFromDate: preferredDate || DateTime.utc().toISODate(),
        suggestionsFound: suggestions.length,
        basedOnBookingHistoryDays: analytics.lookBackDays,
        totalHistoricalBookingsAnalysed: analytics.totalBookingsAnalysed,
      },
      suggestions,
      resourceAnalytics: analytics,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/schedules/analytics/:resourceId ──────────────────────────────────
//
// Returns full demand heatmap for a resource.
// Useful for frontend to render a visual availability chart.
//
const getAnalytics = async (req, res, next) => {
  try {
    const resource = await Resource.findByPk(req.params.resourceId);
    if (!resource || !resource.isActive) {
      throw new AppError('Resource not found or inactive', 404);
    }

    const analytics = await getResourceAnalytics(req.params.resourceId);

    return res.json({
      resource: { id: resource.id, name: resource.name },
      analytics,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getOne,
  create,
  update,
  cancel,
  createRecurring,
  getRecurring,
  getSuggestions,
  getAnalytics,
};