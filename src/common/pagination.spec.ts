import { normalizePageQuery, toPaginatedResult } from './pagination';

describe('pagination helpers', () => {
  it('defaults to page 1 and pageSize 10', () => {
    expect(normalizePageQuery()).toEqual({
      page: 1,
      pageSize: 10,
      offset: 0,
    });
  });

  it('clamps pageSize to 100 and page to >= 1', () => {
    expect(normalizePageQuery('0', '500')).toEqual({
      page: 1,
      pageSize: 100,
      offset: 0,
    });
  });

  it('computes totalPages', () => {
    expect(toPaginatedResult([1, 2], 45, 2, 20)).toEqual({
      items: [1, 2],
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
  });
});
