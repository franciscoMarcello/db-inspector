import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin, of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { MultiSelectOption, ReportsMultiSelectComponent } from '../reports/controls/multi-select/reports-multi-select.component';
import { AppButtonComponent } from '../shared/app-button/app-button.component';
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

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ReportsMultiSelectComponent, AppButtonComponent],
  templateUrl: './admin-users.component.html',
  styleUrls: ['./admin-users.component.css'],
})
export class AdminUsersComponent implements OnInit {
  private api = inject(AdminUserService);
  private reportApi = inject(ReportService);
  private route = inject(ActivatedRoute);

  loading = false;
  saving = false;
  error = '';
  status = '';

  users: AdminUser[] = [];
  roles: AdminRole[] = [];
  permissions: string[] = [];
  permissionsCatalog: PermissionCatalogItem[] = [];
  permissionCatalogByCode: Record<string, PermissionCatalogItem> = {};
  roleSaving = false;
  roleEditorOpen = false;
  roleEditorMode: 'create' | 'edit' = 'create';
  rolePermissionFilter = '';
  createUserModalOpen = false;
  editUserModalOpen = false;
  editUserSaving = false;
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
  aclEntityType: 'FOLDER' | 'REPORT' = 'FOLDER';
  aclTargetId = '';
  aclRules: AccessControlRule[] = [];
  aclLoading = false;
  aclSaving = false;
  aclSubjectViewType: AclSubjectType = 'ROLE';
  aclSubjectView = '';
  aclSubjectViewLoading = false;
  aclSubjectRows: Array<{
    targetType: 'FOLDER' | 'REPORT';
    targetName: string;
    folderName: string;
    rule: AccessControlRule;
  }> = [];
  aclSubjectTree: Array<{
    folderId: string | null;
    folderName: string;
    folderRules: AccessControlRule[];
    reports: Array<{
      reportId: string;
      reportName: string;
      rules: AccessControlRule[];
    }>;
  }> = [];
  aclSubjectTreeExpanded: Record<string, boolean> = {};
  aclFolders: ReportFolder[] = [];
  aclReports: ReportDefinition[] = [];
  aclDraft: AccessControlRuleInput = {
    subjectType: 'ROLE',
    subject: '',
    canView: true,
    canRun: true,
    canEdit: false,
    canDelete: false,
  };

