import { Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import {
  CrewsRepository,
  type CrewMemberRecord,
  type CrewRecord,
} from './crews.repository';
import type { CreateCrewDto } from './dto/create-crew.dto';

@Injectable()
export class CrewsService {
  constructor(private readonly crewsRepository: CrewsRepository) {}

  list(
    user: AuthenticatedUser,
    options: { page?: string; pageSize?: string; activeOnly?: boolean },
  ) {
    return this.crewsRepository.list(user.tenantId, options);
  }

  async getById(
    user: AuthenticatedUser,
    id: string,
  ): Promise<CrewRecord & { members: CrewMemberRecord[] }> {
    const crew = await this.crewsRepository.findById(user.tenantId, id);
    if (!crew) {
      throw new NotFoundException('Crew not found');
    }
    const members = await this.crewsRepository.listMembers(
      user.tenantId,
      id,
    );
    return { ...crew, members };
  }

  create(user: AuthenticatedUser, dto: CreateCrewDto): Promise<CrewRecord> {
    return this.crewsRepository.create(user.tenantId, dto);
  }

  async addMember(
    user: AuthenticatedUser,
    crewId: string,
    memberUserId: string,
    isLead: boolean,
  ): Promise<CrewMemberRecord> {
    await this.getById(user, crewId);
    return this.crewsRepository.addMember(
      user.tenantId,
      crewId,
      memberUserId,
      isLead,
    );
  }

  async removeMember(
    user: AuthenticatedUser,
    crewId: string,
    memberUserId: string,
  ): Promise<void> {
    await this.getById(user, crewId);
    return this.crewsRepository.removeMember(
      user.tenantId,
      crewId,
      memberUserId,
    );
  }
}
