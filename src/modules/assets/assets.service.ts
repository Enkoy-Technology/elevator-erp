import { Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import { AssetsRepository } from './assets.repository';
import type {
  AssetCategory,
  CreateAssetDto,
  UpdateAssetDto,
} from './dto/asset.dto';

@Injectable()
export class AssetsService {
  constructor(private readonly assetsRepository: AssetsRepository) {}

  list(
    user: AuthenticatedUser,
    options: {
      search?: string;
      category?: AssetCategory;
      customerId?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    return this.assetsRepository.list(user.tenantId, options);
  }

  async getById(user: AuthenticatedUser, id: string) {
    const asset = await this.assetsRepository.findById(user.tenantId, id);
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  create(user: AuthenticatedUser, dto: CreateAssetDto) {
    return this.assetsRepository.create(user.tenantId, user.userId, dto);
  }

  update(user: AuthenticatedUser, id: string, dto: UpdateAssetDto) {
    return this.assetsRepository.update(user.tenantId, id, dto);
  }

  softDelete(user: AuthenticatedUser, id: string) {
    return this.assetsRepository.softDelete(user.tenantId, id);
  }
}
