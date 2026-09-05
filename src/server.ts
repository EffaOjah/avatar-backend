import 'dotenv/config';
import app from './app';
import prisma from './database/prisma';
import logger from './utils/logger';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Initialize Database Connection (Prisma)
    await prisma.$connect();
    logger.info('Database connection successfully established.');

    // TODO: Initialize Redis Connection
    // TODO: Initialize Background Jobs (BullMQ)

    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
