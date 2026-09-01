import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { DocumentContentRepository } from './document-content.repository';

// Same fake-transaction approach as settings.repository.spec.ts: canned
// chains rather than a database, because what is worth pinning here is the
// order and shape of the writes, not that Postgres works.

type Row = Record<string, unknown>;

interface Chain {
  set: jest.Mock;
  where: jest.Mock;
  values: jest.Mock;
  from: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  returning: jest.Mock;
  then: (onFulfilled: (value: Row[]) => unknown) => Promise<unknown>;
}

/**
 * A drizzle-ish builder. Every chaining call returns itself; `then` makes it
 * awaitable, which the reorder loops rely on (they await an update that has
 * no `.returning()`).
 */
const chainOf = (rows: Row[]): Chain => {
  const chain = {} as Chain;
  const self = (): Chain => chain;
  chain.set = jest.fn(self);
  chain.where = jest.fn(self);
  chain.values = jest.fn(self);
  chain.from = jest.fn(self);
  chain.orderBy = jest.fn(self);
  chain.limit = jest.fn(() => Promise.resolve(rows));
  chain.returning = jest.fn(() => Promise.resolve(rows));
  chain.then = (onFulfilled) => Promise.resolve(rows).then(onFulfilled);
  return chain;
};

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface TxParts {
  selectRows?: Row[];
  insertRows?: Row[];
  updateRows?: Row[];
  deleteRows?: Row[];
  insertRejectsWith?: Error;
}

const repoWith = (parts: TxParts) => {
  const selectChain = chainOf(parts.selectRows ?? []);
  const insertChain = chainOf(parts.insertRows ?? []);
  const updateChain = chainOf(parts.updateRows ?? []);
  const deleteChain = chainOf(parts.deleteRows ?? []);
  const rejection = parts.insertRejectsWith;
  if (rejection !== undefined) {
    insertChain.returning = jest.fn(() => Promise.reject(rejection));
  }

  const tx = {
    select: jest.fn(() => selectChain),
    insert: jest.fn(() => insertChain),
    update: jest.fn(() => updateChain),
    delete: jest.fn(() => deleteChain),
  };
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  );
  const repo = new DocumentContentRepository({ withTenant } as never);
  return { repo, tx, selectChain, insertChain, updateChain, deleteChain };
};

const sequencesWritten = (chain: Chain): unknown[] =>
  (chain.set.mock.calls as [Row][]).map(([values]) => values.sequence);

describe('DocumentContentRepository', () => {
  describe('reorderComponents', () => {
    it('parks every row on a negative sequence before assigning the final one', async () => {
      // component_specifications has UNIQUE (tenant_id, sequence), checked per
      // statement — a single pass would collide the moment row 2 is renumbered
      // onto a position row 1 has not vacated yet.
      const { repo, tx, updateChain } = repoWith({
        selectRows: [{ id: ID_A }, { id: ID_B }],
      });

      await repo.reorderComponents(TENANT_ID, [ID_B, ID_A]);

      expect(tx.update).toHaveBeenCalledTimes(4);
      expect(sequencesWritten(updateChain)).toEqual([-1, -2, 1, 2]);
    });

    it('rejects an id list that does not name every row', async () => {
      const { repo } = repoWith({ selectRows: [{ id: ID_A }, { id: ID_B }] });

      await expect(repo.reorderComponents(TENANT_ID, [ID_A])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects duplicate ids', async () => {
      const { repo } = repoWith({ selectRows: [{ id: ID_A }, { id: ID_B }] });

      await expect(
        repo.reorderComponents(TENANT_ID, [ID_A, ID_A]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an id the tenant does not own', async () => {
      const { repo } = repoWith({ selectRows: [{ id: ID_A }] });

      await expect(repo.reorderComponents(TENANT_ID, [ID_B])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('reorderBoilerplate', () => {
    it('needs only one pass — sort_order carries no unique constraint', async () => {
      const { repo, tx, updateChain } = repoWith({
        selectRows: [{ id: ID_A }, { id: ID_B }],
      });

      await repo.reorderBoilerplate(TENANT_ID, [ID_B, ID_A]);

      expect(tx.update).toHaveBeenCalledTimes(2);
      expect((updateChain.set.mock.calls as [Row][]).map(([v]) => v.sortOrder)).toEqual([
        1, 2,
      ]);
    });
  });

  describe('create', () => {
    it('appends a component after the highest existing sequence', async () => {
      const { repo, insertChain } = repoWith({
        selectRows: [{ value: 20 }],
        insertRows: [{ id: ID_A }],
      });

      await repo.createComponent(TENANT_ID, { componentName: 'Door Machine' });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ sequence: 21, tenantId: TENANT_ID }),
      );
    });

    it('starts component numbering at 1 on an empty table', async () => {
      const { repo, insertChain } = repoWith({ selectRows: [], insertRows: [{ id: ID_A }] });

      await repo.createComponent(TENANT_ID, { componentName: 'Encoder' });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ sequence: 1 }),
      );
    });

    it('reports a duplicate section key as a conflict, not a 500', async () => {
      // A real pg unique violation is an Error carrying `.code`, which is
    // exactly what isUniqueViolation digs for.
    const { repo } = repoWith({
      insertRejectsWith: Object.assign(
        new Error('duplicate key value violates unique constraint'),
        { code: '23505' },
      ),
    });

      await expect(
        repo.createBoilerplate(TENANT_ID, { sectionKey: 'standards' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not swallow an unrelated database error', async () => {
      const boom = new Error('connection reset');
      const { repo } = repoWith({ insertRejectsWith: boom });

      await expect(
        repo.createBoilerplate(TENANT_ID, { sectionKey: 'standards' }),
      ).rejects.toBe(boom);
    });
  });

  describe('not found', () => {
    it('404s when a delete matches no row in this tenant', async () => {
      const { repo } = repoWith({ deleteRows: [] });

      await expect(repo.deleteComponent(TENANT_ID, ID_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s when deactivating a section that is not there', async () => {
      const { repo } = repoWith({ updateRows: [] });

      await expect(repo.deactivateBoilerplate(TENANT_ID, ID_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s when updating a section that is not there', async () => {
      const { repo } = repoWith({ updateRows: [] });

      await expect(
        repo.updateBoilerplate(TENANT_ID, ID_A, { title: 'Standards' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

});
