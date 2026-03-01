import { Body, Controller, Get, Post } from '@nestjs/common';
import { createWorkspaceSchema } from '@suresend/shared';
import type { CreateWorkspace } from '@suresend/shared';
import { randomUUID } from 'node:crypto';
import { CreateWorkspaceDto } from './workspaces.dto';

const workspaceStore: Array<CreateWorkspace & { id: string; createdAt: string }> = [];

@Controller('workspaces')
export class WorkspacesController {
  @Get()
  listWorkspaces() {
    return workspaceStore;
  }

  @Post()
  createWorkspace(@Body() payload: CreateWorkspaceDto) {
    const validated = createWorkspaceSchema.parse(payload);
    const workspace = {
      ...validated,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    workspaceStore.push(workspace);
    return workspace;
  }
}
