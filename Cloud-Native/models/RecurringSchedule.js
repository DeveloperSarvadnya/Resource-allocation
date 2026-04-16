'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RecurringSchedule = sequelize.define(
  'RecurringSchedule',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    resourceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    frequency: {
      type: DataTypes.ENUM('daily', 'weekly', 'monthly'),
      allowNull: false,
    },
    dayOfWeek: {
      type: DataTypes.SMALLINT,
      allowNull: true, // 0-6, used for weekly
    },
    dayOfMonth: {
      type: DataTypes.SMALLINT,
      allowNull: true, // 1-31, used for monthly
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    recurStart: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    recurEnd: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    timezone: {
      type: DataTypes.STRING(80),
      defaultValue: 'UTC',
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
  },
  {
    tableName: 'recurring_schedules',
    underscored: true,
  }
);

module.exports = RecurringSchedule;