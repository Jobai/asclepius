import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useMessage, type UiMessage } from "@/i18n/messages";
import { message } from "@/i18n/messages";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/api/client";
import { getErrorMessage } from "@/lib/errors";
import { User, Heart, ChevronRight, ChevronLeft, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type Step = "welcome" | "account" | "patient" | "done";

export default function SetupWizardPage() {
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
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [error, setError] = useState<UiMessage | null>("");
  const [loading, setLoading] = useState(false);

  // Account fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Patient fields (pre-filled from account display_name)
  const [patientName, setPatientName] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [patientSex, setPatientSex] = useState("");

  const goToPatient = () => {
    setError("");
    if (!username.trim()) {
      setError(message("feedback.usernameIsRequired"));
      return;
    }
    if (!password) {
      setError(message("feedback.passwordIsRequired"));
      return;
    }
    if (password.length < 4) {
      setError(message("feedback.passwordMustBeAtLeastCharacters"));
      return;
    }
    if (password !== confirmPassword) {
      setError(message("feedback.passwordsDoNotMatch"));
      return;
    }
    // Pre-fill patient name from display name if empty
    if (!patientName) setPatientName(displayName || username);
    setStep("patient");
  };

  const handleComplete = async () => {
    setError("");
    setLoading(true);
    try {
      await api.post("/setup/complete", {
        username: username.trim(),
        password,
        display_name: displayName.trim() || username.trim(),
        patient_name:
          patientName.trim() || displayName.trim() || username.trim(),
        patient_date_of_birth: patientDob || null,
        patient_sex: patientSex || null,
      });
      setStep("done");
    } catch (err: any) {
      setError(getErrorMessage(err, message("feedback.setupFailed")));
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    await refreshUser();
    navigate("/");
  };

  const labelClass = "mb-1 block text-sm font-medium";

  return (
    // Safe-area insets live on the outer shell so the inner 1rem padding is
    // preserved on devices without insets (pt-safe would otherwise zero it).
    <div className="flex min-h-dvh flex-col bg-muted/30 pt-safe pb-safe pl-safe pr-safe">
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-lg border bg-card p-6 sm:p-8 shadow-raised">
          <div className="mb-4">
            <LanguageSwitcher />
          </div>
          {/* Step indicator */}
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            {["welcome", "account", "patient", "done"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full transition-colors ${
                    s === step
                      ? "bg-primary"
                      : ["welcome", "account", "patient", "done"].indexOf(
                            step,
                          ) > i
                        ? "bg-primary/50"
                        : "bg-muted-foreground/25"
                  }`}
                />
                {i < 3 && <div className="h-px w-6 bg-muted-foreground/25" />}
              </div>
            ))}
          </div>

          {/* Welcome */}
          {step === "welcome" && (
            <div className="text-center space-y-4">
              <img
                src="/logo.svg"
                alt="Asclepius"
                className="h-14 w-14 mx-auto rounded-lg"
              />
              <h1 className="text-2xl font-semibold">
                {tx("auth:features.setupWizard.welcomeToAsclepius")}
              </h1>
              <p className="text-muted-foreground text-sm">
                {tx(
                  "auth:features.setupWizard.yourSelfHostedMedicalRecordsManagerLetS",
                )}
              </p>
              <Button
                size="lg"
                className="mt-4 w-full sm:w-auto"
                onClick={() => setStep("account")}
              >
                {tx("auth:features.setupWizard.getStarted")}{" "}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Account creation */}
          {step === "account" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">
                  {tx("auth:features.setupWizard.createYourAccount")}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {tx(
                  "auth:features.setupWizard.thisWillBeTheAdministratorAccountForYour",
                )}
              </p>

              {error && (
                <div className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
                  {renderMessage(error ?? undefined)}
                </div>
              )}

              <div>
                <label className={labelClass}>
                  {tx("auth:features.setupWizard.displayName")}
                </label>
                <Input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={tx("auth:features.setupWizard.eGJohnSmith")}
                  autoFocus
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {tx(
                    "auth:features.setupWizard.yourFullNameUsedToPreFillPatient",
                  )}
                </p>
              </div>

              <div>
                <label className={labelClass}>
                  {tx("auth:features.setupWizard.username")}
                </label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={tx("auth:features.setupWizard.eGJsmith")}
                  required
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    {tx("auth:features.setupWizard.password")}
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {tx("auth:features.setupWizard.confirmPassword")}
                  </label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => setStep("welcome")}
                >
                  <ChevronLeft className="h-4 w-4" />{" "}
                  {tx("auth:features.setupWizard.back")}{" "}
                </Button>
                <Button
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={goToPatient}
                >
                  {tx("auth:features.setupWizard.next")}{" "}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Patient creation */}
          {step === "patient" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">
                  {tx("auth:features.setupWizard.firstPatientProfile")}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {tx(
                  "auth:features.setupWizard.preFilledWithYourAccountInfoEditAs",
                )}
              </p>

              {error && (
                <div className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
                  {renderMessage(error ?? undefined)}
                </div>
              )}

              <div>
                <label className={labelClass}>
                  {tx("auth:features.setupWizard.patientName")}
                </label>
                <Input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    {tx("auth:features.setupWizard.dateOfBirth")}
                  </label>
                  <Input
                    type="date"
                    value={patientDob}
                    onChange={(e) => setPatientDob(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    {tx("auth:features.setupWizard.sex")}
                  </label>
                  <Select
                    value={patientSex}
                    onChange={(e) => setPatientSex(e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="M">
                      {tx("auth:features.setupWizard.male")}
                    </option>
                    <option value="F">
                      {tx("auth:features.setupWizard.female")}
                    </option>
                    <option value="O">
                      {tx("auth:features.setupWizard.other")}
                    </option>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => setStep("account")}
                >
                  <ChevronLeft className="h-4 w-4" />{" "}
                  {tx("auth:features.setupWizard.back")}{" "}
                </Button>
                <Button
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={handleComplete}
                  loading={loading}
                >
                  {loading
                    ? tx("auth:features.setupWizard.settingUp")
                    : tx("auth:features.setupWizard.completeSetup")}
                  {!loading && <Check className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
                <Check className="h-8 w-8 text-success" />
              </div>
              <h2 className="text-xl font-semibold">
                {tx("auth:features.setupWizard.youReAllSet")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {tx(
                  "auth:features.setupWizard.yourAccountAndPatientProfileHaveBeenCreated",
                )}
              </p>
              <Button
                size="lg"
                className="mt-2 w-full sm:w-auto"
                onClick={handleFinish}
              >
                {tx("auth:features.setupWizard.goToDashboard")}{" "}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
