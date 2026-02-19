import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EnvStorageService } from './env-storage.service';

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  roles: string[];
  createdAt: number;
  updatedAt: number;
};

export type AdminRole = {
  name: string;
  permissions: string[];
};

export type CreateAdminUserInput = {
  name: string;
  email: string;
  password: string;
  active?: boolean;
  roles?: string[];
};

export type UpdateAdminUserPasswordInput = {
  password: string;
};

export type UpdateAdminUserNameInput = {
  name: string;
};

export type UpsertAdminRoleInput = {
  name?: string;
  permissions?: string[];
};

export type PermissionCatalogItem = {
  code: string;
  label: string;
  description: string;
};

@Injectable({ providedIn: 'root' })
export class AdminUserService {
  private http = inject(HttpClient);
  private env = inject(EnvStorageService);

  private get base(): string {
    const backend = this.env.getActive()?.backend || '/api/db';
    return backend.replace(/\/api\/db\/?$/i, '/api/admin');
  }

  listUsers(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${this.base}/users`);
  }

  createUser(payload: CreateAdminUserInput): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${this.base}/users`, payload);
  }

  setUserActive(id: string, active: boolean): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.base}/users/${encodeURIComponent(id)}/active`, { active });
  }

  addUserRole(id: string, role: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${this.base}/users/${encodeURIComponent(id)}/roles`, { role });
  }

  removeUserRole(id: string, role: string): Observable<AdminUser> {
    return this.http.delete<AdminUser>(`${this.base}/users/${encodeURIComponent(id)}/roles/${encodeURIComponent(role)}`);
  }

  listRoles(): Observable<AdminRole[]> {
    return this.http.get<AdminRole[]>(`${this.base}/roles`);
  }

  getRole(role: string): Observable<AdminRole> {
    return this.http.get<AdminRole>(`${this.base}/roles/${encodeURIComponent(role)}`);
  }

  createRole(payload: UpsertAdminRoleInput): Observable<AdminRole> {
    return this.http.post<AdminRole>(`${this.base}/roles`, payload);
  }

  updateRole(role: string, payload: UpsertAdminRoleInput): Observable<AdminRole> {
    return this.http.put<AdminRole>(`${this.base}/roles/${encodeURIComponent(role)}`, payload);
  }

  deleteRole(role: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/roles/${encodeURIComponent(role)}`);
  }

  listPermissions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/permissions`);
  }

  listPermissionsCatalog(): Observable<PermissionCatalogItem[]> {
    return this.http.get<PermissionCatalogItem[]>(`${this.base}/permissions/catalog`);
  }

  revokeRefreshTokens(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/users/${encodeURIComponent(id)}/revoke-refresh-tokens`, {});
  }

  updateUserPassword(id: string, payload: UpdateAdminUserPasswordInput): Observable<void> {
    return this.http.patch<void>(`${this.base}/users/${encodeURIComponent(id)}/password`, payload);
  }

  updateUserName(id: string, payload: UpdateAdminUserNameInput): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.base}/users/${encodeURIComponent(id)}/name`, payload);
  }
}
