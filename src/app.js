import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { CORS_ORIGINS, NODE_ENV } from './config/env.js';
import apiRouter from './routes/index.js';
import { authTimeout } from './middleware/authTimeout.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Trust reverse-proxy headers so req.ip gives the real client IP
app.set('trust proxy', true);

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (CORS_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// HTTP request logging
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));

// JSON body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use(authTimeout);
app.use('/api', apiRouter);

// 404 for unmatched routes
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;
