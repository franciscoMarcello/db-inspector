import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { MultiSelectOption, ReportsMultiSelectComponent } from '../reports/controls/multi-select/reports-multi-select.component';
import { AppButtonComponent } from '../shared/app-button/app-button.component';
import { AdminUsersPermissionsAclComponent } from './permissions-acl/admin-users-permissions-acl.component';
import { AuthService } from '../../services/auth.service';
import { AdminRole, AdminUser, AdminUserService } from '../../services/admin-user.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ReportsMultiSelectComponent, AppButtonComponent, AdminUsersPermissionsAclComponent],
  templateUrl: './admin-users.component.html',
  styleUrls: ['./admin-users.component.css'],
})
export class AdminUsersComponent implements OnInit {
  readonly passwordRuleMessage =
    'Senha deve ter no minimo 10 caracteres, incluindo letra maiuscula, letra minuscula, numero e caractere especial, sem espacos';

  private api = inject(AdminUserService);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  loading = false;
  saving = false;
  error = '';
  status = '';
  userSearchTerm = '';
  userStatusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';
  userProfileFilters: string[] = [];
  userSortField: 'name' | 'email' | 'status' | 'createdAt' | 'updatedAt' = 'updatedAt';
  userSortDirection: 'asc' | 'desc' = 'desc';
  selectedUserIds = new Set<string>();
  userRowMenuId: string | null = null;
  bulkUsersLoading = false;
  usersLastUpdatedAt: Date | null = null;
  bulkTargetRole = '';

  users: AdminUser[] = [];
  roles: AdminRole[] = [];

  createUserModalOpen = false;
  editUserModalOpen = false;
  editUserSaving = false;
  editUserRoleSelection: string[] = [];
  editUserDraft: {
    id: string;
    name: string;
    originalName: string;
    email: string;
    active: boolean;
    originalActive: boolean;
    roles: Set<string>;
    originalRoles: Set<string>;
  } | null = null;

  passwordModalOpen = false;
  passwordModalSaving = false;
  passwordModalValue = '';
  passwordModalUser: AdminUser | null = null;

  adminSection: 'USERS' | 'PERMISSIONS' = 'USERS';

  createForm = {
    name: '',
    email: '',
    password: '',
    active: true,
    roles: new Set<string>(),
  };

