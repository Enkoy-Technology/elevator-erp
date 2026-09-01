import { DocumentContentService } from './document-content.service';
import type { DocumentContentRepository } from './document-content.repository';
import type { AuthenticatedUser } from '../../types/auth.types';

const USER: AuthenticatedUser = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'SALES_MANAGER',
};

const section = (sectionKey: string, isActive: boolean) =>
  ({ sectionKey, isActive }) as never;

const serviceWith = (repository: Partial<DocumentContentRepository>) =>
  new DocumentContentService(repository as DocumentContentRepository);

describe('DocumentContentService', () => {
  it('takes the tenant from the authenticated user, never from the request body', async () => {
    const listBoilerplate = jest.fn().mockResolvedValue([]);
    const service = serviceWith({ listBoilerplate });

    await service.listBoilerplate(USER);

    expect(listBoilerplate).toHaveBeenCalledWith(USER.tenantId);
  });

  it('drops deactivated sections from the render list', async () => {
    // The admin screen shows every section so a deactivated one can be turned
    // back on; the rendered document must not print it.
    const listBoilerplate = jest
      .fn()
      .mockResolvedValue([
        section('standards', true),
        section('cabin_finishing', false),
        section('rescue_device', true),
      ]);
    const service = serviceWith({ listBoilerplate });

    const rendered = await service.listActiveBoilerplate(USER.tenantId);

    expect(rendered.map((row) => row.sectionKey)).toEqual([
      'standards',
      'rescue_device',
    ]);
  });

  it('passes the reorder id list straight through in order', async () => {
    const reorderComponents = jest.fn().mockResolvedValue([]);
    const service = serviceWith({ reorderComponents });
    const ids = ['b', 'a', 'c'];

    await service.reorderComponents(USER, { ids });

    expect(reorderComponents).toHaveBeenCalledWith(USER.tenantId, ids);
  });
});
