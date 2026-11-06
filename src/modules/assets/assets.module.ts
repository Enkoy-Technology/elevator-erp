import { Module } from '@nestjs/common';

import { AssetTrackingController } from './asset-tracking.controller';
import { AssetTrackingRepository } from './asset-tracking.repository';
import { AssetTrackingService } from './asset-tracking.service';
import { AssetsController } from './assets.controller';
import { AssetsRepository } from './assets.repository';
import { AssetsService } from './assets.service';

@Module({
  controllers: [AssetsController, AssetTrackingController],
  providers: [
    AssetsService,
    AssetsRepository,
    AssetTrackingService,
    AssetTrackingRepository,
  ],
  exports: [AssetsService],
})
export class AssetsModule {}
