'use strict';

const { Resource, User } = require('../models');
const AppError = require('../utils/AppError');


const getAll = async (req, res, next) => {
  try {
    const resources = await Resource.findAll({
      include: [{ model: User, as: 'creator', attributes: ['id', 'name', 'email'] }],
      where: req.user.role !== 'admin' ? { isActive: true } : {},
      order: [['createdAt', 'DESC']],
    });
    res.json({ data: resources });
  } catch (err) {
    next(err);
  }
};


const getOne = async (req, res, next) => {
  try {
    const resource = await Resource.findByPk(req.params.id, {
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
    });
    if (!resource) throw new AppError('Resource not found', 404);
    res.json({ data: resource });
  } catch (err) {
    next(err);
  }
};

// POST /api/resources  (admin only)
const create = async (req, res, next) => {
  try {
    const { name, description, capacity, location } = req.body;
    const resource = await Resource.create({
      name,
      description,
      capacity,
      location,
      createdBy: req.user.id,
    });
    res.status(201).json({ data: resource });
  } catch (err) {
    next(err);
  }
};

// PUT /api/resources/:id  (admin only)
const update = async (req, res, next) => {
  try {
    const resource = await Resource.findByPk(req.params.id);
    if (!resource) throw new AppError('Resource not found', 404);

    const { name, description, capacity, location, isActive } = req.body;
    await resource.update({ name, description, capacity, location, isActive });
    res.json({ data: resource });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/resources/:id  (admin only — soft delete via isActive)
const remove = async (req, res, next) => {
  try {
    const resource = await Resource.findByPk(req.params.id);
    if (!resource) throw new AppError('Resource not found', 404);

    await resource.update({ isActive: false });
    res.json({ message: 'Resource deactivated' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, remove };