const express = require('express');
const { body, validationResult } = require('express-validator');
const Task = require('../models/Task');
const redisClient = require('../config/redis');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const cachedTasks = await redisClient.get('tasks');
    if (cachedTasks) {
      return res.json(JSON.parse(cachedTasks));
    }

    const tasks = await Task.find();
    await redisClient.set('tasks', JSON.stringify(tasks), {
      EX: 3600,
    });

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

router.post(
  '/',
  auth,
  [
    body('title')
      .trim() // Remove whitespace from both ends
      .escape() // Escape special characters to avoid code injection
      .notEmpty().withMessage('Title cannot be empty')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const task = new Task(req.body);
      await task.save();

      await redisClient.del('tasks');
      res.status(201).json(task);
    } catch (err) {
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

router.put(
  '/:id',
  [
    body('status')
      .optional()
      .trim() // Remove whitespace from both ends
      .isIn(['pending', 'complete'])
      .withMessage('Status must be either "pending" or "complete"')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const task = await Task.findById(req.params.id);
      if (!task) {
        return res.status(404).json({ msg: 'Task not found' });
      }

      task.status = req.body.status || task.status;
      await task.save();

      await redisClient.del('tasks');
      res.json(task);
    } catch (err) {
      res.status(500).json({ msg: 'Server error' });
    }
  }
);

router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ msg: 'Task not found' });
    }

    await redisClient.del('tasks');
    res.json({ msg: 'Task removed' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
