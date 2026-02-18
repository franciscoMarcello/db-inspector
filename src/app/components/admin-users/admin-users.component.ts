import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AdminRole, AdminUser, AdminUserService } from '../../services/admin-user.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.component.html',
  styleUrls: ['./admin-users.component.css'],
})
export class AdminUsersComponent implements OnInit {
  private api = inject(AdminUserService);

  loading = false;
  saving = false;
  error = '';
  status = '';

  users: AdminUser[] = [];
  roles: AdminRole[] = [];
  permissions: string[] = [];
  roleToAddByUser: Record<string, string> = {};
  roleSaving = false;
  roleEditorOpen = false;
  roleEditorMode: 'create' | 'edit' = 'create';
  roleForm = {
    originalName: '',
    name: '',
    permissions: new Set<string>(),
  };

  createForm = {
    email: '',
    password: '',
    active: true,
    roles: new Set<string>(['USER']),
  };

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll() {
    this.loading = true;
    this.error = '';
    forkJoin({
      users: this.api.listUsers(),
      roles: this.api.listRoles(),
      permissions: this.api.listPermissions(),
    }).subscribe({
      next: ({ users, roles, permissions }) => {
        this.loading = false;
        this.users = [...(users || [])].sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: 'base' }));
        this.roles = roles || [];
        this.permissions = permissions || [];
      },
      error: (err) => {
        this.loading = false;
        this.error = this.messageFromError(err, 'Falha ao carregar administração de usuários.');
      },
    });
  }

  availableRoleNames(): string[] {
    return this.roles.map((r) => r.name);
  }

  isSystemRole(roleName: string): boolean {
    const value = String(roleName || '').toUpperCase();
    return value === 'ADMIN' || value === 'USER';
  }

  toggleCreateRole(role: string, checked: boolean) {
    if (checked) this.createForm.roles.add(role);
    else this.createForm.roles.delete(role);
  }

  createUser() {
    const email = this.createForm.email.trim();
    const password = this.createForm.password;
    if (!email || !password) {
      this.error = 'Informe e-mail e senha para criar usuário.';
      return;
    }

    const selectedRoles = Array.from(this.createForm.roles);
    this.saving = true;
    this.error = '';
    this.api
      .createUser({
        email,
        password,
        active: this.createForm.active,
        roles: selectedRoles.length ? selectedRoles : ['USER'],
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.status = `Usuário "${email}" criado.`;
          this.createForm.email = '';
          this.createForm.password = '';
          this.createForm.active = true;
          this.createForm.roles = new Set<string>(['USER']);
          this.loadUsers();
        },
        error: (err) => {
          this.saving = false;
          this.error = this.messageFromError(err, 'Falha ao criar usuário.');
        },
      });
  }

  setUserActive(user: AdminUser, active: boolean) {
    this.api.setUserActive(user.id, active).subscribe({
      next: (updated) => {
        this.patchUser(updated);
        this.status = `Usuário "${updated.email}" ${updated.active ? 'ativado' : 'desativado'}.`;
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao alterar status do usuário.');
      },
    });
  }

  addRole(user: AdminUser) {
    const role = (this.roleToAddByUser[user.id] || '').trim();
    if (!role) return;
    this.api.addUserRole(user.id, role).subscribe({
      next: (updated) => {
        this.patchUser(updated);
        this.roleToAddByUser[user.id] = '';
        this.status = `Role "${role}" adicionada para ${updated.email}.`;
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao adicionar role.');
      },
    });
  }

  removeRole(user: AdminUser, role: string) {
    this.api.removeUserRole(user.id, role).subscribe({
      next: (updated) => {
        this.patchUser(updated);
        this.status = `Role "${role}" removida de ${updated.email}.`;
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao remover role.');
      },
    });
  }

  revokeRefreshTokens(user: AdminUser) {
    this.api.revokeRefreshTokens(user.id).subscribe({
      next: () => {
        this.status = `Refresh tokens revogados para ${user.email}.`;
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao revogar refresh tokens.');
      },
    });
  }

  trackUser = (_: number, u: AdminUser) => u.id;
  trackRole = (_: number, r: AdminRole) => r.name;
  trackPermission = (_: number, p: string) => p;

  startCreateRole() {
    this.error = '';
    this.status = '';
    this.roleEditorOpen = true;
    this.roleEditorMode = 'create';
    this.roleForm = {
      originalName: '',
      name: '',
      permissions: new Set<string>(),
    };
  }

  startEditRole(roleName: string) {
    this.error = '';
    this.status = '';
    this.api.getRole(roleName).subscribe({
      next: (role) => {
        this.roleEditorOpen = true;
        this.roleEditorMode = 'edit';
        this.roleForm = {
          originalName: role.name,
          name: role.name,
          permissions: new Set<string>(role.permissions || []),
        };
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao carregar role.');
      },
    });
  }

  cancelRoleEditor() {
    this.roleEditorOpen = false;
  }

  toggleRolePermission(permission: string, checked: boolean) {
    if (checked) this.roleForm.permissions.add(permission);
    else this.roleForm.permissions.delete(permission);
  }

  saveRole() {
    const name = this.roleForm.name.trim();
    if (!name) {
      this.error = 'Informe o nome da role.';
      return;
    }

    const payload = {
      name,
      permissions: Array.from(this.roleForm.permissions),
    };

    this.roleSaving = true;
    this.error = '';
    this.status = '';

    const req =
      this.roleEditorMode === 'create'
        ? this.api.createRole(payload)
        : this.api.updateRole(this.roleForm.originalName, payload);

    req.subscribe({
      next: (saved) => {
        this.roleSaving = false;
        this.roleEditorOpen = false;
        this.status =
          this.roleEditorMode === 'create'
            ? `Role "${saved.name}" criada.`
            : `Role "${saved.name}" atualizada.`;
        this.loadAll();
      },
      error: (err) => {
        this.roleSaving = false;
        this.error = this.messageFromError(err, 'Falha ao salvar role.');
      },
    });
  }

  deleteRole(roleName: string) {
    if (this.isSystemRole(roleName)) return;
    if (!confirm(`Excluir role "${roleName}"?`)) return;
    this.api.deleteRole(roleName).subscribe({
      next: () => {
        this.status = `Role "${roleName}" excluída.`;
        this.loadAll();
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao excluir role.');
      },
    });
  }

  private loadUsers() {
    this.api.listUsers().subscribe({
      next: (users) => {
        this.users = [...(users || [])].sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: 'base' }));
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao recarregar usuários.');
      },
    });
  }

  private patchUser(updated: AdminUser) {
    this.users = this.users.map((u) => (u.id === updated.id ? updated : u));
  }

  private messageFromError(err: any, fallback: string): string {
    return (
      err?.error?.message ||
      err?.error?.error ||
      (typeof err?.error === 'string' ? err.error : '') ||
      fallback
    );
  }
}
