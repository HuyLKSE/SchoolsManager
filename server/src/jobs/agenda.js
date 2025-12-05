import Agenda from 'agenda';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { defineEnglishReminderJob } from './englishReminderJob.js';

/**
 * Initialize Agenda instance and register background jobs.
 */
export default async function createAgenda() {
  const agenda = new Agenda({
    db: { address: config.mongoUri, collection: 'agenda_jobs' },
    processEvery: '1 minute',
    defaultConcurrency: 5
  });

  defineEnglishReminderJob(agenda);

  await agenda.start();

  // Ensure the reminder job is scheduled; avoid duplicates if already present
  const existing = await agenda.jobs({ name: 'english-send-reminders' });
  if (!existing.length) {
    await agenda.every('1 hour', 'english-send-reminders');
  }

  logger.info('Agenda started and English reminder job scheduled');
  return agenda;
}