  createForm = {
    name: '',
    email: '',
    password: '',
    active: true,
    roles: new Set<string>(['USER']),
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
        this.roles = roles || [];
        if (this.aclDraft.subjectType === 'ROLE' && !this.aclDraft.subject && this.roles.length) {
          this.aclDraft = {
            ...this.aclDraft,
            subject: this.roles[0].name,
          };
        }
        if (this.aclSubjectViewType === 'ROLE' && !this.aclSubjectView && this.roles.length) {
          this.aclSubjectView = this.roles[0].name;
        }
        if (this.aclSubjectViewType === 'USER' && !this.aclSubjectView && this.users.length) {
          this.aclSubjectView = this.users[0].id;
        }
        this.permissionsCatalog = [...(permissionsCatalog || [])].sort((a, b) =>
          String(a.label || a.code).localeCompare(String(b.label || b.code), undefined, { sensitivity: 'base' })
        );
        this.permissions = this.permissionsCatalog.map((p) => p.code);
        this.permissionCatalogByCode = this.permissionsCatalog.reduce<Record<string, PermissionCatalogItem>>(
          (acc, item) => {
            acc[item.code] = item;
            return acc;
          },
          {}
        );
        this.aclFolders = [...(folders || [])].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        this.aclReports = [...(reports || [])].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        this.aclRules = [];
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

  createUser() {
    const name = this.createForm.name.trim();
    const email = this.createForm.email.trim();
    const password = this.createForm.password;
    if (!name || !email || !password) {
      this.error = 'Informe nome, e-mail e senha para criar usuário.';
      return;
    }

    const selectedRoles = Array.from(this.createForm.roles);
    this.saving = true;
    this.error = '';
    this.api
      .createUser({
        name,
        email,
        password,
        active: this.createForm.active,
        roles: selectedRoles.length ? selectedRoles : ['USER'],
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.status = `Usuário "${name}" criado.`;
          this.createForm.name = '';
          this.createForm.email = '';
          this.createForm.password = '';
          this.createForm.active = true;
          this.createForm.roles = new Set<string>(['USER']);
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
    this.editUserModalOpen = true;
  }

  closeEditUserModal() {
    this.editUserModalOpen = false;
    this.editUserDraft = null;
  }

  editUserSelectedRoles(): string[] {
    return this.editUserDraft ? Array.from(this.editUserDraft.roles) : [];
  }

  onEditUserRolesChange(values: string[]) {
    if (!this.editUserDraft) return;
    const normalized = (values || []).map((value) => String(value).trim()).filter(Boolean);
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
    if (password.length < 6) {
      this.error = 'A nova senha deve ter no mínimo 6 caracteres.';
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
  trackPermission = (_: number, p: string) => p;
  trackPermissionCatalog = (_: number, p: PermissionCatalogItem) => p.code;
  trackAclRule = (_: number, rule: AccessControlRule) =>
    `${rule.subjectType}:${rule.subject}:${rule.id || ''}`;
  trackAclSubjectFolder = (_: number, node: { folderId: string | null; folderName: string }) =>
    `${node.folderId || 'no-folder'}:${node.folderName}`;
  trackAclSubjectReport = (_: number, node: { reportId: string }) => node.reportId;

  permissionLabel(code: string): string {
    const item = this.permissionCatalogByCode[String(code || '').toUpperCase()];
    return item?.label || code;
  }

  permissionDescription(code: string): string {
    const item = this.permissionCatalogByCode[String(code || '').toUpperCase()];
    return item?.description || '';
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

  onAclEntityTypeChange(value: 'FOLDER' | 'REPORT') {
    this.aclEntityType = value;
    this.aclTargetId = '';
    this.aclRules = [];
  }

  onAclTargetChange(value: string) {
    this.aclTargetId = String(value || '').trim();
    this.loadAclRules();
  }

  onAclDraftFieldChange<K extends keyof AccessControlRuleInput>(key: K, value: AccessControlRuleInput[K]) {
    this.aclDraft = {
      ...this.aclDraft,
      [key]: value,
    };
  }

  onAclSubjectTypeChange(value: AclSubjectType) {
    const nextType = (value || 'ROLE') as AclSubjectType;
    if (nextType === 'ROLE') {
      const firstRole = this.roles[0]?.name || '';
      this.aclDraft = {
        ...this.aclDraft,
        subjectType: nextType,
        subject: this.roles.some((r) => r.name === this.aclDraft.subject) ? this.aclDraft.subject : firstRole,
      };
      return;
    }

    this.aclDraft = {
      ...this.aclDraft,
      subjectType: nextType,
      subject: '',
    };
  }

  onAclSubjectViewTypeChange(value: AclSubjectType) {
    this.aclSubjectViewType = (value || 'ROLE') as AclSubjectType;
    if (this.aclSubjectViewType === 'ROLE') {
      this.aclSubjectView = this.roles[0]?.name || '';
    } else {
      this.aclSubjectView = this.users[0]?.id || '';
    }
  }

  toggleAclSubjectFolder(folderId: string | null) {
    const key = folderId || '__no_folder__';
    this.aclSubjectTreeExpanded[key] = !this.aclSubjectTreeExpanded[key];
  }

  isAclSubjectFolderExpanded(folderId: string | null): boolean {
    const key = folderId || '__no_folder__';
    return this.aclSubjectTreeExpanded[key] ?? true;
  }

  clearAclSubjectView() {
    this.aclSubjectViewLoading = false;
    this.aclSubjectRows = [];
    this.aclSubjectTree = [];
  }

  loadAclSubjectView() {
    const subject = String(this.aclSubjectView || '').trim();
    if (!subject) {
      this.error = this.aclSubjectViewType === 'ROLE' ? 'Selecione a role.' : 'Selecione o usuário.';
      return;
    }

    const folderRequests = this.aclFolders.map((folder) => this.reportApi.listFolderAcl(folder.id));
    const reportRequests = this.aclReports.map((report) => this.reportApi.listReportAcl(report.id));

    this.aclSubjectViewLoading = true;
    this.error = '';
    forkJoin({
      folderRulesByTarget: folderRequests.length ? forkJoin(folderRequests) : of<AccessControlRule[][]>([]),
      reportRulesByTarget: reportRequests.length ? forkJoin(reportRequests) : of<AccessControlRule[][]>([]),
    }).subscribe({
      next: ({ folderRulesByTarget, reportRulesByTarget }) => {
        const normalizedSubject = subject.trim().toUpperCase();
        const subjectType = this.aclSubjectViewType;

        const matches = (rule: AccessControlRule) =>
          rule.subjectType === subjectType && String(rule.subject || '').trim().toUpperCase() === normalizedSubject;

        const grouped = new Map<
          string,
          {
            folderId: string | null;
            folderName: string;
            folderRules: AccessControlRule[];
            reports: Array<{ reportId: string; reportName: string; rules: AccessControlRule[] }>;
          }
        >();
        const flatRows: Array<{
          targetType: 'FOLDER' | 'REPORT';
          targetName: string;
          folderName: string;
          rule: AccessControlRule;
        }> = [];

        for (const folder of this.aclFolders) {
          grouped.set(folder.id, {
            folderId: folder.id,
            folderName: folder.name,
            folderRules: [],
            reports: [],
          });
        }

        for (let i = 0; i < this.aclFolders.length; i++) {
          const folder = this.aclFolders[i];
          const rules = (folderRulesByTarget[i] || []).filter(matches);
          const node = grouped.get(folder.id);
          if (!node) continue;
          node.folderRules.push(...rules);
          for (const rule of rules) {
            flatRows.push({
              targetType: 'FOLDER',
              targetName: folder.name,
              folderName: folder.name,
              rule,
            });
          }
        }

        for (let i = 0; i < this.aclReports.length; i++) {
          const report = this.aclReports[i];
          const rules = (reportRulesByTarget[i] || []).filter(matches);
          if (!rules.length) continue;
          const key = report.folderId || '__no_folder__';
          const folderName =
            this.aclFolders.find((folder) => folder.id === report.folderId)?.name ||
            report.folderName ||
            'Sem pasta';
          if (!grouped.has(key)) {
            grouped.set(key, {
              folderId: report.folderId || null,
              folderName,
              folderRules: [],
              reports: [],
            });
          }
          const node = grouped.get(key);
          if (!node) continue;
          node.reports.push({
            reportId: report.id,
            reportName: report.name,
            rules,
          });
          for (const rule of rules) {
            flatRows.push({
              targetType: 'REPORT',
              targetName: report.name,
              folderName,
              rule,
            });
          }
        }

        this.aclSubjectViewLoading = false;
        this.aclSubjectRows = flatRows.sort((a, b) => {
          const folderCmp = a.folderName.localeCompare(b.folderName, undefined, { sensitivity: 'base' });
          if (folderCmp !== 0) return folderCmp;
          const typeCmp = a.targetType.localeCompare(b.targetType);
          if (typeCmp !== 0) return typeCmp;
          return a.targetName.localeCompare(b.targetName, undefined, { sensitivity: 'base' });
        });
        this.aclSubjectTree = Array.from(grouped.values())
          .sort((a, b) => a.folderName.localeCompare(b.folderName, undefined, { sensitivity: 'base' }))
          .filter((node) => node.folderRules.length || node.reports.length);
        for (const folderNode of this.aclSubjectTree) {
          folderNode.reports.sort((a, b) =>
            a.reportName.localeCompare(b.reportName, undefined, { sensitivity: 'base' })
          );
          this.aclSubjectTreeExpanded[folderNode.folderId || '__no_folder__'] =
            this.aclSubjectTreeExpanded[folderNode.folderId || '__no_folder__'] ?? true;
        }
      },
      error: (err) => {
        this.aclSubjectViewLoading = false;
        this.aclSubjectRows = [];
        this.aclSubjectTree = [];
        this.error = this.messageFromError(err, 'Falha ao carregar visão ACL por usuário/role.');
      },
    });
  }

  saveAclRule() {
    const targetId = this.aclTargetId;
    if (!targetId) {
      this.error = 'Selecione a pasta ou relatório para ACL.';
      return;
    }
    const subject = (this.aclDraft.subject || '').trim();
    if (!subject) {
      this.error = 'Informe o alvo da ACL (role ou uuid).';
      return;
    }

    this.aclSaving = true;
    this.error = '';
    const payload: AccessControlRuleInput = {
      ...this.aclDraft,
      subjectType: this.aclDraft.subjectType as AclSubjectType,
      subject,
    };
    const req =
      this.aclEntityType === 'FOLDER'
        ? this.reportApi.upsertFolderAcl(targetId, payload)
        : this.reportApi.upsertReportAcl(targetId, payload);

    req.subscribe({
      next: () => {
        this.aclSaving = false;
        this.status = `Regra ACL ${this.aclEntityType === 'FOLDER' ? 'da pasta' : 'do relatório'} salva.`;
        this.loadAclRules();
      },
      error: (err) => {
        this.aclSaving = false;
        this.error = this.messageFromError(err, 'Falha ao salvar ACL.');
      },
    });
  }

  removeAclRule(rule: AccessControlRule) {
    const targetId = this.aclTargetId;
    if (!targetId) return;
    const req =
      this.aclEntityType === 'FOLDER'
        ? this.reportApi.deleteFolderAcl(targetId, rule.subjectType, rule.subject)
        : this.reportApi.deleteReportAcl(targetId, rule.subjectType, rule.subject);

    req.subscribe({
      next: () => {
        this.status = `Regra ACL ${this.aclEntityType === 'FOLDER' ? 'da pasta' : 'do relatório'} removida.`;
        this.loadAclRules();
      },
      error: (err) => {
        this.error = this.messageFromError(err, 'Falha ao remover ACL.');
      },
    });
  }

  refreshAclRules() {
    this.loadAclRules();
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

  private loadAclRules() {
    const targetId = this.aclTargetId;
    if (!targetId) {
      this.aclRules = [];
      return;
    }
    this.aclLoading = true;
    const req =
      this.aclEntityType === 'FOLDER'
        ? this.reportApi.listFolderAcl(targetId)
        : this.reportApi.listReportAcl(targetId);

    req.subscribe({
      next: (rules) => {
        this.aclLoading = false;
        this.aclRules = rules || [];
      },
      error: (err) => {
        this.aclLoading = false;
        this.aclRules = [];
        this.error = this.messageFromError(err, 'Falha ao carregar ACL.');
      },
    });
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
