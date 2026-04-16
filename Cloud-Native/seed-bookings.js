'use strict';

/**
 * seed-bookings.js
 *
 * Generates realistic past bookings for the last 15 days across ALL resources.
 *
 * Distribution pattern:
 *   - 7am–9am   : LOW frequency (1-2 bookings/day)  → early morning, sparse
 *   - 9am–11am  : HIGH frequency (3-5 bookings/day) → peak morning rush
 *   - 11am–1pm  : MEDIUM frequency (2-3/day)        → midday
 *   - 2pm–4pm   : HIGH frequency (3-5/day)          → peak afternoon
 *   - 4pm–6pm   : MEDIUM frequency (2-3/day)        → late afternoon
 *   - 6pm–10pm  : LOW-MEDIUM (1-2/day)              → evening wind-down
 *   - 10pm–12am : ONLY Mon-Thu, LOW (0-1/day)       → late night, sparse
 *   - 12am–7am  : ZERO bookings                     → no overnight slots
 *
 * Run:  node seed-bookings.js
 */

require('dotenv').config();

const sequelize = require('./config/database');
const { Schedule, Resource, User, BookingHistory } = require('./models');
const { DateTime } = require('luxon');

// ── Slot templates with weights (higher = more frequent) ─────
const SLOT_TEMPLATES = [
  // Early morning — LOW
  { startHour: 7,  startMin: 0,  durationMins: 60,  weight: 1, label: 'Early Morning Session' },
  { startHour: 7,  startMin: 30, durationMins: 60,  weight: 1, label: 'Dawn Lab Prep' },
  { startHour: 8,  startMin: 0,  durationMins: 60,  weight: 2, label: 'Morning Standup' },
  { startHour: 8,  startMin: 30, durationMins: 30,  weight: 1, label: 'Quick Sync' },

  // Peak morning — HIGH
  { startHour: 9,  startMin: 0,  durationMins: 60,  weight: 5, label: 'Sprint Planning' },
  { startHour: 9,  startMin: 0,  durationMins: 120, weight: 4, label: 'Workshop Session' },
  { startHour: 9,  startMin: 30, durationMins: 60,  weight: 5, label: 'Team Sync' },
  { startHour: 10, startMin: 0,  durationMins: 60,  weight: 5, label: 'Design Review' },
  { startHour: 10, startMin: 0,  durationMins: 90,  weight: 4, label: 'Architecture Discussion' },
  { startHour: 10, startMin: 30, durationMins: 60,  weight: 4, label: 'Code Review Session' },

  // Midday — MEDIUM
  { startHour: 11, startMin: 0,  durationMins: 60,  weight: 3, label: 'Late Morning Meeting' },
  { startHour: 11, startMin: 30, durationMins: 60,  weight: 2, label: 'Pre-Lunch Review' },
  { startHour: 12, startMin: 0,  durationMins: 60,  weight: 2, label: 'Lunch & Learn' },
  { startHour: 12, startMin: 30, durationMins: 30,  weight: 2, label: 'Quick Check-in' },

  // Peak afternoon — HIGH
  { startHour: 14, startMin: 0,  durationMins: 60,  weight: 5, label: 'Afternoon Sprint' },
  { startHour: 14, startMin: 0,  durationMins: 120, weight: 4, label: 'Lab Practical' },
  { startHour: 14, startMin: 30, durationMins: 90,  weight: 5, label: 'Project Review' },
  { startHour: 15, startMin: 0,  durationMins: 60,  weight: 5, label: 'Client Call' },
  { startHour: 15, startMin: 30, durationMins: 60,  weight: 4, label: 'Demo Prep' },

  // Late afternoon — MEDIUM
  { startHour: 16, startMin: 0,  durationMins: 60,  weight: 3, label: 'Retrospective' },
  { startHour: 16, startMin: 30, durationMins: 60,  weight: 2, label: 'End-of-Day Sync' },
  { startHour: 17, startMin: 0,  durationMins: 60,  weight: 3, label: 'Extended Workshop' },
  { startHour: 17, startMin: 30, durationMins: 30,  weight: 2, label: 'Quick Wrap-up' },

  // Evening — LOW-MEDIUM
  { startHour: 18, startMin: 0,  durationMins: 60,  weight: 2, label: 'Evening Study Group' },
  { startHour: 18, startMin: 30, durationMins: 60,  weight: 1, label: 'Late Lab Session' },
  { startHour: 19, startMin: 0,  durationMins: 60,  weight: 2, label: 'Evening Review' },
  { startHour: 19, startMin: 30, durationMins: 60,  weight: 1, label: 'Extra Practice' },
  { startHour: 20, startMin: 0,  durationMins: 60,  weight: 1, label: 'Night Session' },
  { startHour: 20, startMin: 30, durationMins: 60,  weight: 1, label: 'Late Project Work' },
  { startHour: 21, startMin: 0,  durationMins: 60,  weight: 1, label: 'Evening Collab' },

  // Late night (Mon-Thu ONLY) — LOW
  { startHour: 22, startMin: 0,  durationMins: 60,  weight: 1, label: 'Late Night Crunch', lateNight: true },
  { startHour: 22, startMin: 30, durationMins: 60,  weight: 1, label: 'Midnight Prep', lateNight: true },
  { startHour: 23, startMin: 0,  durationMins: 55,  weight: 1, label: 'Last Minute Review', lateNight: true },
];

