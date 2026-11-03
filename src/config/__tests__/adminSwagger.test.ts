import { adminSwaggerSpec, setupAdminSwagger } from '../adminSwagger';
import express from 'express';

describe('Admin Swagger Configuration & API Documentation', () => {
  const spec = adminSwaggerSpec as any;

  it('should have valid OpenAPI 3.0.0 specification metadata', () => {
    expect(spec).toBeDefined();
    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info.title).toBe('AVATAR Admin Console API Documentation');
    expect(spec.info.version).toBe('1.0.0');
  });

  it('should configure admin-specific security schemes', () => {
    const securitySchemes = spec.components?.securitySchemes;
    expect(securitySchemes).toBeDefined();
    expect(securitySchemes?.adminBearerAuth).toBeDefined();
    expect(securitySchemes?.adminCookieAuth).toBeDefined();
    expect(securitySchemes?.adminRefreshToken).toBeDefined();
  });

  it('should define all key schemas for admin responses and data models', () => {
    const schemas = spec.components?.schemas;
    expect(schemas).toBeDefined();
    expect(schemas?.StandardSuccessResponse).toBeDefined();
    expect(schemas?.StandardErrorResponse).toBeDefined();
    expect(schemas?.AdminUser).toBeDefined();
    expect(schemas?.ApprovalRequest).toBeDefined();
    expect(schemas?.PlatformSetting).toBeDefined();
    expect(schemas?.AuditLog).toBeDefined();
  });

  it('should include all required Admin tags', () => {
    const tags = spec.tags?.map((t: any) => t.name);
    expect(tags).toContain('Admin Auth');
    expect(tags).toContain('Admin Staff Management');
    expect(tags).toContain('Admin Approvals');
    expect(tags).toContain('Admin Users');
    expect(tags).toContain('Admin Businesses');
    expect(tags).toContain('Admin Riders');
    expect(tags).toContain('Admin Orders');
    expect(tags).toContain('Admin Platform Settings');
    expect(tags).toContain('Admin Audit Logs');
    expect(tags).toContain('Admin Dashboard');
  });

  it('should document all authentication and staff management endpoints', () => {
    const paths = spec.paths;
    expect(paths['/auth/login']).toBeDefined();
    expect(paths['/auth/login'].post).toBeDefined();
    expect(paths['/auth/mfa/verify'].post).toBeDefined();
    expect(paths['/auth/refresh'].post).toBeDefined();
    expect(paths['/auth/logout'].post).toBeDefined();
    expect(paths['/auth/me'].get).toBeDefined();
    expect(paths['/admins'].get).toBeDefined();
    expect(paths['/admins/invitations'].post).toBeDefined();
    expect(paths['/admins/{id}/role'].patch).toBeDefined();
    expect(paths['/admins/{id}/deactivate'].post).toBeDefined();
  });

  it('should document approval maker-checker endpoints', () => {
    const paths = spec.paths;
    expect(paths['/approvals'].get).toBeDefined();
    expect(paths['/approvals/{id}/decide'].post).toBeDefined();
  });

  it('should document entity oversight, settings, audit, and dashboard endpoints', () => {
    const paths = spec.paths;
    expect(paths['/users'].get).toBeDefined();
    expect(paths['/users/{id}'].delete).toBeDefined();
    expect(paths['/businesses/{id}/approve'].post).toBeDefined();
    expect(paths['/riders/{id}/approve'].post).toBeDefined();
    expect(paths['/orders/{id}/override-status'].post).toBeDefined();
    expect(paths['/settings'].get).toBeDefined();
    expect(paths['/settings/{key}'].put).toBeDefined();
    expect(paths['/audit-logs'].get).toBeDefined();
    expect(paths['/dashboard'].get).toBeDefined();
  });

  it('should register routes on the express application in setupAdminSwagger', () => {
    const mockApp = {
      use: jest.fn(),
      get: jest.fn(),
    } as unknown as express.Application;

    setupAdminSwagger(mockApp);

    expect(mockApp.use).toHaveBeenCalledWith(
      '/api-docs/admin',
      expect.anything(),
      expect.anything(),
    );
    expect(mockApp.use).toHaveBeenCalledWith(
      '/api/v1/admin/docs',
      expect.anything(),
      expect.anything(),
    );
    expect(mockApp.get).toHaveBeenCalledWith(
      '/api/v1/admin/docs.json',
      expect.any(Function),
    );
  });
});