  get anyModalOpen(): boolean {
    return this.createUserModalOpen || this.editUserModalOpen || this.passwordModalOpen;
  }

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      const section = String(data?.['adminSection'] || 'USERS').toUpperCase();
      this.adminSection = section === 'PERMISSIONS' ? 'PERMISSIONS' : 'USERS';
    });
    this.loadAll();
  }

  loadAll() {
    this.loading = true;
    this.error = '';
    this.closeUserRowMenu();

    forkJoin({
      users: this.api.listUsers(),
      roles: this.api.listRoles(),
    }).subscribe({
      next: ({ users, roles }) => {
        this.loading = false;
        this.users = [...(users || [])].sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: 'base' }));
        this.usersLastUpdatedAt = new Date();
        this.roles = roles || [];
        this.sanitizeCreateFormRoles();
        this.sanitizeEditDraftRoles();
      },
      error: (err) => {
        this.loading = false;
        this.error = this.messageFromError(err, 'Falha ao carregar administração de usuários.');
      },
    });
  }

  filteredUsers(): AdminUser[] {
    const term = String(this.userSearchTerm || '').trim().toLowerCase();
    const statusFilter = this.userStatusFilter;
    const selectedProfiles = (this.userProfileFilters || []).map((value) => String(value || '').trim()).filter(Boolean);
    const filtered = this.users.filter((user) => {
      const name = String(user.name || '').toLowerCase();
      const email = String(user.email || '').toLowerCase();
      const searchMatches = !term || name.includes(term) || email.includes(term);
      const statusMatches =
        statusFilter === 'ALL' ? true : statusFilter === 'ACTIVE' ? !!user.active : !user.active;
      const profileMatches =
        !selectedProfiles.length ||
        selectedProfiles.some((profile) => (user.roles || []).some((role) => this.sameRoleName(role, profile)));
      return searchMatches && statusMatches && profileMatches;
    });

    const dir = this.userSortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let left: string | number = '';
      let right: string | number = '';
      switch (this.userSortField) {
        case 'name':
          left = String(a.name || '').toLowerCase();
          right = String(b.name || '').toLowerCase();
          break;
        case 'email':
          left = String(a.email || '').toLowerCase();
          right = String(b.email || '').toLowerCase();
          break;
        case 'status':
          left = a.active ? 1 : 0;
          right = b.active ? 1 : 0;
          break;
        case 'createdAt':
          left = Number(a.createdAt || 0);
          right = Number(b.createdAt || 0);
          break;
        case 'updatedAt':
        default:
          left = Number(a.updatedAt || 0);
          right = Number(b.updatedAt || 0);
          break;
      }
      if (left < right) return -1 * dir;
      if (left > right) return 1 * dir;
      return 0;
    });
  }

  onUserProfileFiltersChange(values: string[]) {
    this.userProfileFilters = (values || []).map((value) => String(value || '').trim()).filter(Boolean);
  }

  userProfileFilterOptions(): MultiSelectOption[] {
    return this.roles
      .map((role) => ({
        value: role.name,
        label: `${role.name} (${this.userCountByRole(role.name)})`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }

  userCountByRole(roleName: string): number {
    return this.users.reduce((count, user) => {
      const hasRole = (user.roles || []).some((role) => this.sameRoleName(role, roleName));
      return count + (hasRole ? 1 : 0);
    }, 0);
  }

  userStatusCount(filter: 'ALL' | 'ACTIVE' | 'INACTIVE'): number {
    if (filter === 'ALL') return this.users.length;
    return this.users.reduce((count, user) => {
      if (filter === 'ACTIVE') return count + (user.active ? 1 : 0);
      return count + (!user.active ? 1 : 0);
    }, 0);
  }

  toggleUserSort(field: 'name' | 'email' | 'status' | 'createdAt' | 'updatedAt') {
    if (this.userSortField === field) {
      this.userSortDirection = this.userSortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.userSortField = field;
    this.userSortDirection = field === 'name' || field === 'email' ? 'asc' : 'desc';
  }

  userSortIndicator(field: 'name' | 'email' | 'status' | 'createdAt' | 'updatedAt'): string {
    if (this.userSortField !== field) return '';
    return this.userSortDirection === 'asc' ? '▲' : '▼';
  }

  isUserSelected(userId: string): boolean {
    return this.selectedUserIds.has(userId);
  }

  toggleUserSelection(userId: string, checked: boolean) {
    if (checked) this.selectedUserIds.add(userId);
    else this.selectedUserIds.delete(userId);
  }

  areAllFilteredUsersSelected(): boolean {
    const list = this.filteredUsers();
    if (!list.length) return false;
    return list.every((user) => this.selectedUserIds.has(user.id));
  }

  isPartialUsersSelection(): boolean {
    const list = this.filteredUsers();
    if (!list.length) return false;
    const selectedInFilter = list.filter((user) => this.selectedUserIds.has(user.id)).length;
    return selectedInFilter > 0 && selectedInFilter < list.length;
  }

  toggleSelectAllFilteredUsers(checked: boolean) {
    const list = this.filteredUsers();
    if (!list.length) return;
    if (checked) list.forEach((user) => this.selectedUserIds.add(user.id));
    else list.forEach((user) => this.selectedUserIds.delete(user.id));
  }

  selectedUsersCount(): number {
    return this.selectedUserIds.size;
  }

  clearSelectedUsers() {
    this.selectedUserIds.clear();
    this.bulkTargetRole = '';
  }

  setSelectedUsersActive(active: boolean) {
    const users = this.users.filter((user) => this.selectedUserIds.has(user.id));
    if (!users.length) return;
    const requests = users
      .filter((user) => user.active !== active)
      .map((user) => this.api.setUserActive(user.id, active));
    if (!requests.length) {
      this.status = `Nenhuma alteração de status necessária.`;
      return;
    }
    this.bulkUsersLoading = true;
    this.error = '';
    this.status = '';
    forkJoin(requests).subscribe({
      next: () => {
        this.bulkUsersLoading = false;
        this.status = `${requests.length} usuário(s) ${active ? 'ativado(s)' : 'desativado(s)'} com sucesso.`;
        this.clearSelectedUsers();
        this.loadUsers();
      },
      error: (err) => {
        this.bulkUsersLoading = false;
        this.error = this.messageFromError(err, `Falha ao ${active ? 'ativar' : 'desativar'} usuários em lote.`);
      },
    });
  }

  revokeRefreshTokensBulk() {
    const users = this.users.filter((user) => this.selectedUserIds.has(user.id));
    if (!users.length) return;
    this.bulkUsersLoading = true;
    this.error = '';
    this.status = '';
    forkJoin(users.map((user) => this.api.revokeRefreshTokens(user.id))).subscribe({
      next: () => {
        this.bulkUsersLoading = false;
        this.status = `Refresh tokens revogados para ${users.length} usuário(s).`;
        this.clearSelectedUsers();
      },
      error: (err) => {
        this.bulkUsersLoading = false;
        this.error = this.messageFromError(err, 'Falha ao revogar refresh tokens em lote.');
      },
    });
  }

  applyBulkRole() {
    const role = String(this.bulkTargetRole || '').trim();
    if (!role) {
      this.error = 'Selecione um perfil para alteração em lote.';
      return;
    }
    const users = this.users.filter((user) => this.selectedUserIds.has(user.id));
    if (!users.length) return;
    const requests: Observable<unknown>[] = [];
    for (const user of users) {
      const hasRole = (user.roles || []).some((r) => this.sameRoleName(r, role));
      for (const existing of user.roles || []) {
        if (!this.sameRoleName(existing, role)) {
          requests.push(this.api.removeUserRole(user.id, existing));
        }
      }
      if (!hasRole) {
        requests.push(this.api.addUserRole(user.id, role));
      }
    }
    if (!requests.length) {
      this.status = 'Nenhuma alteração de perfil necessária.';
      return;
    }
    this.bulkUsersLoading = true;
    this.error = '';
    this.status = '';
    forkJoin(requests).subscribe({
      next: () => {
        this.bulkUsersLoading = false;
        this.status = `Perfil "${role}" aplicado para ${users.length} usuário(s).`;
        this.clearSelectedUsers();
        this.loadUsers();
      },
      error: (err) => {
        this.bulkUsersLoading = false;
        this.error = this.messageFromError(err, 'Falha ao alterar perfil em lote.');
      },
    });
  }

  toggleUserRowMenu(userId: string) {
    this.userRowMenuId = this.userRowMenuId === userId ? null : userId;
  }

  closeUserRowMenu() {
    this.userRowMenuId = null;
  }

  isUserRowMenuOpen(userId: string): boolean {
    return this.userRowMenuId === userId;
  }

  isCurrentUser(user: AdminUser): boolean {
    const currentEmail = String(this.auth.user()?.email || '').trim().toLowerCase();
    if (!currentEmail) return false;
    return String(user.email || '').trim().toLowerCase() === currentEmail;
  }

  setUserActiveQuick(user: AdminUser, active: boolean) {
    this.closeUserRowMenu();
    if (user.active === active) {
      this.status = `Usuário "${user.email}" já está ${active ? 'ativo' : 'inativo'}.`;
      return;
    }
    this.api.setUserActive(user.id, active).subscribe({
      next: () => {
        this.status = `Usuário "${user.email}" ${active ? 'ativado' : 'desativado'}.`;
        this.loadUsers();
      },
      error: (err) => {
        this.error = this.messageFromError(err, `Falha ao ${active ? 'ativar' : 'desativar'} usuário.`);
      },
    });
  }

  sameRoleName(a: string, b: string): boolean {
    const normalize = (value: string) => String(value || '').trim().toUpperCase();
    return normalize(a) === normalize(b);
  }

  createUser() {
    const name = this.createForm.name.trim();
    const email = this.createForm.email.trim();
    const password = this.createForm.password;
    if (!name || !email || !password) {
      this.error = 'Informe nome, e-mail e senha para criar usuário.';
      return;
    }
    const passwordError = this.passwordValidationError(password);
    if (passwordError) {
      this.error = passwordError;
      return;
    }

    const selectedRoles = Array.from(this.createForm.roles);
    if (!selectedRoles.length) {
      this.error = 'Selecione ao menos um perfil para criar usuário.';
      return;
    }
    this.saving = true;
    this.error = '';
    this.api
      .createUser({
        name,
        email,
        password,
        active: this.createForm.active,
        roles: selectedRoles,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.status = `Usuário "${name}" criado.`;
          this.createForm.name = '';
          this.createForm.email = '';
          this.createForm.password = '';
          this.createForm.active = true;
          this.createForm.roles = new Set<string>();
          this.createUserModalOpen = false;
          this.loadUsers();
        },
        error: (err) => {
          this.saving = false;
          console.log('[admin-users][createUser] backend error:', err);
          console.log('[admin-users][createUser] backend error payload:', err?.error);
          this.error = this.messageFromError(err, 'Falha ao criar usuário.');
        },
      });
  }

  openCreateUserModal() {
    this.error = '';
    this.status = '';
    if (!this.createForm.roles.size && this.roles.length) {
      this.createForm.roles = new Set<string>([this.roles[0].name]);
    }
    this.createUserModalOpen = true;
  }

  closeCreateUserModal() {
    this.createUserModalOpen = false;
  }

  createUserRoleOptions(): MultiSelectOption[] {
    return this.roles.map((role) => ({
      value: role.name,
      label: role.name,
    }));
  }

  createUserSelectedRoles(): string[] {
    return Array.from(this.createForm.roles);
  }

  onCreateUserRolesChange(values: string[]) {
    const normalized = (values || []).map((value) => String(value).trim()).filter(Boolean);
    this.createForm.roles = new Set<string>(normalized);
  }

  canSubmitCreateUser(): boolean {
    return (
      !!this.createForm.name.trim() &&
      !!this.createForm.email.trim() &&
      !!this.createForm.password &&
      this.isPasswordStrong(this.createForm.password) &&
      this.createForm.roles.size > 0
    );
  }

  private sanitizeCreateFormRoles() {
    const valid = new Set(this.roles.map((r) => r.name));
    this.createForm.roles = new Set(Array.from(this.createForm.roles).filter((role) => valid.has(role)));
  }

  private sanitizeEditDraftRoles() {
    if (!this.editUserDraft) return;
    const valid = new Set(this.roles.map((r) => r.name));
    const sanitizedCurrent = Array.from(this.editUserDraft.roles).filter((role) => valid.has(role));
    this.editUserDraft.roles = new Set(sanitizedCurrent);
    this.editUserRoleSelection = sanitizedCurrent;
    this.editUserDraft.originalRoles = new Set(
      Array.from(this.editUserDraft.originalRoles).filter((role) => valid.has(role))
    );
  }

  openEditUserModal(user: AdminUser) {
    this.error = '';
    this.status = '';
    this.editUserDraft = {
      id: user.id,
      name: user.name,
      originalName: user.name,
      email: user.email,
      active: user.active,
      originalActive: user.active,
      roles: new Set<string>(user.roles || []),
      originalRoles: new Set<string>(user.roles || []),
    };
    this.editUserRoleSelection = Array.from(this.editUserDraft.roles);
    this.editUserModalOpen = true;
  }

  closeEditUserModal() {
    this.editUserModalOpen = false;
    this.editUserRoleSelection = [];
    this.editUserDraft = null;
  }

  onEditUserRolesChange(values: string[]) {
    if (!this.editUserDraft) return;
    const normalized = (values || []).map((value) => String(value).trim()).filter(Boolean);
    this.editUserRoleSelection = normalized;
    this.editUserDraft.roles = new Set<string>(normalized);
  }

  saveEditUser() {
    const draft = this.editUserDraft;
    if (!draft) return;

    const actions: Observable<unknown>[] = [];
    const nextName = String(draft.name || '').trim();
    if (!nextName) {
      this.error = 'Informe o nome do usuário.';
      return;
    }
    if (nextName !== String(draft.originalName || '').trim()) {
      actions.push(this.api.updateUserName(draft.id, { name: nextName }));
    }
    if (draft.active !== draft.originalActive) {
      actions.push(this.api.setUserActive(draft.id, draft.active));
    }

    const nextRoles = draft.roles;
    const currentRoles = draft.originalRoles;
    for (const role of nextRoles) {
      if (!currentRoles.has(role)) actions.push(this.api.addUserRole(draft.id, role));
    }
    for (const role of currentRoles) {
      if (!nextRoles.has(role)) actions.push(this.api.removeUserRole(draft.id, role));
    }

    if (!actions.length) {
      this.closeEditUserModal();
      return;
    }

    this.editUserSaving = true;
    this.error = '';
    this.status = '';
    forkJoin(actions).subscribe({
      next: () => {
        this.editUserSaving = false;
        this.status = `Usuário "${draft.email}" atualizado.`;
        this.closeEditUserModal();
        this.loadUsers();
      },
      error: (err) => {
        this.editUserSaving = false;
        this.error = this.messageFromError(err, 'Falha ao salvar alterações do usuário.');
      },
    });
  }

  revokeRefreshTokens(user: AdminUser) {
    this.closeUserRowMenu();
    this.api.revokeRefreshTokens(user.id).subscribe({
      next: () => {
        this.status = `Refresh tokens revogados para ${user.email}.`;
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao revogar refresh tokens.');
      },
    });
  }

  openPasswordModal(user: AdminUser) {
    this.closeUserRowMenu();
    this.error = '';
    this.status = '';
    this.passwordModalUser = user;
    this.passwordModalValue = '';
    this.passwordModalOpen = true;
  }

  closePasswordModal() {
    this.passwordModalOpen = false;
    this.passwordModalUser = null;
    this.passwordModalValue = '';
  }

  submitPasswordReset() {
    const user = this.passwordModalUser;
    if (!user) return;
    const password = String(this.passwordModalValue || '');
    if (!password.trim()) {
      this.error = 'Informe a nova senha.';
      return;
    }
    const passwordError = this.passwordValidationError(password);
    if (passwordError) {
      this.error = passwordError;
      return;
    }

    this.passwordModalSaving = true;
    this.error = '';
    this.status = '';
    this.api.updateUserPassword(user.id, { password }).subscribe({
      next: () => {
        this.passwordModalSaving = false;
        this.closePasswordModal();
        this.status = `Senha redefinida para ${user.email}. Tokens de refresh revogados.`;
      },
      error: (err) => {
        this.passwordModalSaving = false;
        this.error = this.messageFromError(err, 'Falha ao redefinir senha.');
      },
    });
  }

  trackUser = (_: number, u: AdminUser) => u.id;

  isPasswordStrong(password: string): boolean {
    return !this.passwordValidationError(password);
  }

  private loadUsers() {
    this.closeUserRowMenu();
    this.api.listUsers().subscribe({
      next: (users) => {
        this.users = [...(users || [])].sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: 'base' }));
        this.usersLastUpdatedAt = new Date();
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao recarregar usuários.');
      },
    });
  }

  private messageFromError(err: any, fallback: string): string {
    const raw = err?.error;
    let data: any = raw;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          data = JSON.parse(trimmed);
        } catch {
          data = raw;
        }
      }
    }
    const message = typeof data?.message === 'string' ? data.message.trim() : '';
    return message || fallback;
  }

  private passwordValidationError(password: string): string {
    const value = String(password || '');
    const strongPattern = /^(?=\S{10,}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).+$/;
    return strongPattern.test(value) ? '' : this.passwordRuleMessage;
  }
}
