'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BookingHistory = sequelize.define(
  'BookingHistory',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    scheduleId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    changedBy: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false, // 'created', 'cancelled', 'updated'
    },
    oldStatus: {
      type: DataTypes.ENUM('confirmed', 'cancelled', 'pending'),
      allowNull: true,
    },
    newStatus: {
      type: DataTypes.ENUM('confirmed', 'cancelled', 'pending'),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
    },
  },
  {
    tableName: 'booking_history',
    underscored: true,
    updatedAt: false, // history is append-only
  }
);

module.exports = BookingHistory;