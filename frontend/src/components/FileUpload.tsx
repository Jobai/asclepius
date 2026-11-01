import { enumLabel } from "@/lib/labels";
import { Trans as FeatureTrans } from "react-i18next";
import { useTranslation as useFeatureTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";
import { message, useMessage, type UiMessage } from "@/i18n/messages";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/api/client";
import { usePatient } from "@/contexts/PatientContext";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Info,
  X,
  Calendar,
  Camera,
} from "lucide-react";
import Combobox from "@/components/ui/Combobox";
import { usePatients, useEvents } from "@/hooks/data";

interface FileUploadProps {
  onUploadComplete?: () => void;
}

interface UploadResult {
  filename: string;
  status: string;
  suggestion?: string;
  message?: string;
  queue_size?: number;
  // Returned when the upload was a zip bundle (e.g. a DICOM exam):
  // the server extracted N members and queued each one for processing.
  extracted?: number;
  dicom?: number;
  other?: number;
  // Returned when the uploaded file's SHA-256 matches a document already in
  // the database. The frontend uses these fields to link the user to the
  // existing record instead of treating it as a fresh upload.
  existing_document_id?: number;
  existing_filename?: string;
  existing_patient_id?: number | null;
}

interface DuplicateInfo {
  file: string;
  existingId: number;
  existingFilename?: string;
}

