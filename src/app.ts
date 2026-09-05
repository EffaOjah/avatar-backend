import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { globalRateLimiter } from './middlewares/rateLimiter';
import requestLogger from './middlewares/requestLogger';
import { errorHandler } from './middlewares/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import { setupSwagger } from './config/swagger';

const app: Application = express();

// Security Middlewares
app.use(helmet());
app.use(cors());
app.use(globalRateLimiter);

// Request Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging Middleware
app.use(requestLogger);

// Setup Swagger UI
setupSwagger(app);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);

// Health check endpoint
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health Check
 *     description: Returns the health status of the API
 *     responses:
 *       200:
 *         description: OK
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ready check endpoint
app.get('/ready', (req: Request, res: Response) => {
  // TODO: Add database and redis readiness checks here
  res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use(errorHandler);

export default app;
