'use strict';

const User             = require('./User');
const Resource         = require('./Resource');
const Schedule         = require('./Schedule');
const RecurringSchedule = require('./RecurringSchedule');
const BookingHistory   = require('./BookingHistory');

// ── Associations ──────────────────────────────────────────
User.hasMany(Resource,          { foreignKey: 'createdBy',  as: 'createdResources' });
Resource.belongsTo(User,        { foreignKey: 'createdBy',  as: 'creator' });

User.hasMany(Schedule,          { foreignKey: 'userId',     as: 'schedules' });
Schedule.belongsTo(User,        { foreignKey: 'userId',     as: 'user' });

Resource.hasMany(Schedule,      { foreignKey: 'resourceId', as: 'schedules' });
Schedule.belongsTo(Resource,    { foreignKey: 'resourceId', as: 'resource' });

User.hasMany(RecurringSchedule, { foreignKey: 'userId',     as: 'recurringSchedules' });
RecurringSchedule.belongsTo(User,     { foreignKey: 'userId',     as: 'user' });

Resource.hasMany(RecurringSchedule,   { foreignKey: 'resourceId', as: 'recurringSchedules' });
RecurringSchedule.belongsTo(Resource, { foreignKey: 'resourceId', as: 'resource' });

Schedule.belongsTo(RecurringSchedule, { foreignKey: 'recurringScheduleId', as: 'recurringSchedule' });
RecurringSchedule.hasMany(Schedule,   { foreignKey: 'recurringScheduleId', as: 'schedules' });

Schedule.hasMany(BookingHistory,      { foreignKey: 'scheduleId', as: 'history' });
BookingHistory.belongsTo(Schedule,    { foreignKey: 'scheduleId', as: 'schedule' });

User.hasMany(BookingHistory,          { foreignKey: 'changedBy',  as: 'auditLog' });
BookingHistory.belongsTo(User,        { foreignKey: 'changedBy',  as: 'changedByUser' });

module.exports = { User, Resource, Schedule, RecurringSchedule, BookingHistory };