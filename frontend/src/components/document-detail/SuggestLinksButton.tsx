import { enumLabel } from "@/lib/labels";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { message } from "@/i18n/messages";
import { useState } from "react";
import api from "@/api/client";
import { Stethoscope } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";

export default function SuggestLinksButton({
  docId,
  onLink,
}: {
  docId: number;
  onLink: (newLink?: any) => void;
}) {
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
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[] | null>(null);

  const handleSuggest = async () => {
    setLoading(true);
    setSuggestions(null);
    try {
      const res = await api.post(`/documents/${docId}/suggest-links`);
      setSuggestions(res.data.suggestions || []);
    } catch {
      toast({
        title: message("feedback.failedToGetSuggestions"),
        variant: "error",
      });
    }
    setLoading(false);
  };

  const handleAccept = async (targetId: number, linkType: string) => {
    try {
      const res = await api.post(`/documents/${docId}/link`, {
        target_document_id: targetId,
        link_type: linkType,
      });
      setSuggestions(
        (s) => s?.filter((sg) => sg.document_id !== targetId) || null,
      );
      const sg = suggestions?.find((s) => s.document_id === targetId);
      onLink({
        ...res.data,
        target_filename: sg?.filename,
        target_doc_type: sg?.doc_type,
      });
    } catch {
      toast({ title: message("feedback.failedToLink"), variant: "error" });
    }
  };

  return (
    <div>
      <button
        onClick={handleSuggest}
        disabled={loading}
        className="flex items-center gap-1 rounded-md border border-primary/30 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
      >
        {loading ? (
          <>
            <div className="animate-spin h-3 w-3 border border-primary border-t-transparent rounded-full" />
            {tx("documents:features.eventSelector.analyzing")}{" "}
          </>
        ) : (
          <>
            <Stethoscope className="h-3 w-3" />{" "}
            {tx("documents:features.suggestLinksButton.suggestLinksAi")}{" "}
          </>
        )}
      </button>

      {suggestions !== null && (
        <div className="mt-2 space-y-2">
          {suggestions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {tx(
                "documents:features.suggestLinksButton.noRelatedDocumentsFound",
              )}
            </p>
          ) : (
            suggestions.map((sg: any) => (
              <div
                key={sg.document_id}
                className="rounded-md border p-3 text-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <a
                      href={`/documents/${sg.document_id}`}
                      className="font-medium text-primary hover:underline block truncate"
                    >
                      {sg.filename ||
                        tx("documents:features.linksSection.document", {
                          value0: sg.document_id,
                        })}
                    </a>
                    <div className="flex flex-wrap gap-2 mt-1 text-muted-foreground">
                      {sg.doc_type && (
                        <span className="rounded bg-muted px-1.5 py-0.5">
                          {enumLabel("docType", sg.doc_type)}
                        </span>
                      )}
                      {sg.event_date && <span>{sg.event_date}</span>}
                      {sg.doctor_name && <span>{sg.doctor_name}</span>}
                      {sg.facility_name && <span>{sg.facility_name}</span>}
                    </div>
                    {sg.summary_en && (
                      <p className="mt-1 text-muted-foreground line-clamp-2">
                        {sg.summary_en}
                      </p>
                    )}
                  </div>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary text-[10px] whitespace-nowrap">
                    {enumLabel("linkType", sg.link_type)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-muted-foreground italic">
                    {sg.reason}
                  </p>
                  <button
                    onClick={() => handleAccept(sg.document_id, sg.link_type)}
                    className="rounded bg-primary px-3 py-1 text-primary-foreground hover:bg-primary/90"
                  >
                    {tx("documents:features.linksSection.link")}
                  </button>
                  <button
                    onClick={() =>
                      setSuggestions(
                        (s) =>
                          s?.filter((x) => x.document_id !== sg.document_id) ||
                          null,
                      )
                    }
                    className="rounded border px-3 py-1 hover:bg-accent"
                  >
                    {tx("documents:features.suggestLinksButton.skip")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