// ── Helpers ───────────────────────────────────────────────────
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(templates) {
  const total = templates.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of templates) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return templates[templates.length - 1];
}

function overlaps(existing, newStart, newEnd) {
  return existing.some(([s, e]) => newStart < e && newEnd > s);
}

// ── Main ──────────────────────────────────────────────────────
async function seed() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Fetch all resources and users
    const resources = await Resource.findAll({ where: { isActive: true } });
    const users = await User.findAll();

    if (resources.length === 0) {
      console.log('❌ No active resources found. Create some resources first.');
      process.exit(1);
    }
    if (users.length === 0) {
      console.log('❌ No users found. Register at least one user first.');
      process.exit(1);
    }

    console.log(`📦 Found ${resources.length} resource(s) and ${users.length} user(s)`);
    console.log(`📅 Seeding bookings for the past 15 days...\n`);

    const now = DateTime.utc();
    let totalCreated = 0;

    for (const resource of resources) {
      console.log(`  🏢 Resource: ${resource.name}`);
      let resourceCount = 0;

      for (let daysAgo = 1; daysAgo <= 15; daysAgo++) {
        const day = now.minus({ days: daysAgo }).startOf('day');
        const dayOfWeek = day.weekday; // 1=Mon … 7=Sun

        // Determine how many bookings for this day
        // Weekdays: more bookings; Weekends: fewer
        const isWeekend = dayOfWeek >= 6;
        const baseSlotsCount = isWeekend ? rand(2, 5) : rand(5, 10);

        // Filter templates: remove lateNight on Fri/Sat/Sun
        const isLateNightAllowed = dayOfWeek >= 1 && dayOfWeek <= 4; // Mon-Thu
        const availableTemplates = SLOT_TEMPLATES.filter(t => {
          if (t.lateNight && !isLateNightAllowed) return false;
          return true;
        });

        // Track booked time ranges for this resource+day to avoid overlaps
        const bookedSlots = [];

        for (let i = 0; i < baseSlotsCount; i++) {
          const template = weightedPick(availableTemplates);

          // Compute start/end in UTC
          const startDT = day.set({
            hour: template.startHour,
            minute: template.startMin,
            second: 0,
            millisecond: 0
          });
          const endDT = startDT.plus({ minutes: template.durationMins });

          const startUTC = startDT.toJSDate();
          const endUTC = endDT.toJSDate();

          // Skip if overlaps with already-seeded slot on this resource+day
          if (overlaps(bookedSlots, startUTC, endUTC)) continue;

          // Pick a random user
          const user = pick(users);

          // Vary the title slightly
          const titleSuffix = rand(1, 99);
          const title = `${template.label} #${titleSuffix}`;

          try {
            const schedule = await Schedule.create({
              resourceId: resource.id,
              userId: user.id,
              title,
              startTime: startUTC,
              endTime: endUTC,
              status: 'confirmed',
              notes: `Auto-seeded booking (${daysAgo} days ago)`,
            });

            await BookingHistory.create({
              scheduleId: schedule.id,
              changedBy: user.id,
              action: 'created',
              newStatus: 'confirmed',
              notes: 'Seeded by seed-bookings.js',
            });

            bookedSlots.push([startUTC, endUTC]);
            resourceCount++;
            totalCreated++;
          } catch (err) {
            // Skip duplicates or constraint violations silently
          }
        }
      }

      console.log(`     → Created ${resourceCount} bookings\n`);
    }

    console.log(`\n🎉 Done! Total bookings seeded: ${totalCreated}`);
    console.log(`\n📊 Your heatmap and smart recommendations should now show rich data.`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
