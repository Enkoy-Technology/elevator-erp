import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  allowedAssetMoves,
  canSkipAssetRules,
  PRE_SITE_STATUSES,
} from './asset-status';
import {
  AssetTrackingRepository,
  type StatusMove,
} from './asset-tracking.repository';
import type {
  AssetStatus,
  CorrectAssetStatusDto,
  MoveAssetDto,
  SetSoldToDto,
  UpdateChecklistItemDto,
} from './dto/asset.dto';

@Injectable()
export class AssetTrackingService {
  constructor(private readonly repository: AssetTrackingRepository) {}

  private async requireAsset(user: AuthenticatedUser, id: string) {
    const asset = await this.repository.findAsset(user.tenantId, id);
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  async getTracking(user: AuthenticatedUser, id: string) {
    const asset = await this.requireAsset(user, id);
    const [items, events] = await Promise.all([
      this.repository.listItems(user.tenantId, id),
      this.repository.listEvents(user.tenantId, id),
    ]);
    return {
      asset,
      items,
      events,
      nextMoves: allowedAssetMoves(asset.status, user.role),
    };
  }

  async move(user: AuthenticatedUser, id: string, dto: MoveAssetDto) {
    const asset = await this.requireAsset(user, id);
    if (!allowedAssetMoves(asset.status, user.role).includes(dto.to)) {
      throw new WorkflowTransitionError(
        `Cannot move this lift from ${asset.status} to ${dto.to}`,
      );
    }
    if (asset.status === 'CHECKING' && dto.to === 'IN_STORE') {
      const unmarked = await this.repository.countUnmarked(user.tenantId, id);
      if (unmarked > 0) {
        throw new WorkflowTransitionError(
          `${unmarked} ${unmarked === 1 ? 'part is' : 'parts are'} not marked yet`,
        );
      }
    }
    if (dto.to === 'AT_SITE' && !asset.customerId) {
      throw new WorkflowTransitionError(
        'Mark who this lift is sold to before it goes to site',
      );
    }
    return this.applyMove(user, id, asset.status, dto.to, 'STATUS', dto.note);
  }

  async correct(
    user: AuthenticatedUser,
    id: string,
    dto: CorrectAssetStatusDto,
  ) {
    const asset = await this.requireAsset(user, id);
    if (asset.status === dto.to) {
      throw new WorkflowTransitionError(`This lift is already ${dto.to}`);
    }
    return this.applyMove(
      user,
      id,
      asset.status,
      dto.to,
      'CORRECTED',
      dto.reason,
    );
  }

  private async applyMove(
    user: AuthenticatedUser,
    id: string,
    from: AssetStatus,
    to: AssetStatus,
    kind: StatusMove['kind'],
    note?: string,
  ) {
    const moved = await this.repository.moveStatus({
      tenantId: user.tenantId,
      assetId: id,
      from,
      to,
      kind,
      userId: user.userId,
      note,
    });
    if (!moved) {
      throw new WorkflowTransitionError(
        'Someone else moved this lift just now. Reload and try again.',
      );
    }
    return this.requireAsset(user, id);
  }

  async setSoldTo(user: AuthenticatedUser, id: string, dto: SetSoldToDto) {
    const asset = await this.requireAsset(user, id);
    if (
      !canSkipAssetRules(user.role) &&
      !PRE_SITE_STATUSES.includes(asset.status)
    ) {
      throw new WorkflowTransitionError(
        'This lift has left the store. Ask the General Manager to change who it is sold to.',
      );
    }
    // Contracts and breakdowns hold their own copy of the customer, and
    // maintenance records are never rewritten.
    if (await this.repository.hasMaintenanceRecords(user.tenantId, id)) {
      throw new WorkflowTransitionError(
        'This lift has a maintenance contract or breakdown, so who it is sold to cannot change.',
      );
    }
    const customerId = dto.customerId;
    const projectId = customerId ? (dto.projectId ?? null) : null;
    if (
      customerId &&
      !(await this.repository.findCustomer(user.tenantId, customerId))
    ) {
      throw new BadRequestException('Customer not found');
    }
    if (projectId) {
      const project = await this.repository.findProject(
        user.tenantId,
        projectId,
      );
      if (!project || project.customerId !== customerId) {
        throw new BadRequestException(
          'Project does not belong to the selected customer',
        );
      }
    }
    await this.repository.setSoldTo({
      tenantId: user.tenantId,
      assetId: id,
      customerId,
      projectId,
      userId: user.userId,
    });
    return this.requireAsset(user, id);
  }

  async updateItem(
    user: AuthenticatedUser,
    id: string,
    itemId: string,
    dto: UpdateChecklistItemDto,
  ) {
    await this.requireAsset(user, id);
    const item = await this.repository.updateItem(
      user.tenantId,
      id,
      itemId,
      dto,
      user.userId,
    );
    if (!item) {
      throw new NotFoundException('Checklist row not found');
    }
    return item;
  }

  async markCaseOk(user: AuthenticatedUser, id: string, caseNo: number) {
    await this.requireAsset(user, id);
    const marked = await this.repository.markCaseOk(
      user.tenantId,
      id,
      caseNo,
      user.userId,
    );
    return { marked };
  }
}
