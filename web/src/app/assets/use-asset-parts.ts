'use client';

import { useCallback, useRef, useState } from 'react';

import {
  ApiError,
  getAssetTracking,
  markChecklistCase,
  updateChecklistItem,
  type AssetChecklistItem,
  type ChecklistMark,
} from '@/lib/api';
import {
  restoreRows,
  withCaseMark,
  withMark,
  withoutFailures,
  withSaveState,
  type RowSaveStates,
} from '@/lib/asset-checklist';
import type { SaveItem } from './parts-checklist';

/**
 * The parts of a saved lift. Each tick saves alone and at once, so a power cut
 * loses one tick at most.
 */
export const useAssetParts = (assetId: string) => {
  const [items, setItems] = useState<AssetChecklistItem[]>([]);
  /** Only these cases wait: a save in one must not lock the rest of the list. */
  const [savingCases, setSavingCases] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  /** Kept here because closing a case unmounts its rows, and a failure must outlive that. */
  const [saveStates, setSaveStates] = useState<RowSaveStates>({});
  /** Rows with a tick on its way, so a second tap cannot race the first. */
  const marking = useRef(new Set<string>());
  /** Moves on with every save, so a reply older than a tick can be told apart. */
  const saves = useRef(0);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    // One at a time on a slow line. The one running goes again if a save moved
    // on under it, so a reply thrown away is never the last word.
    if (refreshing.current) {
      return;
    }
    refreshing.current = true;
    try {
      for (;;) {
        const sentAt = saves.current;
        const { items: fresh } = await getAssetTracking(
          assetId,
          AbortSignal.timeout(15_000),
        );
        if (saves.current === sentAt) {
          setItems(fresh);
          return;
        }
      }
    } finally {
      refreshing.current = false;
    }
  }, [assetId]);

  const saveItem: SaveItem = async (item, patch) => {
    if (patch.mark) {
      if (marking.current.has(item.id)) {
        return true;
      }
      marking.current.add(item.id);
      setItems((rows) => withMark(rows, item.id, patch.mark ?? item.mark));
    }
    saves.current += 1;
    setError(null);
    setSaveStates((states) => withSaveState(states, item.id, 'saving'));
    let saved = false;
    try {
      await updateChecklistItem(assetId, item.id, patch);
      setItems((rows) =>
        rows.map((row) => (row.id === item.id ? { ...row, ...patch } : row)),
      );
      setSaveStates((states) => withSaveState(states, item.id, null));
      saved = true;
    } catch {
      if (patch.mark) {
        setItems((rows) => withMark(rows, item.id, item.mark));
      }
      setSaveStates((states) => withSaveState(states, item.id, 'failed'));
    } finally {
      saves.current += 1;
      if (patch.mark) {
        marking.current.delete(item.id);
      }
    }
    if (!saved) {
      // The save may have landed and only its reply been lost: show what the
      // server holds, if it can be reached at all.
      void refresh().catch(() => undefined);
    }
    return saved;
  };

  const markCase = async (caseNo: number, mark: ChecklistMark) => {
    const before = items.filter((item) => item.caseNo === caseNo);
    saves.current += 1;
    setSavingCases((cases) => new Set(cases).add(caseNo));
    setError(null);
    setItems((rows) => withCaseMark(rows, caseNo, mark));
    try {
      await markChecklistCase(assetId, caseNo, mark);
      setSaveStates((states) =>
        withoutFailures(
          states,
          before.map((item) => item.id),
        ),
      );
    } catch (err) {
      setItems((rows) => restoreRows(rows, before));
      setError(
        err instanceof ApiError ? err.message : 'That case could not be saved.',
      );
    } finally {
      saves.current += 1;
      setSavingCases((cases) => {
        const next = new Set(cases);
        next.delete(caseNo);
        return next;
      });
    }
    // A row ticked by someone else meanwhile, or a save that lost its reply.
    await refresh().catch(() => undefined);
  };

  return { items, setItems, savingCases, error, saveStates, saveItem, markCase };
};
