export type Workspace = {
  id: string;
  name: string;
  slug: string | null;
  active: boolean;
};

export type WorkspaceMembership = {
  workspace_id: string;
  role: string;
};

export type WorkspaceAccess = {
  workspaces: Workspace[];
  memberships: WorkspaceMembership[];
};
