import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin, of } from 'rxjs';
import { AppButtonComponent } from '../../shared/app-button/app-button.component';
import { AdminRole, AdminUserService, PermissionCatalogItem } from '../../../services/admin-user.service';
import {
  AccessControlRule,
  AccessControlRuleInput,
  AclSubjectType,
  ReportDefinition,
  ReportFolder,
  ReportService,
} from '../../../services/report.service';

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

type PermissionGroupKey = 'EMAIL' | 'REPORTS' | 'TEMPLATES' | 'FOLDERS' | 'SQL' | 'SCHEDULES' | 'OTHER';

type PermissionGroup = {
  key: PermissionGroupKey;
  title: string;
  items: PermissionCatalogItem[];
};

@Component({
  selector: 'app-admin-users-permissions-acl',
  standalone: true,
  imports: [CommonModule, FormsModule, AppButtonComponent],
  templateUrl: './admin-users-permissions-acl.component.html',
  styleUrls: ['./admin-users-permissions-acl.component.css'],
})
export class AdminUsersPermissionsAclComponent implements OnInit {
  private api = inject(AdminUserService);
  private reportApi = inject(ReportService);

  @Output() errorChange = new EventEmitter<string>();
  @Output() statusChange = new EventEmitter<string>();

  roles: AdminRole[] = [];
  permissionsCatalog: PermissionCatalogItem[] = [];
  aclFolders: ReportFolder[] = [];
  aclReports: ReportDefinition[] = [];

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

  roleForm = {
    originalName: '',
    name: '',
    permissions: new Set<string>(),
  };

  ngOnInit(): void {
    this.loadPermissionData();
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasAnyRoleChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  filteredRoles(): AdminRole[] {
    const term = String(this.roleSearchTerm || '').trim().toLowerCase();
    if (!term) return this.roles;
    return this.roles.filter((role) => String(role.name || '').toLowerCase().includes(term));
  }

  trackRole = (_: number, r: AdminRole) => r.name;
  trackPermissionCatalog = (_: number, p: PermissionCatalogItem) => p.code;
  trackPermissionGroup = (_: number, group: PermissionGroup) => group.key;
  trackRoleAclFolder = (_: number, node: RoleAclNode) => node.id;
  trackRoleAclReport = (_: number, node: { id: string }) => node.id;

  sameRoleName(a: string, b: string): boolean {
    const normalize = (value: string) => String(value || '').trim().toUpperCase();
    return normalize(a) === normalize(b);
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
      this.setError('Selecione um perfil.');
      return;
    }
    if (this.isSelectedAdminProfile()) {
      this.setStatus('Perfil ADMIN possui acesso total gerenciado no backend.');
      return;
    }

    const hasPermissionChanges = this.hasSelectedRolePermissionChanges();
    const aclRequests = this.buildRoleAclRequests(role.name);
    if (!hasPermissionChanges && !aclRequests.length) {
      this.setStatus('Nenhuma alteração pendente.');
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
    this.setError('');
    this.setStatus('');
    forkJoin(requests).subscribe({
      next: () => {
        this.savingAllRoleChanges = false;
        this.setStatus(`Alterações do perfil "${role.name}" salvas.`);
        this.loadPermissionData();
      },
      error: (err) => {
        this.savingAllRoleChanges = false;
        this.setError(this.messageFromError(err, 'Falha ao salvar alterações do perfil.'));
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
        return { ...folderNode, reports };
      })
      .filter((node): node is RoleAclNode => !!node);
  }

  allowedReportsCount(folderNode: RoleAclNode): number {
    return folderNode.reports.reduce((count, reportNode) => count + (reportNode.allowed ? 1 : 0), 0);
  }

  deniedReportsCount(folderNode: RoleAclNode): number {
    return folderNode.reports.reduce((count, reportNode) => count + (!reportNode.allowed ? 1 : 0), 0);
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

  startCreateRole() {
    this.setError('');
    this.setStatus('');
    this.roleEditorOpen = true;
    this.roleEditorMode = 'create';
    this.roleForm = {
      originalName: '',
      name: '',
      permissions: new Set<string>(),
    };
  }

  startEditRole(roleName: string) {
    this.setError('');
    this.setStatus('');
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
        this.setError(this.messageFromError(err, 'Falha ao carregar role.'));
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
      this.setError('Informe o nome da role.');
      return;
    }

    const payload = {
      name,
      permissions: Array.from(this.roleForm.permissions),
    };

    this.roleSaving = true;
    this.setError('');
    this.setStatus('');

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
        this.setStatus(
          this.roleEditorMode === 'create'
            ? `Perfil "${saved.name}" criado.`
            : `Perfil "${saved.name}" atualizado.`
        );
        this.loadPermissionData();
      },
      error: (err) => {
        this.roleSaving = false;
        this.setError(this.messageFromError(err, 'Falha ao salvar perfil.'));
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
        this.setStatus(`Perfil "${roleName}" excluído.`);
        this.loadPermissionData();
      },
      error: (err) => {
        this.setError(this.messageFromError(err, 'Falha ao excluir perfil.'));
      },
    });
  }

  private loadPermissionData() {
    this.setError('');
    forkJoin({
      roles: this.api.listRoles(),
      permissionsCatalog: this.api.listPermissionsCatalog(),
      folders: this.reportApi.listFolders(),
      reports: this.reportApi.listReports(),
    }).subscribe({
      next: ({ roles, permissionsCatalog, folders, reports }) => {
        this.roles = roles || [];
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
        this.aclFolders = [...(folders || [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        this.aclReports = [...(reports || [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        if (this.selectedRoleName) {
          this.loadRoleAclTree();
        }
      },
      error: (err) => {
        this.setError(this.messageFromError(err, 'Falha ao carregar permissões e ACL.'));
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
    this.setError('');
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
        this.setError(this.messageFromError(err, 'Falha ao carregar ACL da role.'));
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

  private matchesAccessFilter(allowed: boolean): boolean {
    if (this.roleAclAccessFilter === 'ALL') return true;
    return this.roleAclAccessFilter === 'ALLOW' ? allowed : !allowed;
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

  private setError(message: string): void {
    this.errorChange.emit(message);
  }

  private setStatus(message: string): void {
    this.statusChange.emit(message);
  }
}
