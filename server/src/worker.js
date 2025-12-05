import logger from './config/logger.js';
import { connectDB, disconnectDB } from './config/database.js';
import createAgenda from './jobs/agenda.js';

async function startWorker() {
  try {
    await connectDB();
    const agenda = await createAgenda();

    const shutdown = async () => {
      logger.warn('Worker shutting down...');
      await agenda.stop().catch((err) => logger.error('Agenda stop error', err));
      await disconnectDB().catch((err) => logger.error('DB disconnect error', err));
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    logger.info('Worker started successfully');
  } catch (error) {
    logger.error('Worker startup failed', error);
    await disconnectDB().catch(() => {});
    process.exit(1);
  }
}

startWorker();
