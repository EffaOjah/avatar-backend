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
          summary: 'Request an OTP via Email',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: { email: { type: 'string' } },
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
      '/api/auth/otp/verify': {
        post: {
          summary: 'Verify OTP code',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'code'],
                  properties: {
                    email: { type: 'string' },
                    code: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'OTP verified successfully' },
            '400': { description: 'Bad request' },
          },
        },
      },
      '/api/auth/forgot-password': {
        post: {
          summary: 'Request a password reset link',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: { email: { type: 'string', format: 'email' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Reset link sent (always returns success to prevent user enumeration)' },
            '400': { description: 'Bad request' },
          },
        },
      },
      '/api/auth/reset-password': {
        post: {
          summary: 'Reset password using token from email',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'newPassword'],
                  properties: {
                    token: { type: 'string', description: 'Token received in the reset email link' },
                    newPassword: { type: 'string', minLength: 6 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Password reset successfully' },
            '400': { description: 'Invalid or expired token' },
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
        put: {
          summary: 'Update current user profile',
          tags: ['Users'],
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    phone: { type: 'string' },
                    business: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        description: { type: 'string' },
                        logoUrl: { type: 'string' },
                        coverImageUrl: { type: 'string' },
                        address: { type: 'string' },
                        locationLat: { type: 'number' },
                        locationLng: { type: 'number' },
                      },
                    },
                    rider: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Profile updated successfully' },
            '400': { description: 'Bad request' },
            '401': { description: 'Unauthorized' },
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
