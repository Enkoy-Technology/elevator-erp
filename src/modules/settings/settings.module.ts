import { Module } from '@nestjs/common';

import { DocumentContentController } from './document-content.controller';
import { DocumentContentRepository } from './document-content.repository';
import { DocumentContentService } from './document-content.service';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController, DocumentContentController],
  providers: [
    SettingsService,
    SettingsRepository,
    DocumentContentService,
    DocumentContentRepository,
  ],
  // DocumentContentService is exported so the document-rendering path can
  // read the tenant's sections and component table instead of each quotation
  // carrying its own pasted copy.
  exports: [SettingsService, DocumentContentService],
})
export class SettingsModule {}
