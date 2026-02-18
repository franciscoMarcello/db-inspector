import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
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
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.component.html',
  styleUrls: ['./admin-users.component.css'],
})
export class AdminUsersComponent implements OnInit {
  private api = inject(AdminUserService);
  private reportApi = inject(ReportService);

  loading = false;
  saving = false;
  error = '';
  status = '';

  users: AdminUser[] = [];
  roles: AdminRole[] = [];
  permissions: string[] = [];
  permissionsCatalog: PermissionCatalogItem[] = [];
  permissionCatalogByCode: Record<string, PermissionCatalogItem> = {};
  roleToAddByUser: Record<string, string> = {};
  roleSaving = false;
  roleEditorOpen = false;
  roleEditorMode: 'create' | 'edit' = 'create';
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
  trackPermissionCatalog = (_: number, p: PermissionCatalogItem) => p.code;
  trackAclRule = (_: number, rule: AccessControlRule) =>
    `${rule.subjectType}:${rule.subject}:${rule.id || ''}`;

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
