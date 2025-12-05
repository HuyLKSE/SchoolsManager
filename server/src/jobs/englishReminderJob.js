import EnglishReminder from '../models/english/Reminder.js';
import { User } from '../models/User.js';
import { sendPushToUser } from '../services/english/push.service.js';
import logger from '../config/logger.js';

function getLocalHour(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone || 'Asia/Ho_Chi_Minh'
    }).formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');
    return hourPart ? parseInt(hourPart.value, 10) : date.getHours();
  } catch (err) {
    logger.warn(`Invalid timezone (${timezone}), falling back to server time`);
    return date.getHours();
  }
}

/**
 * Register Agenda job to send English study reminders.
 */
export function defineEnglishReminderJob(agenda) {
  agenda.define('english-send-reminders', { concurrency: 3 }, async () => {
    const now = new Date();

    const reminders = await EnglishReminder.find({ active: true }).lean();
    if (!reminders.length) {
      return;
    }

    for (const reminder of reminders) {
      try {
        const user = await User.findById(reminder.userId)
          .select('englishProfile fullName email');
        if (!user) continue;

        const timezone = user.englishProfile?.timezone || 'Asia/Ho_Chi_Minh';
        const localHour = getLocalHour(now, timezone);
        if (localHour !== reminder.hourLocal) continue;

        await sendPushToUser(reminder.userId.toString(), {
          title: 'Time to practice English 🇬🇧',
          body: 'Keep your streak alive. Open the app to review today’s items.',
          url: '/english/dashboard'
        });

        logger.info(`Sent English reminder to user ${reminder.userId} (${timezone})`);
      } catch (err) {
        logger.error('Failed to process reminder', err);
      }
    }
  });
}
