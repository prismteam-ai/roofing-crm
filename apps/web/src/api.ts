import { createApiClient, getOrCreateWorkspaceId } from '@roofing/api-client';

export const workspaceId = getOrCreateWorkspaceId(localStorage);
export const api = createApiClient({ workspaceId });
