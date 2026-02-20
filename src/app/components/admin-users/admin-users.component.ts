import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin, of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { MultiSelectOption, ReportsMultiSelectComponent } from '../reports/controls/multi-select/reports-multi-select.component';
import { AppButtonComponent } from '../shared/app-button/app-button.component';
import { AuthService } from '../../services/auth.service';
import {
  AdminRole,
  AdminUser,
  AdminUserService,
  PermissionCatalogItem,
} from '../../services/admin-user.service';
import {
  AccessControlRule,
  AccessControlRuleInput,
  AclSubjectType,
  ReportDefinition,
  ReportFolder,
  ReportService,
} from '../../services/report.service';

type RoleAclNode = {
  id: string;
  name: string;
  expanded: boolean;
  originalRule: AccessControlRule | null;
  allowed: boolean;
  reports: Array<{
    id: string;
    name: string;
    originalRule: AccessControlRule | null;
    useFolderInheritance: boolean;
    allowed: boolean;
  }>;
};

type PermissionGroupKey =
  | 'EMAIL'
  | 'REPORTS'
  | 'TEMPLATES'
  | 'FOLDERS'
  | 'SQL'
  | 'SCHEDULES'
  | 'OTHER';

type PermissionGroup = {
  key: PermissionGroupKey;
  title: string;
  items: PermissionCatalogItem[];
};

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ReportsMultiSelectComponent, AppButtonComponent],
  templateUrl: './admin-users.component.html',
  styleUrls: ['./admin-users.component.css'],
})
export class AdminUsersComponent implements OnInit {
  readonly passwordRuleMessage =
    'Senha deve ter no minimo 10 caracteres, incluindo letra maiuscula, letra minuscula, numero e caractere especial, sem espacos';
  private api = inject(AdminUserService);
  private reportApi = inject(ReportService);
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
  permissionsCatalog: PermissionCatalogItem[] = [];
  roleSaving = false;
  roleEditorOpen = false;
  roleEditorMode: 'create' | 'edit' = 'create';
  rolePermissionFilter = '';
  selectedRoleName = '';
  selectedRolePermissionDraft = new Set<string>();
  aclTreeLoading = false;
  savingAllRoleChanges = false;
  roleSearchTerm = '';
  roleAclSearchTerm = '';
  roleAclAccessFilter: 'ALL' | 'ALLOW' | 'DENY' = 'ALL';
  folderBulkMenuOpenId: string | null = null;
  selectedPermissionSearchTerm = '';
  selectedPermissionCategoryFilter: PermissionGroupKey | 'ALL' = 'ALL';
  selectedPermissionOnlyMarked = false;
  roleAclTree: RoleAclNode[] = [];
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
  roleForm = {
    originalName: '',
    name: '',
    permissions: new Set<string>(),
  };
  aclFolders: ReportFolder[] = [];
  aclReports: ReportDefinition[] = [];

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

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.adminSection === 'PERMISSIONS' && this.hasAnyRoleChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  loadAll() {
    this.loading = true;
    this.error = '';
    this.closeUserRowMenu();
    forkJoin({
      users: this.api.listUsers(),
      roles: this.api.listRoles(),
      permissionsCatalog: this.api.listPermissionsCatalog(),
      folders: this.reportApi.listFolders(),
      reports: this.reportApi.listReports(),
    }).subscribe({
      next: ({ users, roles, permissionsCatalog, folders, reports }) => {
        this.loading = false;
        this.users = [...(users || [])].sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: 'base' }));
        this.usersLastUpdatedAt = new Date();
        this.roles = roles || [];
        this.sanitizeCreateFormRoles();
        this.sanitizeEditDraftRoles();
        const matchedRole = this.roles.find((r) => this.sameRoleName(r.name, this.selectedRoleName));
        if (matchedRole) {
          this.selectedRoleName = matchedRole.name;
        } else if (!String(this.selectedRoleName || '').trim()) {
          this.selectedRoleName = this.roles[0]?.name || '';
        }
        this.syncSelectedRolePermissionDraft();
        this.permissionsCatalog = [...(permissionsCatalog || [])].sort((a, b) =>
          String(a.label || a.code).localeCompare(String(b.label || b.code), undefined, { sensitivity: 'base' })
        );
        this.aclFolders = [...(folders || [])].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        this.aclReports = [...(reports || [])].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        if (this.adminSection === 'PERMISSIONS' && this.selectedRoleName) {
          this.loadRoleAclTree();
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = this.messageFromError(err, 'Falha ao carregar administração de usuários.');
      },
    });
  }

  filteredRoles(): AdminRole[] {
    const term = String(this.roleSearchTerm || '').trim().toLowerCase();
    if (!term) return this.roles;
    return this.roles.filter((role) => {
      const name = String(role.name || '').toLowerCase();
      return name.includes(term);
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

  isSystemRole(roleName: string): boolean {
    return this.sameRoleName(roleName, 'ADMIN');
  }

  isSelectedAdminProfile(): boolean {
    return this.sameRoleName(this.selectedRoleName, 'ADMIN');
  }

  selectedRole(): AdminRole | null {
    return this.roles.find((role) => this.sameRoleName(role.name, this.selectedRoleName)) || null;
  }

  selectRole(roleName: string) {
    if (!roleName) return;
    const nextRole = this.roles.find((role) => this.sameRoleName(role.name, roleName))?.name || roleName;
    if (this.sameRoleName(this.selectedRoleName, nextRole)) return;
    if (this.hasAnyRoleChanges()) {
      const confirmSwitch = confirm('Existem alterações não salvas. Deseja trocar de perfil mesmo assim?');
      if (!confirmSwitch) return;
    }
    this.selectedRoleName = nextRole;
    this.syncSelectedRolePermissionDraft();
    this.loadRoleAclTree();
  }

  sameRoleName(a: string, b: string): boolean {
    const normalize = (value: string) => String(value || '').trim().toUpperCase();
    return normalize(a) === normalize(b);
  }

  isSelectedRolePermission(permission: string): boolean {
    return this.selectedRolePermissionDraft.has(permission);
  }

  setSelectedRolePermission(permission: string, checked: boolean) {
    if (checked) this.selectedRolePermissionDraft.add(permission);
    else this.selectedRolePermissionDraft.delete(permission);
  }

  applyPermissionGroupSelection(items: PermissionCatalogItem[], mode: 'all' | 'none') {
    const list = items || [];
    for (const permission of list) {
      const code = permission?.code;
      if (!code) continue;
      if (mode === 'all') this.selectedRolePermissionDraft.add(code);
      else if (mode === 'none') this.selectedRolePermissionDraft.delete(code);
    }
  }

  saveAllRoleChanges() {
    const role = this.selectedRole();
    if (!role) {
      this.error = 'Selecione um perfil.';
      return;
    }
    if (this.isSelectedAdminProfile()) {
      this.status = 'Perfil ADMIN possui acesso total gerenciado no backend.';
      return;
    }

    const hasPermissionChanges = this.hasSelectedRolePermissionChanges();
    const aclRequests = this.buildRoleAclRequests(role.name);
    if (!hasPermissionChanges && !aclRequests.length) {
      this.status = 'Nenhuma alteração pendente.';
      return;
    }

    const requests: Observable<unknown>[] = [];
    if (hasPermissionChanges) {
      requests.push(
        this.api.updateRole(role.name, {
          name: role.name,
          permissions: Array.from(this.selectedRolePermissionDraft),
        })
      );
    }
    requests.push(...aclRequests);

    this.savingAllRoleChanges = true;
    this.error = '';
    this.status = '';
    forkJoin(requests).subscribe({
      next: () => {
        this.savingAllRoleChanges = false;
        this.status = `Alterações do perfil "${role.name}" salvas.`;
        this.loadAll();
      },
      error: (err) => {
        this.savingAllRoleChanges = false;
        this.error = this.messageFromError(err, 'Falha ao salvar alterações do perfil.');
      },
    });
  }

  toggleRoleAclFolder(folderId: string) {
    this.roleAclTree = this.roleAclTree.map((node) =>
      node.id === folderId ? { ...node, expanded: !node.expanded } : node
    );
    if (this.folderBulkMenuOpenId === folderId) this.folderBulkMenuOpenId = null;
  }

  expandAllRoleAclFolders() {
    this.roleAclTree = this.roleAclTree.map((node) => ({ ...node, expanded: true }));
  }

  collapseAllRoleAclFolders() {
    this.roleAclTree = this.roleAclTree.map((node) => ({ ...node, expanded: false }));
    this.folderBulkMenuOpenId = null;
  }

  setFolderAclAllowed(folderId: string, value: boolean) {
    this.roleAclTree = this.roleAclTree.map((node) => {
      if (node.id !== folderId) return node;
      const reports = node.reports.map((report) =>
        report.useFolderInheritance ? { ...report, allowed: value } : report
      );
      return { ...node, allowed: value, reports };
    });
  }

  setReportAclAllowed(folderId: string, reportId: string, value: boolean) {
    this.roleAclTree = this.roleAclTree.map((node) => {
      if (node.id !== folderId) return node;
      return {
        ...node,
        reports: node.reports.map((report) =>
          report.id !== reportId
            ? report
            : {
                ...report,
                useFolderInheritance: false,
                allowed: value,
              }
        ),
      };
    });
  }

  inheritReportAclFromFolder(folderId: string, reportId: string) {
    this.roleAclTree = this.roleAclTree.map((node) => {
      if (node.id !== folderId) return node;
      return {
        ...node,
        reports: node.reports.map((report) =>
          report.id !== reportId
            ? report
            : {
                ...report,
                useFolderInheritance: true,
                allowed: node.allowed,
              }
        ),
      };
    });
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
  trackRole = (_: number, r: AdminRole) => r.name;
  trackPermissionCatalog = (_: number, p: PermissionCatalogItem) => p.code;
  trackPermissionGroup = (_: number, group: PermissionGroup) => group.key;
  trackRoleAclFolder = (_: number, node: RoleAclNode) => node.id;
  trackRoleAclReport = (_: number, node: { id: string }) => node.id;

  filteredRoleAclTree(): RoleAclNode[] {
    const term = String(this.roleAclSearchTerm || '').trim().toLowerCase();
    return this.roleAclTree
      .map((folderNode) => {
        const folderNameMatches = String(folderNode.name || '').toLowerCase().includes(term);
        const folderAccessMatches = this.matchesAccessFilter(folderNode.allowed);
        const folderMatches = (!term || folderNameMatches) && folderAccessMatches;
        const reports = folderNode.reports.filter((reportNode) => {
          const reportNameMatches = !term || String(reportNode.name || '').toLowerCase().includes(term);
          const reportAccessMatches = this.matchesAccessFilter(reportNode.allowed);
          return reportNameMatches && reportAccessMatches;
        });
        if (!folderMatches && !reports.length) return null;
        return { ...folderNode, reports: folderMatches && !term ? reports : reports };
      })
      .filter((node): node is RoleAclNode => !!node);
  }

  allowedReportsCount(folderNode: RoleAclNode): number {
    return folderNode.reports.reduce((count, reportNode) => count + (reportNode.allowed ? 1 : 0), 0);
  }

  deniedReportsCount(folderNode: RoleAclNode): number {
    return folderNode.reports.reduce((count, reportNode) => count + (!reportNode.allowed ? 1 : 0), 0);
  }

  isPasswordStrong(password: string): boolean {
    return !this.passwordValidationError(password);
  }

  customReportsCount(folderNode: RoleAclNode): number {
    return folderNode.reports.reduce((count, reportNode) => count + (reportNode.useFolderInheritance ? 0 : 1), 0);
  }

  customizeReportAcl(folderId: string, reportId: string) {
    this.roleAclTree = this.roleAclTree.map((node) => {
      if (node.id !== folderId) return node;
      return {
        ...node,
        reports: node.reports.map((report) =>
          report.id !== reportId
            ? report
            : {
                ...report,
                useFolderInheritance: false,
              }
        ),
      };
    });
  }

  applyFolderPermissionToAllReports(folderId: string) {
    this.roleAclTree = this.roleAclTree.map((node) => {
      if (node.id !== folderId) return node;
      return {
        ...node,
        reports: node.reports.map((report) => ({
          ...report,
          useFolderInheritance: false,
          allowed: node.allowed,
        })),
      };
    });
    this.folderBulkMenuOpenId = null;
  }

  setAllFolderReportsNoAccess(folderId: string) {
    this.roleAclTree = this.roleAclTree.map((node) => {
      if (node.id !== folderId) return node;
      return {
        ...node,
        reports: node.reports.map((report) => ({
          ...report,
          useFolderInheritance: false,
          allowed: false,
        })),
      };
    });
    this.folderBulkMenuOpenId = null;
  }

  inheritAllFolderReports(folderId: string) {
    this.roleAclTree = this.roleAclTree.map((node) => {
      if (node.id !== folderId) return node;
      return {
        ...node,
        reports: node.reports.map((report) => ({
          ...report,
          useFolderInheritance: true,
          allowed: node.allowed,
        })),
      };
    });
    this.folderBulkMenuOpenId = null;
  }

  toggleFolderBulkMenu(folderId: string) {
    this.folderBulkMenuOpenId = this.folderBulkMenuOpenId === folderId ? null : folderId;
  }

  isFolderBulkMenuOpen(folderId: string): boolean {
    return this.folderBulkMenuOpenId === folderId;
  }

  isReportAclException(folderNode: RoleAclNode, reportNode: RoleAclNode['reports'][number]): boolean {
    return !reportNode.useFolderInheritance && reportNode.allowed !== folderNode.allowed;
  }

  toggleRoleAclAccessFilter(filter: 'ALLOW' | 'DENY') {
    this.roleAclAccessFilter = this.roleAclAccessFilter === filter ? 'ALL' : filter;
  }

  private matchesAccessFilter(allowed: boolean): boolean {
    if (this.roleAclAccessFilter === 'ALL') return true;
    return this.roleAclAccessFilter === 'ALLOW' ? allowed : !allowed;
  }

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
    this.rolePermissionFilter = '';
  }

  toggleRolePermission(permission: string, checked: boolean) {
    if (checked) this.roleForm.permissions.add(permission);
    else this.roleForm.permissions.delete(permission);
  }

  filteredPermissionsCatalog(): PermissionCatalogItem[] {
    const term = this.rolePermissionFilter.trim().toLowerCase();
    if (!term) return this.permissionsCatalog;
    return this.permissionsCatalog.filter((permission) => {
      const label = String(permission.label || '').toLowerCase();
      const code = String(permission.code || '').toLowerCase();
      const description = String(permission.description || '').toLowerCase();
      return label.includes(term) || code.includes(term) || description.includes(term);
    });
  }

  groupedRoleEditorPermissions(): PermissionGroup[] {
    return this.groupPermissions(this.filteredPermissionsCatalog());
  }

  groupedSelectedRolePermissions(): PermissionGroup[] {
    return this.groupPermissions(this.filteredSelectedPermissionsCatalog());
  }

  setPermissionCategoryFilter(filter: PermissionGroupKey | 'ALL') {
    this.selectedPermissionCategoryFilter = filter;
  }

  permissionCategoryCount(filter: PermissionGroupKey | 'ALL'): number {
    if (filter === 'ALL') return this.permissionsCatalog.length;
    return this.permissionsCatalog.filter((permission) => this.permissionGroupKey(permission.code) === filter).length;
  }

  permissionCategorySelectedCount(filter: PermissionGroupKey | 'ALL'): number {
    if (filter === 'ALL') return this.selectedRolePermissionDraft.size;
    return this.permissionsCatalog.reduce((count, permission) => {
      if (this.permissionGroupKey(permission.code) !== filter) return count;
      return count + (this.selectedRolePermissionDraft.has(permission.code) ? 1 : 0);
    }, 0);
  }

  selectedRolePermissionSummary(): string {
    return `${this.selectedRolePermissionDraft.size} de ${this.permissionsCatalog.length} permissões ativas`;
  }

  rolePermissionCount(role: AdminRole): number {
    return Array.isArray(role?.permissions) ? role.permissions.length : 0;
  }

  filteredSelectedPermissionsCatalog(): PermissionCatalogItem[] {
    const term = String(this.selectedPermissionSearchTerm || '').trim().toLowerCase();
    return this.permissionsCatalog.filter((permission) => {
      const groupMatches =
        this.selectedPermissionCategoryFilter === 'ALL' ||
        this.permissionGroupKey(permission.code) === this.selectedPermissionCategoryFilter;
      if (!groupMatches) return false;

      if (this.selectedPermissionOnlyMarked && !this.isSelectedRolePermission(permission.code)) return false;

      if (!term) return true;
      const label = String(permission.label || '').toLowerCase();
      const code = String(permission.code || '').toLowerCase();
      const description = String(permission.description || '').toLowerCase();
      return label.includes(term) || code.includes(term) || description.includes(term);
    });
  }

  hasSelectedRolePermissionChanges(): boolean {
    const role = this.selectedRole();
    if (!role) return false;
    if (this.isSelectedAdminProfile()) return false;
    const current = new Set(role.permissions || []);
    const draft = this.selectedRolePermissionDraft;
    if (current.size !== draft.size) return true;
    for (const permission of current) {
      if (!draft.has(permission)) return true;
    }
    return false;
  }

  pendingRolePermissionChangesCount(): number {
    const role = this.selectedRole();
    if (!role || this.isSelectedAdminProfile()) return 0;
    const current = new Set(role.permissions || []);
    const draft = this.selectedRolePermissionDraft;
    let count = 0;
    for (const permission of draft) {
      if (!current.has(permission)) count++;
    }
    for (const permission of current) {
      if (!draft.has(permission)) count++;
    }
    return count;
  }

  hasRoleAclChanges(): boolean {
    if (this.isSelectedAdminProfile()) return false;
    const role = String(this.selectedRoleName || '').trim();
    if (!role) return false;
    return this.buildRoleAclRequests(role).length > 0;
  }

  pendingRoleAclChangesCount(): number {
    if (this.isSelectedAdminProfile()) return 0;
    const role = String(this.selectedRoleName || '').trim();
    if (!role) return 0;
    return this.buildRoleAclRequests(role).length;
  }

  hasAnyRoleChanges(): boolean {
    return this.hasSelectedRolePermissionChanges() || this.hasRoleAclChanges();
  }

  selectAllVisibleRolePermissions() {
    this.filteredPermissionsCatalog().forEach((permission) => this.roleForm.permissions.add(permission.code));
  }

  clearAllRolePermissions() {
    this.roleForm.permissions.clear();
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
        this.rolePermissionFilter = '';
        this.selectedRoleName = saved.name;
        this.status =
          this.roleEditorMode === 'create'
            ? `Perfil "${saved.name}" criado.`
            : `Perfil "${saved.name}" atualizado.`;
        this.loadAll();
      },
      error: (err) => {
        this.roleSaving = false;
        this.error = this.messageFromError(err, 'Falha ao salvar perfil.');
      },
    });
  }

  deleteRole(roleName: string) {
    if (this.isSystemRole(roleName)) return;
    if (!confirm(`Excluir perfil "${roleName}"?`)) return;
    this.api.deleteRole(roleName).subscribe({
      next: () => {
        if (this.sameRoleName(this.selectedRoleName, roleName)) {
          this.selectedRoleName = '';
          this.roleAclTree = [];
        }
        this.status = `Perfil "${roleName}" excluído.`;
        this.loadAll();
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao excluir perfil.');
      },
    });
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

  private syncSelectedRolePermissionDraft() {
    const role = this.roles.find((item) => this.sameRoleName(item.name, this.selectedRoleName));
    this.selectedRolePermissionDraft = new Set<string>(role?.permissions || []);
  }

  private loadRoleAclTree() {
    const role = String(this.selectedRoleName || '').trim();
    this.folderBulkMenuOpenId = null;
    if (!role) {
      this.roleAclTree = [];
      return;
    }
    const folderRequests = this.aclFolders.map((folder) => this.reportApi.listFolderAcl(folder.id));
    const reportRequests = this.aclReports.map((report) => this.reportApi.listReportAcl(report.id));
    this.aclTreeLoading = true;
    this.error = '';
    forkJoin({
      folderRulesByTarget: folderRequests.length ? forkJoin(folderRequests) : of<AccessControlRule[][]>([]),
      reportRulesByTarget: reportRequests.length ? forkJoin(reportRequests) : of<AccessControlRule[][]>([]),
    }).subscribe({
      next: ({ folderRulesByTarget, reportRulesByTarget }) => {
        this.aclTreeLoading = false;
        const reportRulesById = new Map<string, AccessControlRule | null>();
        for (let i = 0; i < this.aclReports.length; i++) {
          const report = this.aclReports[i];
          const match = this.extractRoleRule(reportRulesByTarget[i] || [], role);
          reportRulesById.set(report.id, match);
        }

        this.roleAclTree = this.aclFolders.map((folder, index) => {
          const folderRule = this.extractRoleRule(folderRulesByTarget[index] || [], role);
          const folderAllowed = this.ruleToAllowed(folderRule);
          const reports = this.aclReports
            .filter((report) => report.folderId === folder.id)
            .map((report) => {
              const reportRule = reportRulesById.get(report.id) || null;
              const reportAllowed = reportRule ? this.ruleToAllowed(reportRule) : folderAllowed;
              return {
                id: report.id,
                name: report.name,
                originalRule: reportRule,
                useFolderInheritance: !reportRule,
                allowed: reportAllowed,
              };
            });
          return {
            id: folder.id,
            name: folder.name,
            expanded: true,
            originalRule: folderRule,
            allowed: folderAllowed,
            reports,
          };
        });
      },
      error: (err) => {
        this.aclTreeLoading = false;
        this.roleAclTree = [];
        this.error = this.messageFromError(err, 'Falha ao carregar ACL da role.');
      },
    });
  }

  private extractRoleRule(rules: AccessControlRule[], roleName: string): AccessControlRule | null {
    const normalized = String(roleName || '').trim().toUpperCase();
    return (
      (rules || []).find(
        (rule) =>
          String(rule.subjectType || '').toUpperCase() === 'ROLE' &&
          String(rule.subject || '').trim().toUpperCase() === normalized
      ) || null
    );
  }

  private ruleToAllowed(rule: AccessControlRule | null): boolean {
    return !!(rule?.canView || rule?.canRun);
  }

  private buildAclRequestsForTarget(
    targetType: 'FOLDER' | 'REPORT',
    targetId: string,
    role: string,
    originalRule: AccessControlRule | null,
    allowed: boolean
  ): Observable<unknown>[] {
    const subjectType: AclSubjectType = 'ROLE';
    const desired = {
      canView: allowed,
      canRun: allowed,
      canEdit: false,
      canDelete: false,
    };
    const current = {
      canView: !!originalRule?.canView,
      canRun: !!originalRule?.canRun,
      canEdit: !!originalRule?.canEdit,
      canDelete: !!originalRule?.canDelete,
    };
    const changed =
      desired.canView !== current.canView ||
      desired.canRun !== current.canRun ||
      desired.canEdit !== current.canEdit ||
      desired.canDelete !== current.canDelete;
    if (!changed) return [];

    if (!allowed) {
      if (!originalRule) return [];
      return [
        targetType === 'FOLDER'
          ? this.reportApi.deleteFolderAcl(targetId, subjectType, role)
          : this.reportApi.deleteReportAcl(targetId, subjectType, role),
      ];
    }

    const payload: AccessControlRuleInput = {
      subjectType,
      subject: role,
      canView: desired.canView,
      canRun: desired.canRun,
      canEdit: desired.canEdit,
      canDelete: desired.canDelete,
    };
    return [
      targetType === 'FOLDER'
        ? this.reportApi.upsertFolderAcl(targetId, payload)
        : this.reportApi.upsertReportAcl(targetId, payload),
    ];
  }

  private buildRoleAclRequests(role: string): Observable<unknown>[] {
    const requests: Observable<unknown>[] = [];
    for (const folderNode of this.roleAclTree) {
      requests.push(...this.buildAclRequestsForTarget('FOLDER', folderNode.id, role, folderNode.originalRule, folderNode.allowed));
      for (const reportNode of folderNode.reports) {
        if (reportNode.useFolderInheritance) {
          if (reportNode.originalRule) {
            requests.push(this.reportApi.deleteReportAcl(reportNode.id, 'ROLE', role));
          }
          continue;
        }
        requests.push(
          ...this.buildAclRequestsForTarget('REPORT', reportNode.id, role, reportNode.originalRule, reportNode.allowed)
        );
      }
    }
    return requests;
  }

  private messageFromError(err: any, fallback: string): string {
    return (
      err?.error?.message ||
      err?.error?.error ||
      (typeof err?.error === 'string' ? err.error : '') ||
      fallback
    );
  }

  private passwordValidationError(password: string): string {
    const value = String(password || '');
    const strongPattern = /^(?=\S{10,}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).+$/;
    return strongPattern.test(value) ? '' : this.passwordRuleMessage;
  }

  private groupPermissions(items: PermissionCatalogItem[]): PermissionGroup[] {
    const byKey = new Map<PermissionGroupKey, PermissionCatalogItem[]>();
    const push = (key: PermissionGroupKey, item: PermissionCatalogItem) => {
      const current = byKey.get(key) || [];
      current.push(item);
      byKey.set(key, current);
    };

    for (const item of items || []) {
      push(this.permissionGroupKey(item.code), item);
    }

    const order: PermissionGroupKey[] = ['EMAIL', 'REPORTS', 'TEMPLATES', 'FOLDERS', 'SQL', 'SCHEDULES', 'OTHER'];
    return order
      .filter((key) => (byKey.get(key) || []).length > 0)
      .map((key) => ({
        key,
        title: this.permissionGroupTitle(key),
        items: byKey.get(key) || [],
      }));
  }

  private permissionGroupKey(code: string): PermissionGroupKey {
    const value = String(code || '').toUpperCase();
    if (value.startsWith('EMAIL_SCHEDULE_')) return 'SCHEDULES';
    if (value.startsWith('EMAIL_')) return 'EMAIL';
    if (value.startsWith('REPORT_')) return 'REPORTS';
    if (value.startsWith('TEMPLATE_')) return 'TEMPLATES';
    if (value.startsWith('FOLDER_')) return 'FOLDERS';
    if (value.startsWith('SQL_')) return 'SQL';
    return 'OTHER';
  }

  private permissionGroupTitle(key: PermissionGroupKey): string {
    if (key === 'EMAIL') return '📧 Email';
    if (key === 'REPORTS') return '📊 Relatorios';
    if (key === 'TEMPLATES') return '🧩 Templates';
    if (key === 'FOLDERS') return '🗂️ Pastas';
    if (key === 'SQL') return '⚙️ SQL';
    if (key === 'SCHEDULES') return '⏰ Agendamentos';
    return 'Outros';
  }
}
