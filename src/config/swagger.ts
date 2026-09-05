import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AVATAR API Documentation',
      version: '1.0.0',
      description: 'API documentation for the AVATAR backend',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'accessToken',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication operations' },
      { name: 'Users', description: 'User management operations' },
    ],
    paths: {
      '/api/auth/register': {
        post: {
          summary: 'Register a new user',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password', 'role'],
                  properties: {
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    password: { type: 'string' },
                    role: { type: 'string', enum: ['CUSTOMER', 'BUSINESS', 'RIDER', 'ADMIN'] },
                    profileData: {
                      type: 'object',
                      properties: { name: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'User registered successfully' },
            '400': { description: 'Bad request' },
          },
        },
      },
      '/api/auth/login': {
        post: {
          summary: 'Login user',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Login successful',
              headers: {
                'Set-Cookie': {
                  description: 'accessToken and refreshToken cookies',
                  schema: { type: 'string' },
                },
              },
            },
            '401': { description: 'Invalid credentials' },
          },
        },
      },
      '/api/auth/logout': {
        post: {
          summary: 'Logout user',
          tags: ['Auth'],
          responses: {
            '200': { description: 'Logged out successfully' },
          },
        },
      },
      '/api/auth/otp/request': {
        post: {
          summary: 'Request an OTP',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['userId'],
                  properties: { userId: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'OTP sent successfully' },
            '400': { description: 'Bad request' },
          },
        },
      },
      '/api/users/me': {
        get: {
          summary: 'Get current user profile',
          tags: ['Users'],
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: {
            '200': { description: 'Current user profile' },
            '401': { description: 'Unauthorized' },
            '404': { description: 'User not found' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/modules/**/*.routes.ts', './src/app.ts'], // Path to the API docs
};

const swaggerSpec = swaggerJSDoc(options);

export const setupSwagger = (app: Application) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};
