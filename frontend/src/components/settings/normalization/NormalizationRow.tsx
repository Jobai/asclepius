import { Trans as FeatureTrans } from "react-i18next";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useMessage, type UiMessage } from "@/i18n/messages";
import React from "react";
import {
  Check,
  ChevronRight,
  Edit3,
  FileText,
  GitMerge,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Combobox from "@/components/ui/Combobox";
import IconButton from "@/components/ui/IconButton";
import Input from "@/components/ui/Input";
import type { NormItem } from "./types";

export interface NormalizationRowProps {
  item: NormItem;
  normItems: NormItem[];
  /** Detail payload from /normalization/<type>/<id>; only populated when expanded. */
  detail: any;
  expanded: boolean;
  editing: boolean;
  editCode: string;
  editDisplay: string;
  saveError: UiMessage | null;
  newAlias: string;
  newAliasLang: string;
  showMerge: boolean;
  mergeTargetId: number | null;
  rowNewDisplay: string;
  rowNewCode: string;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onViewDocuments: () => void;
  onToggleMerge: () => void;
  onCancelMerge: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditCodeChange: (v: string) => void;
  onEditDisplayChange: (v: string) => void;
  onSaveEdit: () => void;
  onNewAliasChange: (v: string) => void;
  onNewAliasLangChange: (v: string) => void;
  onAddAlias: () => void;
  onDeleteAlias: (aliasId: number) => void;
  onConfirmAll: () => void;
  onMergeTargetChange: (id: number | null) => void;
  onRowNewDisplayChange: (v: string) => void;
  onRowNewCodeChange: (v: string) => void;
  onMerge: () => void;
}

/** Row actions (documents / merge / delete), shared between table row and card. */
function RowActions({
  onViewDocuments,
  onToggleMerge,
  onDelete,
}: Pick<
  NormalizationRowProps,
  "onViewDocuments" | "onToggleMerge" | "onDelete"
>) {
  const { t: tx } = useFeatureTranslation([
    "common",
    "auth",
    "documents",
    "patients",
    "clinical",
    "settings",
    "share",
    "errors",
  ]);
  return (
    <div className="flex gap-1">
      <IconButton
        size="sm"
        variant="secondary"
        label={tx(
          "settings:features.normalizationRow.showDocumentsThatReferenceThisEntry",
        )}
        onClick={onViewDocuments}
      >
        <FileText className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        size="sm"
        variant="secondary"
        label={tx("settings:features.normalizationRow.mergeIntoAnotherEntry")}
        onClick={onToggleMerge}
      >
        <GitMerge className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton
        size="sm"
        variant="danger"
        label={tx("settings:features.normalizationRow.deleteThisEntry")}
        onClick={onDelete}
        className="border"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}

/** "Merge X into ..." form, shared between the table's merge row and the card. */
function MergeForm({
  item,
  normItems,
  mergeTargetId,
  rowNewDisplay,
  rowNewCode,
  onMergeTargetChange,
  onRowNewDisplayChange,
  onRowNewCodeChange,
  onMerge,
  onCancelMerge,
}: Pick<
  NormalizationRowProps,
  | "item"
  | "normItems"
  | "mergeTargetId"
  | "rowNewDisplay"
  | "rowNewCode"
  | "onMergeTargetChange"
  | "onRowNewDisplayChange"
  | "onRowNewCodeChange"
  | "onMerge"
  | "onCancelMerge"
>) {
  const { t: tx } = useFeatureTranslation([
    "common",
    "auth",
    "documents",
    "patients",
    "clinical",
    "settings",
    "share",
    "errors",
  ]);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
        <span className="text-muted-foreground">
          <FeatureTrans
            ns="settings"
            i18nKey="features.normalizationRow.mergePart0Part0Into"
            components={{ part0: <strong /> }}
            values={{ value0: item.canonical_display }}
          />
        </span>
        <div className="w-full md:w-auto md:min-w-[240px] md:max-w-xs">
          <Combobox
            value={mergeTargetId === null ? null : String(mergeTargetId)}
            onChange={(v) => onMergeTargetChange(v === null ? null : Number(v))}
            placeholder={tx("settings:features.normalizationRow.selectTarget")}
            title={tx("settings:features.batchMergeBar.mergeInto")}
            pinnedOptions={[
              {
                value: "-1",
                label: tx("settings:features.batchMergeBar.createNewEntry"),
              },
            ]}
            options={normItems
              .filter((n) => n.id !== item.id)
              .map((n) => ({
                value: String(n.id),
                label: n.canonical_display,
                hint: n.canonical_code || undefined,
              }))}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={onMerge}
            disabled={
              !mergeTargetId || (mergeTargetId === -1 && !rowNewDisplay.trim())
            }
          >
            {tx("common:feedback.merge")}
          </Button>
          <Button size="sm" variant="secondary" onClick={onCancelMerge}>
            {tx("common:feedback.cancel")}
          </Button>
        </div>
      </div>
      {mergeTargetId === -1 && (
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:pl-1">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground md:flex-row md:items-center md:gap-1.5">
            {tx("settings:features.backupTab.name")}{" "}
            <Input
              value={rowNewDisplay}
              onChange={(e) => onRowNewDisplayChange(e.target.value)}
              placeholder={tx(
                "settings:features.batchMergeBar.displayNameForTheNewEntry",
              )}
              className="md:w-64"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground md:flex-row md:items-center md:gap-1.5">
            {tx("settings:features.batchMergeBar.code")}{" "}
            <span className="text-[10px]">
              {tx("settings:features.normalizationRow.optional")}
            </span>
            <Input
              value={rowNewCode}
              onChange={(e) => onRowNewCodeChange(e.target.value)}
              placeholder={tx("settings:features.batchMergeBar.auto")}
              className="font-mono md:w-40"
            />
          </label>
        </div>
      )}
    </div>
  );
}

/** Expanded content (canonical-entry edit form + alias management), shared
 *  between the table's detail row and the card. */
function ExpandedDetail({
  item,
  detail,
  editing,
  editCode,
  editDisplay,
  saveError,
  newAlias,
  newAliasLang,
  onStartEdit,
  onCancelEdit,
  onEditCodeChange,
  onEditDisplayChange,
  onSaveEdit,
  onNewAliasChange,
  onNewAliasLangChange,
  onAddAlias,
  onDeleteAlias,
  onConfirmAll,
}: Pick<
  NormalizationRowProps,
  | "item"
  | "detail"
  | "editing"
  | "editCode"
  | "editDisplay"
  | "saveError"
  | "newAlias"
  | "newAliasLang"
  | "onStartEdit"
  | "onCancelEdit"
  | "onEditCodeChange"
  | "onEditDisplayChange"
  | "onSaveEdit"
  | "onNewAliasChange"
  | "onNewAliasLangChange"
  | "onAddAlias"
  | "onDeleteAlias"
  | "onConfirmAll"
>) {
  const { t: tx } = useFeatureTranslation([
    "common",
    "auth",
    "documents",
    "patients",
    "clinical",
    "settings",
    "share",
    "errors",
  ]);
  const renderMessage = useMessage();
  return (
    <div className="space-y-4 max-w-2xl">
      {/* Canonical Entry */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">
            {tx("settings:features.normalizationRow.canonicalEntry")}
          </h4>
          {!editing && (
            <Button size="sm" variant="secondary" onClick={onStartEdit}>
              <Edit3 className="h-3 w-3" />{" "}
              {tx("settings:features.normalizationRow.edit")}{" "}
            </Button>
          )}
        </div>
        {editing ? (
          <div className="grid gap-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  {tx("settings:features.batchMergeBar.code")}
                </span>
                <Input
                  value={editCode}
                  onChange={(e) => onEditCodeChange(e.target.value)}
                  className="font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  {tx("settings:features.normalizationRow.displayName")}
                </span>
                <Input
                  value={editDisplay}
                  onChange={(e) => onEditDisplayChange(e.target.value)}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onSaveEdit}>
                <Save className="h-3 w-3" /> {tx("common:actions.save")}{" "}
              </Button>
              <Button size="sm" variant="secondary" onClick={onCancelEdit}>
                {tx("common:feedback.cancel")}
              </Button>
            </div>
            {saveError && (
              <p className="text-xs text-destructive">
                {renderMessage(saveError ?? undefined)}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1 text-sm md:flex-row md:gap-4">
            <span className="text-muted-foreground">
              <FeatureTrans
                ns="settings"
                i18nKey="features.normalizationRow.codePart0Part0"
                components={{
                  part0: <span className="font-mono text-foreground" />,
                }}
                values={{ value0: detail.canonical_code }}
              />
            </span>
            <span className="text-muted-foreground">
              <FeatureTrans
                ns="settings"
                i18nKey="features.normalizationRow.namePart0Part0"
                components={{
                  part0: <span className="font-medium text-foreground" />,
                }}
                values={{ value0: detail.canonical_display }}
              />
            </span>
          </div>
        )}
      </div>

      {/* Aliases */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">
            {tx("settings:features.normalizationRow.aliases")}
            {detail.aliases?.length || 0})
            {(item.unreviewed_count ?? 0) > 0 && (
              <Badge variant="warning" size="sm" className="ml-2">
                {tx("settings:features.normalizationRow.unreviewed", {
                  value0: item.unreviewed_count,
                })}
              </Badge>
            )}
          </h4>
          {(item.unreviewed_count ?? 0) > 0 && (
            <Button
              size="sm"
              onClick={onConfirmAll}
              title={tx(
                "settings:features.normalizationRow.acceptEveryAutoMappedAliasListedBelowAs",
              )}
            >
              <Check className="h-3 w-3" />{" "}
              {tx("settings:features.normalizationRow.confirmAll")}{" "}
            </Button>
          )}
        </div>
        {detail.aliases?.length > 0 ? (
          <div className="rounded-md border divide-y max-h-[300px] overflow-y-auto">
            {detail.aliases.map((a: any) => (
              <div
                key={a.id}
                className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent/20"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{a.alias}</span>
                  {a.language && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase flex-shrink-0">
                      {a.language}
                    </span>
                  )}
                  {a.auto_mapped === 1 && (
                    <Badge
                      variant="warning"
                      size="sm"
                      className="flex-shrink-0"
                    >
                      {tx("settings:features.batchMergeBar.auto")}
                    </Badge>
                  )}
                </div>
                <IconButton
                  size="sm"
                  variant="danger"
                  label={tx("settings:features.normalizationRow.deleteAlias")}
                  onClick={() => onDeleteAlias(a.id)}
                  className="ml-2 flex-shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {tx("settings:features.normalizationRow.noAliasesYet")}
          </p>
        )}

        <div className="flex flex-wrap gap-2 items-end">
          <label className="space-y-1 w-full md:w-auto md:flex-1">
            <span className="text-xs text-muted-foreground">
              {tx("settings:features.normalizationRow.newAlias")}
            </span>
            <Input
              value={newAlias}
              onChange={(e) => onNewAliasChange(e.target.value)}
              placeholder={tx(
                "settings:features.normalizationRow.eGEmocromoCbc",
              )}
              onKeyDown={(e) => e.key === "Enter" && onAddAlias()}
            />
          </label>
          <label className="space-y-1 w-24 flex-1 md:flex-none md:w-20">
            <span className="text-xs text-muted-foreground">
              {tx("settings:features.normalizationRow.lang")}
            </span>
            <Input
              value={newAliasLang}
              onChange={(e) => onNewAliasLangChange(e.target.value)}
              placeholder={tx("settings:features.normalizationRow.en")}
              onKeyDown={(e) => e.key === "Enter" && onAddAlias()}
            />
          </label>
          <Button size="sm" onClick={onAddAlias} disabled={!newAlias.trim()}>
            <Plus className="h-3 w-3" />{" "}
            {tx("settings:features.normalizationRow.add")}{" "}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Table presentation (md and up). */
export default function NormalizationRow(props: NormalizationRowProps) {
  const { t: tx } = useFeatureTranslation([
    "common",
    "auth",
    "documents",
    "patients",
    "clinical",
    "settings",
    "share",
    "errors",
  ]);
  const {
    item,
    detail,
    expanded,
    showMerge,
    selected,
    onToggleSelect,
    onToggleExpand,
    onViewDocuments,
    onToggleMerge,
    onDelete,
  } = props;

  return (
    <React.Fragment>
      <tr
        className={`cursor-pointer transition-colors ${expanded ? "bg-accent/30" : "hover:bg-accent/20"}`}
        onClick={onToggleExpand}
      >
        <td className="px-3 py-1.5 w-8" onClick={(e) => e.stopPropagation()}>
          <label className="flex cursor-pointer items-center justify-center coarse:min-h-11 coarse:min-w-11">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              aria-label={tx("settings:features.normalizationRow.select", {
                value0: item.canonical_display || item.id,
              })}
            />
          </label>
        </td>
        <td className="px-2 py-1.5 w-6">
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </td>
        <td
          className="px-3 py-1.5 font-mono text-xs text-muted-foreground max-w-[280px] truncate"
          title={item.canonical_code || undefined}
        >
          {item.canonical_code}
        </td>
        <td
          className="px-3 py-1.5 font-medium max-w-[360px] truncate"
          title={item.canonical_display}
        >
          {item.canonical_display}
        </td>
        <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
          {item.alias_count || 0}{" "}
          {tx("settings:features.normalizationRow.aliases2")}{" "}
          {(item.unreviewed_count ?? 0) > 0 && (
            <Badge variant="warning" size="sm" className="ml-1.5">
              {tx("settings:features.normalizationRow.unreviewed", {
                value0: item.unreviewed_count,
              })}
            </Badge>
          )}
        </td>
        <td
          className="px-3 py-1.5 whitespace-nowrap w-px"
          onClick={(e) => e.stopPropagation()}
        >
          <RowActions
            onViewDocuments={onViewDocuments}
            onToggleMerge={onToggleMerge}
            onDelete={onDelete}
          />
        </td>
      </tr>

      {showMerge && (
        <tr className="bg-warning-soft">
          <td
            colSpan={6}
            className="px-6 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            <MergeForm {...props} />
          </td>
        </tr>
      )}

      {expanded && detail && (
        <tr className="bg-muted/20">
          <td
            colSpan={6}
            className="px-6 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <ExpandedDetail {...props} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

/** Card presentation (below md). Same props and behaviour as the table row:
 *  tapping the header expands the same detail content, the checkbox feeds
 *  the batch-merge selection, and the action buttons match the table's. */
export function NormalizationCard(props: NormalizationRowProps) {
  const { t: tx } = useFeatureTranslation([
    "common",
    "auth",
    "documents",
    "patients",
    "clinical",
    "settings",
    "share",
    "errors",
  ]);
  const {
    item,
    detail,
    expanded,
    showMerge,
    selected,
    onToggleSelect,
    onToggleExpand,
    onViewDocuments,
    onToggleMerge,
    onDelete,
  } = props;

  return (
    <div className="rounded-lg border bg-card">
      <div
        className="flex cursor-pointer items-center gap-1 p-3"
        onClick={onToggleExpand}
      >
        <label
          className="-my-2 -ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={tx("settings:features.normalizationRow.select", {
              value0: item.canonical_display || item.id,
            })}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.canonical_display}</div>
          {item.canonical_code && (
            <div className="truncate font-mono text-xs text-muted-foreground">
              {item.canonical_code}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge size="sm">
              {tx("settings:features.normalizationRow.aliases3", {
                value0: item.alias_count || 0,
              })}
            </Badge>
            {(item.unreviewed_count ?? 0) > 0 && (
              <Badge variant="warning" size="sm">
                {tx("settings:features.normalizationRow.unreviewed", {
                  value0: item.unreviewed_count,
                })}
              </Badge>
            )}
          </div>
        </div>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden
        />
      </div>

      <div className="flex items-center gap-1 px-3 pb-2">
        <RowActions
          onViewDocuments={onViewDocuments}
          onToggleMerge={onToggleMerge}
          onDelete={onDelete}
        />
      </div>

      {showMerge && (
        <div className="border-t bg-warning-soft p-3">
          <MergeForm {...props} />
        </div>
      )}

      {expanded && detail && (
        <div className="border-t p-3">
          <ExpandedDetail {...props} />
        </div>
      )}
    </div>
  );
}
