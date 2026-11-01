import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Image as ImageIcon,
  Languages,
  MoreVertical,
  RefreshCw,
  Share2,
  Trash2,
  Unlink,
  Upload,
} from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import Sheet from "@/components/ui/Sheet";
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
} from "@/components/ui/Menu";
import { useBreakpoint } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

export interface DetailActionsMenuProps {
  /** When set, the doc is linked to an imaging study: show "Imaging view"
   * and "Unlink imaging". */
  imagingStudyId: number | null;
  onUnlinkImaging: () => void;
  /** Reprocess / Translate are hidden while the doc is in the pipeline
   * (the header shows the queue pill + Cancel instead). */
  showPipelineActions: boolean;
  onReprocess: () => void;
  onTranslate: () => void;
  translateDisabled?: boolean;
  translateDisabledReason?: string;
  onShare: () => void;
  shareDisabled?: boolean;
  shareDisabledReason?: string;
  /** Swap the stored file for a new one without re-running the pipeline. */
  onReplace: () => void;
  onDelete: () => void;
}

interface ActionItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
  destructive?: boolean;
  /** Render a separator before this item (Delete). */
  separated?: boolean;
}

/**
 * Header overflow menu for the Document Detail page. One "More actions"
 * IconButton hosting every secondary action: a Radix action menu on
 * desktop, a bottom Sheet with 44px rows on mobile. Items that need a
 * form (Reprocess, Translate) or a dialog (Share, Delete confirm) only
 * signal the parent via callbacks — the flows themselves are hosted at
 * page level.
 */
export default function DetailActionsMenu({
  imagingStudyId,
  onUnlinkImaging,
  showPipelineActions,
  onReprocess,
  onTranslate,
  translateDisabled = false,
  translateDisabledReason,
  onShare,
  shareDisabled = false,
  shareDisabledReason,
  onReplace,
  onDelete,
}: DetailActionsMenuProps) {
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
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();
  const [sheetOpen, setSheetOpen] = useState(false);

  const items: ActionItem[] = [
    ...(imagingStudyId
      ? [
          {
            key: "imaging-view",
            label: tx("documents:features.detailActionsMenu.imagingView"),
            icon: ImageIcon,
            title: tx(
              "documents:features.detailActionsMenu.openTheDicomViewerForThisReportS",
            ),
            onSelect: () => navigate(`/imaging/${imagingStudyId}`),
          },
          {
            key: "unlink-imaging",
            label: tx("documents:features.detailActionsMenu.unlinkImaging"),
            icon: Unlink,
            title: tx(
              "documents:features.detailActionsMenu.detachThisPdfFromItsImagingStudyThe",
            ),
            onSelect: onUnlinkImaging,
          },
        ]
      : []),
    ...(showPipelineActions
      ? [
          {
            key: "reprocess",
            label: tx("documents:features.detailActionsMenu.reprocess"),
            icon: RefreshCw,
            onSelect: onReprocess,
          },
          {
            key: "translate",
            label: tx("documents:features.detailActionsMenu.translate"),
            icon: Languages,
            disabled: translateDisabled,
            title: translateDisabled ? translateDisabledReason : undefined,
            onSelect: onTranslate,
          },
        ]
      : []),
    {
      key: "share",
      label: tx("documents:features.detailActionsMenu.shareWithDoctor"),
      icon: Share2,
      disabled: shareDisabled,
      title: shareDisabled ? shareDisabledReason : undefined,
      onSelect: onShare,
    },
    {
      key: "replace-file",
      label: tx("documents:features.detailActionsMenu.replaceFile"),
      icon: Upload,
      title: tx(
        "documents:features.detailActionsMenu.swapTheStoredFileForANewOne",
      ),
      onSelect: onReplace,
    },
    {
      key: "delete",
      label: tx("common:actions.delete"),
      icon: Trash2,
      destructive: true,
      separated: true,
      onSelect: onDelete,
    },
  ];

  if (isMobile) {
    return (
      <>
        <IconButton
          label={tx("documents:features.detailActionsMenu.moreActions")}
          variant="secondary"
          onClick={() => setSheetOpen(true)}
        >
          <MoreVertical className="h-4 w-4" />
        </IconButton>
        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={tx("documents:features.detailActionsMenu.documentActions")}
        >
          <div className="space-y-0.5 pb-1">
            {items.map((item) => (
              <div
                key={item.key}
                className={item.separated ? "mt-1 border-t pt-1" : undefined}
              >
                <button
                  type="button"
                  disabled={item.disabled}
                  title={item.title}
                  onClick={() => {
                    setSheetOpen(false);
                    item.onSelect();
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm",
                    "hover:bg-accent active:bg-accent disabled:opacity-50",
                    item.destructive &&
                      "text-destructive hover:bg-destructive-soft active:bg-destructive-soft",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              </div>
            ))}
          </div>
        </Sheet>
      </>
    );
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton
          label={tx("documents:features.detailActionsMenu.moreActions")}
          variant="secondary"
        >
          <MoreVertical className="h-4 w-4" />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end">
        {items.map((item) => (
          <div key={item.key} className="contents">
            {item.separated && <MenuSeparator />}
            <MenuItem
              destructive={item.destructive}
              disabled={item.disabled}
              title={item.title}
              // Defer past the menu's close/focus-restore so flows that
              // open a Sheet or dialog don't fight Radix for focus.
              onSelect={() => setTimeout(item.onSelect, 0)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </MenuItem>
          </div>
        ))}
      </MenuContent>
    </Menu>
  );
}
