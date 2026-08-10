import { Injectable, NotFoundException } from '@nestjs/common';

import type { PaginatedResult } from '../../common/pagination';
import type { ProformaStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  ProformasRepository,
  type ProformaRecord,
} from './proformas.repository';

@Injectable()
export class ProformasService {
  constructor(private readonly proformasRepository: ProformasRepository) {}

  list(
    user: AuthenticatedUser,
    options: {
      projectId?: string;
      status?: ProformaStatus;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<ProformaRecord>> {
    return this.proformasRepository.list(user.tenantId, options);
  }

  streamAll(
    user: AuthenticatedUser,
    options: { projectId?: string; status?: ProformaStatus },
  ): AsyncGenerator<ProformaRecord> {
    return this.proformasRepository.streamAll(user.tenantId, options);
  }

  async getById(user: AuthenticatedUser, id: string): Promise<ProformaRecord> {
    const row = await this.proformasRepository.findById(user.tenantId, id);
    if (!row) {
      throw new NotFoundException('Proforma not found');
    }
    return row;
  }

  issueFromQuotation(
    user: AuthenticatedUser,
    quotationId: string,
    validUntil: string | undefined,
  ): Promise<ProformaRecord> {
    return this.proformasRepository.issue(
      user.tenantId,
      user.userId,
      quotationId,
      validUntil ?? null,
    );
  }

  /**
   * Append-only book: cancelling an ISSUED proforma does NOT revert the
   * source quotation back out of CONVERTED_TO_PROFORMA — that transition is
   * terminal (see quote-status.ts). A new quotation version is the recovery
   * path for "the deal actually changed," not un-cancelling this one.
   */
  cancel(
    user: AuthenticatedUser,
    id: string,
    reason: string,
  ): Promise<ProformaRecord> {
    return this.proformasRepository.cancel(user.tenantId, id, reason);
  }
}
