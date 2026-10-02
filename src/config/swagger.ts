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
      { name: 'Categories', description: 'Product category operations' },
      { name: 'Products', description: 'Product catalog operations' },
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
      '/api/users/become-business': {
        post: {
          summary: 'Upgrade account to a business account',
          tags: ['Users'],
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', description: 'Name of the business' },
                    description: { type: 'string' },
                    address: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Successfully converted to a business account' },
            '400': { description: 'Bad request or user already has a business' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/users/me/avatar': {
        post: {
          summary: 'Upload user avatar',
          tags: ['Users'],
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: { type: 'object', properties: { avatar: { type: 'string', format: 'binary' } } },
              },
            },
          },
          responses: { '200': { description: 'Avatar uploaded successfully' }, '400': { description: 'Bad request' }, '401': { description: 'Unauthorized' } },
        },
      },
      '/api/users/business/logo': {
        post: {
          summary: 'Upload business logo',
          tags: ['Users'],
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } },
              },
            },
          },
          responses: { '200': { description: 'Logo uploaded successfully' }, '400': { description: 'Bad request' }, '401': { description: 'Unauthorized' } },
        },
      },
      '/api/users/business/cover': {
        post: {
          summary: 'Upload business cover image',
          tags: ['Users'],
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: { type: 'object', properties: { cover: { type: 'string', format: 'binary' } } },
              },
            },
          },
          responses: { '200': { description: 'Cover uploaded successfully' }, '400': { description: 'Bad request' }, '401': { description: 'Unauthorized' } },
        },
      },
      '/api/categories': {
        get: {
          summary: 'List all active categories',
          tags: ['Categories'],
          responses: {
            '200': { description: 'List of categories' },
          },
        },
        post: {
          summary: 'Create a new category (Admin only)',
          tags: ['Categories'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    imageUrl: { type: 'string', format: 'uri' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Category created successfully' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden – Admin only' },
          },
        },
      },
      '/api/categories/{id}/image': {
        post: {
          summary: 'Upload category image (Admin only)',
          tags: ['Categories'],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Category ID' }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } },
              },
            },
          },
          responses: { '200': { description: 'Category image uploaded' }, '400': { description: 'Bad request' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/products': {
        get: {
          summary: 'List all products (with optional filters)',
          tags: ['Products'],
          parameters: [
            { in: 'query', name: 'businessId', schema: { type: 'string' }, description: 'Filter by business ID' },
            { in: 'query', name: 'categoryId', schema: { type: 'string' }, description: 'Filter by category ID' },
          ],
          responses: {
            '200': { description: 'List of products' },
          },
        },
        post: {
          summary: 'Create a new product (Business only)',
          tags: ['Products'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['categoryId', 'name', 'price'],
                  properties: {
                    categoryId: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    price: { type: 'number' },
                    inventory: { type: 'integer', default: 0 },
                    variants: { type: 'array', items: { type: 'object' } },
                    isAvailable: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Product created successfully' },
            '400': { description: 'Bad request' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden – Business only' },
          },
        },
      },
      '/api/products/{id}': {
        get: {
          summary: 'Get a single product by ID',
          tags: ['Products'],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Product details' },
            '404': { description: 'Product not found' },
          },
        },
        put: {
          summary: 'Update a product (Business only, must be owner)',
          tags: ['Products'],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    categoryId: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    price: { type: 'number' },
                    inventory: { type: 'integer' },
                    variants: { type: 'array', items: { type: 'object' } },
                    isAvailable: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Product updated successfully' },
            '400': { description: 'Bad request or ownership error' },
            '401': { description: 'Unauthorized' },
          },
        },
        delete: {
          summary: 'Delete a product (soft delete, Business only)',
          tags: ['Products'],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Product deleted successfully' },
            '400': { description: 'Bad request or ownership error' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/products/{id}/images': {
        post: {
          summary: 'Upload product images (Business only, must be owner)',
          tags: ['Products'],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    images: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'Up to 5 images' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Images uploaded successfully' }, '400': { description: 'Bad request' }, '401': { description: 'Unauthorized' } },
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
