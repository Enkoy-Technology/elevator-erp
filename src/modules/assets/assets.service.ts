import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import { withArrivedMarks } from './arrival-checklist';
import {
  AssetsRepository,
  type AssetExportRow,
  type AssetFilters,
} from './assets.repository';
import type { CreateAssetDto, UpdateAssetDto } from './dto/asset.dto';

@Injectable()
export class AssetsService {
  constructor(private readonly assetsRepository: AssetsRepository) {}

  list(
    user: AuthenticatedUser,
    options: AssetFilters & { page?: string; pageSize?: string },
  ) {
    return this.assetsRepository.list(user.tenantId, options);
  }

  streamAll(
    user: AuthenticatedUser,
    options: AssetFilters,
  ): AsyncGenerator<AssetExportRow> {
    return this.assetsRepository.streamAll(user.tenantId, options);
  }

  async getById(user: AuthenticatedUser, id: string) {
    const asset = await this.assetsRepository.findById(user.tenantId, id);
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  async create(user: AuthenticatedUser, dto: CreateAssetDto) {
    if (dto.startingPoint === 'FROM_FACTORY') {
      if (dto.customerId || dto.projectId) {
        throw new BadRequestException(
          'A lift from the factory starts in stock. Sales records the sale afterwards.',
        );
      }
      const usesList =
        dto.category === 'ELEVATOR' && dto.usePackingList !== false;
      return this.assetsRepository.create(user.tenantId, user.userId, dto, {
        status: 'ON_ORDER',
        checklist: usesList ? withArrivedMarks(dto.missingParts) : [],
      });
    }
    if (user.role === 'STORE_KEEPER') {
      throw new ForbiddenException(
        'A Store Keeper registers lifts from the factory only.',
      );
    }
    if (!dto.customerId) {
      throw new BadRequestException(
        'Choose the customer for an installed lift.',
      );
    }
    return this.assetsRepository.create(user.tenantId, user.userId, dto, {
      status: 'ACTIVE',
      checklist: [],
    });
  }

  update(user: AuthenticatedUser, id: string, dto: UpdateAssetDto) {
    return this.assetsRepository.update(user.tenantId, id, dto);
  }

  softDelete(user: AuthenticatedUser, id: string) {
    return this.assetsRepository.softDelete(user.tenantId, id, user.userId);
  }
}