export default function FileUpload({ onUploadComplete }: FileUploadProps) {
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
  const { selectedPatient } = usePatient();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: UiMessage;
    failures?: { file: string; reason: UiMessage }[];
    duplicates?: DuplicateInfo[];
  } | null>(null);
  const [showFailures, setShowFailures] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [showPatientPrompt, setShowPatientPrompt] = useState(false);
  // Synchronous re-entry guard. ``uploading`` (state) only flips on
  // the next render, so two onClicks fired in the same frame both see
  // ``uploading === false`` and would each kick off a full upload of
  // the same files. The ref short-circuits the second call before the
  // network request goes out.
  const uploadInFlightRef = useRef(false);
  const { data: patientsData } = usePatients();
  const patients = Array.isArray(patientsData) ? patientsData : [];
  const [chosenPatientId, setChosenPatientId] = useState<string>("");
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [uploadedDocIds, setUploadedDocIds] = useState<number[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  // "Uploading {current} of {total}" — the upload loop is sequential,
  // so the index advances one file at a time.
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const { data: eventsData } = useEvents({
    patientId: selectedPatient?.id,
    enabled: !!selectedPatient,
  });
  const events = Array.isArray(eventsData) ? eventsData : [];
  const [chosenEventId, setChosenEventId] = useState<string>("");

  const scheduleBatch = useCallback(
    async (processAt: string | null) => {
      if (uploadedDocIds.length === 0) return;
      try {
        await api.post("/documents/schedule-batch", {
          document_ids: uploadedDocIds,
          process_at: processAt,
        });
        setResult({
          ok: true,
          message: processAt
            ? message("documents:features.extra.scheduled", {
                count: uploadedDocIds.length,
              })
            : message("documents:features.extra.queuedFiles", {
                count: uploadedDocIds.length,
              }),
        });
      } catch {
        setResult({
          ok: false,
          message: message("documents:features.extra.scheduleFailed"),
        });
      }
      setShowScheduleDialog(false);
      setUploadedDocIds([]);
    },
    [uploadedDocIds],
  );

  const doUpload = useCallback(
    async (
      files: File[],
      patientId: number | null,
      eventId: number | null = null,
    ) => {
      if (uploadInFlightRef.current) return;
      uploadInFlightRef.current = true;
      setUploading(true);
      setResult(null);
      setShowPatientPrompt(false);
      setPendingFiles(null);

      let successCount = 0;
      let errorCount = 0;
      let duplicateCount = 0;
      let hasSuggestion = false;
      let zipExtracted = 0;
      let zipDicom = 0;
      let zipOther = 0;
      let sawZip = false;
      const failures: { file: string; reason: UiMessage }[] = [];
      const duplicates: DuplicateInfo[] = [];
      for (const [index, file] of files.entries()) {
        setUploadProgress({ current: index + 1, total: files.length });
        try {
          const form = new FormData();
          form.append("file", file);
          const qp = new URLSearchParams();
          if (patientId) qp.set("patient_id", String(patientId));
          if (eventId) qp.set("event_id", String(eventId));
          const params = qp.toString() ? `?${qp.toString()}` : "";
          const res = await api.post(`/documents/upload${params}`, form, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          const data = res.data as UploadResult;
          if (data.status === "duplicate" && data.existing_document_id) {
            duplicateCount++;
            duplicates.push({
              file: file.name,
              existingId: data.existing_document_id,
              existingFilename: data.existing_filename,
            });
            continue;
          }
          successCount++;
          if (data.suggestion === "batch_schedule") {
            hasSuggestion = true;
          }
          if (typeof data.extracted === "number") {
            sawZip = true;
            zipExtracted += data.extracted;
            zipDicom += data.dicom || 0;
            zipOther += data.other || 0;
          }
        } catch (err: any) {
          // Keep a descriptor so each failure follows later language changes.
          const reason = getErrorMessage(err, message("feedback.uploadFailed"));
          failures.push({ file: file.name, reason });
          errorCount++;
        }
      }

      setUploading(false);
      setUploadProgress(null);
      uploadInFlightRef.current = false;
      setUploadedCount(successCount);
      setShowFailures(false);

      if (errorCount === 0) {
        const baseMsg: UiMessage = sawZip
          ? message("documents:features.extra.zipExtracted", {
              files: zipExtracted,
              dicom: zipDicom,
              other: zipOther,
            })
          : successCount === 0 && duplicateCount > 0
            ? message("documents:features.extra.duplicates", {
                count: duplicateCount,
              })
            : message("documents:features.extra.uploaded", {
                count: successCount,
                duplicates:
                  duplicateCount > 0
                    ? message("documents:features.extra.duplicatesSuffix", {
                        count: duplicateCount,
                      })
                    : "",
              });
        setResult({
          ok: true,
          message: baseMsg,
          duplicates: duplicates.length > 0 ? duplicates : undefined,
        });
      } else {
        setResult({
          ok: false,
          message: message("errors:uploadsFailed", {
            uploaded: successCount,
            failed: errorCount,
          }),
          failures,
          duplicates: duplicates.length > 0 ? duplicates : undefined,
        });
      }

      // If batch scheduling was suggested, fetch pending doc IDs and show dialog
      if (hasSuggestion && successCount > 0) {
        try {
          const docsRes = await api.get("/documents", {
            params: { status: "pending", limit: 100 },
          });
          const docs = Array.isArray(docsRes.data) ? docsRes.data : [];
          const ids = docs.map((d: any) => d.id);
          if (ids.length > 0) {
            setUploadedDocIds(ids);
            setShowScheduleDialog(true);
          }
        } catch {
          // Ignore — just don't show the dialog
        }
      }

      onUploadComplete?.();
    },
    [onUploadComplete],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (selectedPatient) {
        const eid = chosenEventId ? Number(chosenEventId) : null;
        doUpload(fileArray, selectedPatient.id, eid);
      } else {
        setPendingFiles(fileArray);
        setShowPatientPrompt(true);
      }
    },
    [selectedPatient, doUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  return (
    <div className="space-y-3">
      {/* Patient prompt */}
      {showPatientPrompt && pendingFiles && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">
            {tx("documents:features.fileUpload.assignFileSToAPatient", {
              count: pendingFiles.length,
            })}
          </p>
          <Combobox
            value={chosenPatientId || null}
            onChange={(v) => setChosenPatientId(v || "")}
            options={patients.map((p) => ({
              value: String(p.id),
              label: p.display_name,
            }))}
            placeholder={tx(
              "documents:features.fileUpload.noPatientProcessUnassigned",
            )}
            title={tx("patients:select")}
          />
          <Combobox
            value={chosenEventId || null}
            onChange={(v) => setChosenEventId(v || "")}
            options={events.map((ev) => ({
              value: String(ev.id),
              label: ev.title,
              hint: enumLabel("eventType", ev.event_type),
            }))}
            placeholder={tx("documents:features.fileUpload.noMedicalEvent")}
            title={tx("documents:features.fileUpload.selectMedicalEvent")}
          />
          <div className="flex gap-2">
            <button
              onClick={() =>
                doUpload(
                  pendingFiles,
                  chosenPatientId ? Number(chosenPatientId) : null,
                  chosenEventId ? Number(chosenEventId) : null,
                )
              }
              disabled={uploading}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {uploading
                ? tx("documents:features.fileUpload.uploading")
                : tx("common:actions.upload")}
            </button>
            <button
              onClick={() => {
                setShowPatientPrompt(false);
                setPendingFiles(null);
              }}
              disabled={uploading}
              className="rounded-md border px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {tx("common:feedback.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Batch schedule dialog */}
      {showScheduleDialog && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <p className="text-sm font-medium">
              {tx(
                "documents:features.fileUpload.youUploadedFileSProcessNowOrSchedule",
                { count: uploadedCount },
              )}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {tx(
              "documents:features.fileUpload.schedulingAllowsProcessingDuringOffPeakHoursTo",
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => scheduleBatch(null)}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              {tx("documents:features.fileUpload.processNow")}
            </button>
            <button
              onClick={() => {
                const tonight = new Date();
                tonight.setHours(22, 0, 0, 0);
                if (tonight <= new Date())
                  tonight.setDate(tonight.getDate() + 1);
                scheduleBatch(tonight.toISOString());
              }}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
            >
              {tx("documents:features.fileUpload.scheduleForTonight2200")}
            </button>
            <button
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(6, 0, 0, 0);
                scheduleBatch(tomorrow.toISOString());
              }}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
            >
              {tx("documents:features.fileUpload.scheduleForTomorrow0600")}
            </button>
            <button
              onClick={() => {
                setShowScheduleDialog(false);
                setUploadedDocIds([]);
              }}
              className="rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              {tx("common:actions.dismiss")}
            </button>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
      >
        {uploading ? (
          <div className="text-muted-foreground">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-sm">
              {uploadProgress
                ? tx("documents:features.fileUpload.uploadingOf", {
                    value0: uploadProgress.current,
                    value1: uploadProgress.total,
                  })
                : tx("documents:features.fileUpload.uploading2")}
            </p>
          </div>
        ) : (
          <>
            {/* The whole icon + headline block is the file-input label so
                the entire headline area is tappable, not just "browse".
                The Combobox pickers below stay OUTSIDE the label to avoid
                nested-interactive problems. */}
            <label className="block cursor-pointer">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-1">
                <span className="coarse:hidden">
                  <FeatureTrans
                    ns="documents"
                    i18nKey="features.fileUpload.dragDropFilesHereOrPart0BrowsePart0"
                    components={{
                      part0: <span className="text-primary hover:underline" />,
                    }}
                    values={{}}
                  />
                </span>
                <span className="hidden coarse:inline">
                  {tx("documents:features.fileUpload.tapToChooseFiles")}
                </span>
              </p>
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.dcm,.zip"
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {tx(
                "documents:features.fileUpload.pdfJpegPngTiffDicomZipDicomBundle",
              )}{" "}
              {selectedPatient && (
                <span className="ml-1">
                  <FeatureTrans
                    ns="documents"
                    i18nKey="features.fileUpload.assigningToPart0Part0"
                    components={{ part0: <strong /> }}
                    values={{ value0: selectedPatient.display_name }}
                  />
                </span>
              )}
            </p>
            {/* Camera capture — coarse pointers only. A separate input so
                the main picker is never forced into camera mode (adding
                `capture` to the multi-file input would hide the file
                picker on Android). */}
            <label className="mt-3 hidden coarse:inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent active:bg-accent">
              <Camera className="h-4 w-4" />
              {tx("documents:features.fileUpload.takePhoto")}{" "}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
            </label>
            {selectedPatient && events.length > 0 && (
              <div className="mt-2 inline-block text-left min-w-[220px]">
                <Combobox
                  value={chosenEventId || null}
                  onChange={(v) => setChosenEventId(v || "")}
                  options={events.map((ev) => ({
                    value: String(ev.id),
                    label: ev.title,
                    hint: enumLabel("eventType", ev.event_type),
                  }))}
                  placeholder={tx(
                    "documents:features.fileUpload.noMedicalEvent",
                  )}
                  title={tx("documents:features.fileUpload.selectMedicalEvent")}
                />
              </div>
            )}
          </>
        )}

        {result && (
          <div className="mt-3 space-y-2">
            <div
              className={`flex items-center justify-center gap-2 text-sm ${
                result.ok ? "text-success" : "text-destructive"
              }`}
            >
              {result.ok ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {renderMessage(result.message)}
              {result.failures && result.failures.length > 0 && (
                <button
                  onClick={() => setShowFailures((v) => !v)}
                  className="ml-1 underline text-xs"
                >
                  {showFailures
                    ? tx("documents:features.extra.hideUploadDetails")
                    : tx("documents:features.extra.showUploadDetails")}
                </button>
              )}
              <button
                onClick={() => setResult(null)}
                className="ml-1 inline-flex items-center justify-center rounded coarse:min-h-11 coarse:min-w-11"
                aria-label={tx("documents:features.fileUpload.dismissResult")}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {showFailures && result.failures && result.failures.length > 0 && (
              <ul className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs space-y-1 max-h-48 overflow-y-auto">
                {result.failures.map((f, i) => (
                  <li key={i} className="flex flex-col">
                    <span className="font-medium truncate">{f.file}</span>
                    <span className="text-muted-foreground">
                      {renderMessage(f.reason)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {result.duplicates && result.duplicates.length > 0 && (
              <ul className="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs space-y-1 max-h-48 overflow-y-auto text-left">
                {result.duplicates.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Info className="h-3 w-3 mt-0.5 shrink-0 text-warning" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{d.file}</div>
                      <div className="text-muted-foreground">
                        <FeatureTrans
                          ns="documents"
                          i18nKey="features.fileUpload.alreadyInSystemAsPart0Part0"
                          components={{
                            part0: (
                              <Link
                                to={`/documents/${d.existingId}`}
                                className="text-primary underline hover:no-underline"
                              />
                            ),
                          }}
                          values={{
                            value0:
                              d.existingFilename ||
                              tx(
                                "documents:features.extra.existingDocumentId",
                                { id: d.existingId },
                              ),
                          }}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
