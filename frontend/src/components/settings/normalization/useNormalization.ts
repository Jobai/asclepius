import { updateNormalizationCache } from "@/hooks/data";
import { useTranslation } from "react-i18next";
import { sortTerms } from "@/lib/terminology";
import {
  message,
  termMessage,
  type TermMessage,
  type UiMessage,
} from "@/i18n/messages";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import { useConfirm } from "@/contexts/ConfirmContext";
import { buildBulkConfirm, shouldConfirmBulk } from "@/lib/confirmBulk";
import { useToast } from "@/contexts/ToastContext";
import {
  DEFAULT_NORM,
  isNormType,
  type NormItem,
  type NormType,
} from "./types";
import { type AutoMergeProposal } from "./AutoMergePanel";

/**
 * Owns the data/merge orchestration the NormalizationTab renders: the
 * canonical-entry list, the open-row detail, edit/alias/merge/batch-merge
 * state, the auto-merge proposals, and the linked-documents modal state —
 * along with every handler that mutates them. Extracted verbatim from the
 * tab; the same state, effects, endpoints, confirm/toast behaviour, and
 * effect deps. The tab consumes exactly what it computed before.
 */
export function useNormalization() {
  const { i18n } = useTranslation();
  const confirm = useConfirm();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  // Pathname shape: /settings/analysis/normalization/<normType>
  const segments = location.pathname.split("/").filter(Boolean);
  const normType: NormType = isNormType(segments[3])
    ? (segments[3] as NormType)
    : DEFAULT_NORM;
  const setNormType = (v: string) => {
    navigate(`/settings/analysis/normalization/${v}`, { replace: false });
  };

  const [normItems, setNormItems] = useState<NormItem[]>([]);
  const [normFilter, setNormFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [editCode, setEditCode] = useState("");
  const [editDisplay, setEditDisplay] = useState("");
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<UiMessage | null>(null);

  const [newAlias, setNewAlias] = useState("");
  const [newAliasLang, setNewAliasLang] = useState("");

  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [showMergeFor, setShowMergeFor] = useState<number | null>(null);
  const [rowNewDisplay, setRowNewDisplay] = useState("");
  const [rowNewCode, setRowNewCode] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchTargetId, setBatchTargetId] = useState<number | null>(null);
  const [batchNewDisplay, setBatchNewDisplay] = useState("");
  const [batchNewCode, setBatchNewCode] = useState("");

  const [linkedDocs, setLinkedDocs] = useState<any[] | null>(null);
  const [linkedDocsFor, setLinkedDocsFor] = useState<{
    id: number;
    name: string | TermMessage;
  } | null>(null);
  const [linkedLoading, setLinkedLoading] = useState(false);

  const [autoMergeLoading, setAutoMergeLoading] = useState(false);
  const [autoMergeProposals, setAutoMergeProposals] = useState<
    AutoMergeProposal[] | null
  >(null);
  const [autoMergeEntries, setAutoMergeEntries] = useState<any[]>([]);

  const loadList = useCallback(() => {
    const params: Record<string, any> = {};
    if (normFilter) params.filter = normFilter;
    if (searchQuery) params.search = searchQuery;
    api.get(`/normalization/${normType}`, { params }).then((res: any) => {
      setNormItems(Array.isArray(res.data) ? res.data : []);
    });
  }, [normType, normFilter, searchQuery]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Clear selection and any open detail when switching entity type or filters.
  useEffect(() => {
    setSelectedIds(new Set());
    setBatchTargetId(null);
    setExpandedId(null);
    setDetail(null);
  }, [normType, normFilter, searchQuery]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === normItems.length && normItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(normItems.map((i) => i.id)));
    }
  };

  const handleBatchMerge = async () => {
    if (selectedIds.size === 0) return;
    let payload: any;
    let sources: number[];
    let label: UiMessage;
    if (batchTargetId === -1) {
      if (!batchNewDisplay.trim()) {
        toast({
          title: message("feedback.displayNameIsRequiredForANewTarget"),
          variant: "warning",
        });
        return;
      }
      sources = Array.from(selectedIds);
      label = message("settings:features.extra.newTarget", {
        name: batchNewDisplay.trim(),
      });
      payload = {
        source_ids: sources,
        new_target: {
          canonical_code: batchNewCode.trim(),
          canonical_display: batchNewDisplay.trim(),
        },
      };
    } else if (batchTargetId) {
      sources = Array.from(selectedIds).filter((id) => id !== batchTargetId);
      if (sources.length === 0) return;
      label = message("settings:features.extra.selectedTarget");
      payload = { source_ids: sources, target_id: batchTargetId };
    } else {
      return;
    }

    const ok = await confirm({
      title: message("feedback.mergeEntries", {
        value0: String(sources.length),
      }),
      description: message(
        "feedback.aliasesAndReferencesWillBeMovedIntoAndTheSource",
        { value0: label },
      ),
      confirmText: message("feedback.merge"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await api.post(`/normalization/${normType}/merge-batch`, payload);
    } catch (err: any) {
      const d = getErrorMessage(err, message("feedback.mergeFailed"));
      toast({
        title: message("feedback.mergeFailed"),
        description: d,
        variant: "error",
      });
      return;
    }
    setSelectedIds(new Set());
    setBatchTargetId(null);
    setBatchNewDisplay("");
    setBatchNewCode("");
    setExpandedId(null);
    setDetail(null);
    loadList();
  };

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setEditing(false);
      return;
    }
    setExpandedId(id);
    setEditing(false);
    setShowMergeFor(null);
    const res = await api.get(`/normalization/${normType}/${id}`);
    setDetail(res.data);
    setEditCode(res.data.canonical_code || "");
    setEditDisplay(res.data.canonical_display || "");
  };

  const handleSaveEdit = async () => {
    if (!expandedId) return;
    setSaveError(null);
    try {
      await api.patch(`/normalization/${normType}/${expandedId}`, {
        canonical_code: editCode,
        canonical_display: editDisplay,
      });
      setEditing(false);
      const res = await api.get(`/normalization/${normType}/${expandedId}`);
      setDetail(res.data);
      loadList();
    } catch (err: any) {
      const d = getErrorMessage(err, message("feedback.saveFailed"));
      setSaveError(d);
    }
  };

  const handleViewDocuments = async (
    id: number,
    name: string | TermMessage,
  ) => {
    setLinkedDocsFor({ id, name });
    setLinkedDocs(null);
    setLinkedLoading(true);
    try {
      const res = await api.get(`/normalization/${normType}/${id}/documents`);
      setLinkedDocs(Array.isArray(res.data) ? res.data : []);
    } catch {
      setLinkedDocs([]);
    } finally {
      setLinkedLoading(false);
    }
  };

  const closeLinkedDocs = () => {
    setLinkedDocsFor(null);
    setLinkedDocs(null);
  };

  const handleAutoMerge = async () => {
    setAutoMergeLoading(true);
    setAutoMergeProposals(null);
    try {
      const res = await api.post(`/normalization/${normType}/auto-merge`);
      setAutoMergeProposals(
        Array.isArray(res.data?.proposals) ? res.data.proposals : [],
      );
      setAutoMergeEntries(
        Array.isArray(res.data?.entries) ? res.data.entries : [],
      );
    } catch (err: any) {
      const d = getErrorMessage(err, message("errors:unexpected"));
      toast({
        title: message("feedback.autoMergeFailed"),
        description: d,
        variant: "error",
      });
    } finally {
      setAutoMergeLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string | TermMessage) => {
    const ok = await confirm({
      title: message("feedback.delete", {
        value0: name,
      }),
      description: message(
        "feedback.referencesFromDocumentsEncountersImagingAndLabResultsWillBe",
      ),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await api.delete(`/normalization/${normType}/${id}`);
    } catch (err: any) {
      const d = getErrorMessage(err, message("feedback.deleteFailed"));
      toast({
        title: message("feedback.deleteFailed"),
        description: d,
        variant: "error",
      });
      return;
    }
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
    }
    closeLinkedDocs();
    loadList();
  };

  const applyProposal = async (proposal: AutoMergeProposal) => {
    const sources = proposal.source_ids.filter(
      (id) => id !== proposal.target_id,
    );
    if (sources.length === 0) return;
    if (shouldConfirmBulk(sources.length)) {
      const targetEntry = autoMergeEntries.find(
        (e: any) => e.id === proposal.target_id,
      );
      const targetLabel = termMessage(targetEntry, `#${proposal.target_id}`);
      const ok = await confirm(
        buildBulkConfirm({
          count: sources.length,
          action: "merge",
          targetLabel,
          description: message(
            "feedback.aliasesAndReferencesWillBeMovedIntoTheTargetAnd",
          ),
          confirmText: message("feedback.merge"),
          variant: "destructive",
        }),
      );
      if (!ok) return;
    }
    await api.post(`/normalization/${normType}/merge-batch`, {
      source_ids: sources,
      target_id: proposal.target_id,
    });
    setAutoMergeProposals(
      (prev) => prev?.filter((p) => p !== proposal) ?? null,
    );
    loadList();
  };

  const updateProposalTarget = (idx: number, newTargetId: number) => {
    setAutoMergeProposals((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const cur = next[idx];
      next[idx] = {
        ...cur,
        target_id: newTargetId,
        source_ids: cur.source_ids
          .filter((s) => s !== newTargetId)
          .concat(cur.target_id !== newTargetId ? [cur.target_id] : []),
      };
      return next;
    });
  };

  const toggleProposalSource = (idx: number, sourceId: number) => {
    setAutoMergeProposals((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const cur = next[idx];
      const has = cur.source_ids.includes(sourceId);
      next[idx] = {
        ...cur,
        source_ids: has
          ? cur.source_ids.filter((s) => s !== sourceId)
          : [...cur.source_ids, sourceId],
      };
      return next;
    });
  };

  const handleAddAlias = async () => {
    if (!expandedId || !newAlias.trim()) return;
    const res = await api.post(
      `/normalization/${normType}/${expandedId}/aliases`,
      {
        alias: newAlias.trim(),
        language: newAliasLang.trim() || null,
      },
    );
    setDetail(res.data);
    setNewAlias("");
    setNewAliasLang("");
    loadList();
  };

  const handleDeleteAlias = async (aliasId: number) => {
    const ok = await confirm({
      title: message("feedback.deleteThisAlias"),
      variant: "destructive",
    });
    if (!ok) return;
    await api.delete(`/normalization/${normType}/aliases/${aliasId}`);
    if (expandedId) {
      const res = await api.get(`/normalization/${normType}/${expandedId}`);
      setDetail(res.data);
    }
    loadList();
  };

  const handleConfirmAll = async (id: number) => {
    await api.post(`/normalization/${normType}/${id}/confirm`);
    if (expandedId === id) {
      const res = await api.get(`/normalization/${normType}/${id}`);
      setDetail(res.data);
    }
    loadList();
  };

  const handleMerge = async (sourceId: number, targetId: number) => {
    let payload: any;
    let label: UiMessage;
    if (targetId === -1) {
      if (!rowNewDisplay.trim()) {
        toast({
          title: message("feedback.displayNameIsRequiredForANewTarget"),
          variant: "warning",
        });
        return;
      }
      label = message("settings:features.extra.newTarget", {
        name: rowNewDisplay.trim(),
      });
      payload = {
        source_ids: [sourceId],
        new_target: {
          canonical_code: rowNewCode.trim(),
          canonical_display: rowNewDisplay.trim(),
        },
      };
    } else {
      label = message("settings:features.extra.target");
      payload = { source_ids: [sourceId], target_id: targetId };
    }
    const ok = await confirm({
      title: message("feedback.mergeThisEntry"),
      description: message(
        "feedback.allAliasesAndReferencesWillBeMovedIntoAndThe",
        { value0: label },
      ),
      confirmText: message("feedback.merge"),
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await api.post(`/normalization/${normType}/merge-batch`, payload);
    } catch (err: any) {
      const d = getErrorMessage(err, message("feedback.mergeFailed"));
      toast({
        title: message("feedback.mergeFailed"),
        description: d,
        variant: "error",
      });
      return;
    }
    setExpandedId(null);
    setDetail(null);
    setShowMergeFor(null);
    setMergeTargetId(null);
    setRowNewDisplay("");
    setRowNewCode("");
    loadList();
  };

  const handleDisplayNamesSaved = (updated: NormItem) => {
    updateNormalizationCache(normType, updated);
    setDetail(updated);
    setNormItems((items) =>
      items.map((item) =>
        item.id === updated.id ? { ...item, ...updated } : item,
      ),
    );
  };

  const localizedItems = useMemo(
    () => sortTerms(normItems),
    [normItems, i18n.resolvedLanguage],
  );

  return {
    handleDisplayNamesSaved,
    normType,
    setNormType,
    normItems: localizedItems,
    normFilter,
    setNormFilter,
    searchQuery,
    searchInput,
    setSearchInput,
    setSearchQuery,
    expandedId,
    detail,
    editCode,
    setEditCode,
    editDisplay,
    setEditDisplay,
    editing,
    setEditing,
    saveError,
    setSaveError,
    newAlias,
    setNewAlias,
    newAliasLang,
    setNewAliasLang,
    mergeTargetId,
    setMergeTargetId,
    showMergeFor,
    setShowMergeFor,
    rowNewDisplay,
    setRowNewDisplay,
    rowNewCode,
    setRowNewCode,
    selectedIds,
    setSelectedIds,
    batchTargetId,
    setBatchTargetId,
    batchNewDisplay,
    setBatchNewDisplay,
    batchNewCode,
    setBatchNewCode,
    linkedDocs,
    linkedDocsFor,
    linkedLoading,
    autoMergeLoading,
    autoMergeProposals,
    setAutoMergeProposals,
    autoMergeEntries,
    toggleSelect,
    toggleSelectAll,
    handleBatchMerge,
    toggleExpand,
    handleSaveEdit,
    handleViewDocuments,
    closeLinkedDocs,
    handleAutoMerge,
    handleDelete,
    applyProposal,
    updateProposalTarget,
    toggleProposalSource,
    handleAddAlias,
    handleDeleteAlias,
    handleConfirmAll,
    handleMerge,
  };
}
