import { useTranslation as useFeatureTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import {
  SettingsForm,
  TextField,
  ToggleField,
  useSettingsSave,
} from "./SettingsFormHelpers";
import { useSettings } from "@/hooks/data";

const parseRoleList = (v: string): string[] =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const arraysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

export default function OidcTab() {
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
  const [s, setS] = useState<any>(null);
  const [f, setF] = useState<any>({});
  const { saving, saved, save } = useSettingsSave();
  const { data: settingsData } = useSettings();

  useEffect(() => {
    if (!settingsData) return;
    setS(settingsData);
    setF({
      oidc_enabled: settingsData.oidc.enabled,
      oidc_provider_url: settingsData.oidc.provider_url || "",
      oidc_client_id: settingsData.oidc.client_id || "",
      oidc_client_secret: "",
      oidc_scopes: settingsData.oidc.scopes || "openid profile email",
      oidc_auto_create_user: settingsData.oidc.auto_create_user,
      oidc_username_claim:
        settingsData.oidc.username_claim || "preferred_username",
      oidc_display_name_claim: settingsData.oidc.display_name_claim || "name",
      oidc_sync_roles: !!settingsData.oidc.sync_roles,
      oidc_roles_claim: settingsData.oidc.roles_claim || "groups",
      oidc_admin_roles: (settingsData.oidc.admin_roles || []).join(", "),
      oidc_editor_roles: (settingsData.oidc.editor_roles || []).join(", "),
      oidc_viewer_roles: (settingsData.oidc.viewer_roles || []).join(", "),
      oidc_default_role: settingsData.oidc.default_role || "viewer",
      oidc_hide_password_login: !!settingsData.oidc.hide_password_login,
    });
  }, [settingsData]);

  if (!s)
    return (
      <div className="text-muted-foreground">{tx("common:ui.loading")}</div>
    );

  const admin = parseRoleList(f.oidc_admin_roles || "");
  const editor = parseRoleList(f.oidc_editor_roles || "");
  const viewer = parseRoleList(f.oidc_viewer_roles || "");

  return (
    <SettingsForm
      title={tx("settings:features.oidcTab.oidcSsoAuthentikKeycloakEtc")}
      saving={saving}
      saved={saved}
      onSave={() =>
        save({
          oidc_enabled:
            f.oidc_enabled !== s.oidc.enabled ? f.oidc_enabled : undefined,
          oidc_provider_url:
            f.oidc_provider_url !== (s.oidc.provider_url || "")
              ? f.oidc_provider_url
              : undefined,
          oidc_client_id:
            f.oidc_client_id !== (s.oidc.client_id || "")
              ? f.oidc_client_id
              : undefined,
          oidc_client_secret: f.oidc_client_secret || undefined,
          oidc_scopes:
            f.oidc_scopes !== (s.oidc.scopes || "") ? f.oidc_scopes : undefined,
          oidc_auto_create_user:
            f.oidc_auto_create_user !== s.oidc.auto_create_user
              ? f.oidc_auto_create_user
              : undefined,
          oidc_username_claim:
            f.oidc_username_claim !== (s.oidc.username_claim || "")
              ? f.oidc_username_claim
              : undefined,
          oidc_display_name_claim:
            f.oidc_display_name_claim !== (s.oidc.display_name_claim || "")
              ? f.oidc_display_name_claim
              : undefined,
          oidc_sync_roles:
            f.oidc_sync_roles !== !!s.oidc.sync_roles
              ? f.oidc_sync_roles
              : undefined,
          oidc_roles_claim:
            f.oidc_roles_claim !== (s.oidc.roles_claim || "")
              ? f.oidc_roles_claim
              : undefined,
          oidc_admin_roles: arraysEqual(admin, s.oidc.admin_roles || [])
            ? undefined
            : admin,
          oidc_editor_roles: arraysEqual(editor, s.oidc.editor_roles || [])
            ? undefined
            : editor,
          oidc_viewer_roles: arraysEqual(viewer, s.oidc.viewer_roles || [])
            ? undefined
            : viewer,
          oidc_default_role:
            f.oidc_default_role !== (s.oidc.default_role || "")
              ? f.oidc_default_role
              : undefined,
          oidc_hide_password_login:
            f.oidc_hide_password_login !== !!s.oidc.hide_password_login
              ? f.oidc_hide_password_login
              : undefined,
        })
      }
    >
      <ToggleField
        label={tx("settings:features.oidcTab.enableOidc")}
        value={f.oidc_enabled}
        onChange={(v) => setF({ ...f, oidc_enabled: v })}
        description={tx(
          "settings:features.oidcTab.showSignInWithSsoOnTheLogin",
        )}
      />
      <ToggleField
        label={tx("settings:features.oidcTab.hidePasswordLogin")}
        value={f.oidc_hide_password_login}
        onChange={(v) => setF({ ...f, oidc_hide_password_login: v })}
        description={tx(
          "settings:features.oidcTab.whenSsoIsEnabledHideTheUsernamePassword",
        )}
      />
      <TextField
        label={tx("settings:features.oidcTab.providerUrl")}
        value={f.oidc_provider_url}
        onChange={(v) => setF({ ...f, oidc_provider_url: v })}
        placeholder="https://auth.example.com/application/o/asclepius/"
      />
      <TextField
        label={tx("settings:features.oidcTab.clientId")}
        value={f.oidc_client_id}
        onChange={(v) => setF({ ...f, oidc_client_id: v })}
      />
      <TextField
        label={tx("settings:features.oidcTab.clientSecret")}
        value={f.oidc_client_secret}
        onChange={(v) => setF({ ...f, oidc_client_secret: v })}
        type="password"
        placeholder={
          s.oidc.has_client_secret
            ? tx("settings:features.oidcTab.configured")
            : tx("settings:features.oidcTab.notSet")
        }
      />
      <TextField
        label={tx("settings:features.oidcTab.scopes")}
        value={f.oidc_scopes}
        onChange={(v) => setF({ ...f, oidc_scopes: v })}
        description={tx(
          "settings:features.oidcTab.addGroupsWhenSyncingRolesSoTheProvider",
        )}
      />
      <ToggleField
        label={tx("settings:features.oidcTab.autoCreateUsers")}
        value={f.oidc_auto_create_user}
        onChange={(v) => setF({ ...f, oidc_auto_create_user: v })}
        description={tx(
          "settings:features.oidcTab.createALocalUserOnFirstOidcLogin",
        )}
      />
      <TextField
        label={tx("settings:features.oidcTab.usernameClaim")}
        value={f.oidc_username_claim}
        onChange={(v) => setF({ ...f, oidc_username_claim: v })}
        placeholder={tx("settings:features.oidcTab.preferredUsername")}
      />
      <TextField
        label={tx("settings:features.oidcTab.displayNameClaim")}
        value={f.oidc_display_name_claim}
        onChange={(v) => setF({ ...f, oidc_display_name_claim: v })}
        placeholder={tx("settings:features.oidcTab.name")}
      />

      <div className="pt-2 border-t">
        <h4 className="text-sm font-semibold mb-2">
          {tx("settings:features.oidcTab.roleSync")}
        </h4>
        <p className="text-xs text-muted-foreground mb-3">
          {tx("settings:features.oidcTab.whenEnabledAUserSLocalRoleIs")}
        </p>
      </div>
      <ToggleField
        label={tx("settings:features.oidcTab.syncRolesOnLogin")}
        value={f.oidc_sync_roles}
        onChange={(v) => setF({ ...f, oidc_sync_roles: v })}
        description={tx(
          "settings:features.oidcTab.overwriteTheLocalRoleFromOidcGroupsOn",
        )}
      />
      <TextField
        label={tx("settings:features.oidcTab.rolesClaim")}
        value={f.oidc_roles_claim}
        onChange={(v) => setF({ ...f, oidc_roles_claim: v })}
        placeholder={tx("settings:features.oidcTab.groups")}
        description={tx(
          "settings:features.oidcTab.dottedPathAuthentikGroupsKeycloakRealmRolesRealm",
        )}
      />
      <TextField
        label={tx("settings:features.oidcTab.adminGroups")}
        value={f.oidc_admin_roles}
        onChange={(v) => setF({ ...f, oidc_admin_roles: v })}
        placeholder={tx("settings:features.oidcTab.asclepiusAdmins")}
        description={tx(
          "settings:features.oidcTab.commaSeparatedListOfOidcGroupRoleNames",
        )}
      />
      <TextField
        label={tx("settings:features.oidcTab.editorGroups")}
        value={f.oidc_editor_roles}
        onChange={(v) => setF({ ...f, oidc_editor_roles: v })}
        placeholder={tx("settings:features.oidcTab.asclepiusEditors")}
        description={tx(
          "settings:features.oidcTab.commaSeparatedListOfOidcGroupRoleNames2",
        )}
      />
      <TextField
        label={tx("settings:features.oidcTab.viewerGroups")}
        value={f.oidc_viewer_roles}
        onChange={(v) => setF({ ...f, oidc_viewer_roles: v })}
        placeholder={tx("settings:features.oidcTab.asclepiusViewers")}
        description={tx(
          "settings:features.oidcTab.commaSeparatedListOfOidcGroupRoleNames3",
        )}
      />
      <TextField
        label={tx("settings:features.oidcTab.defaultRole")}
        value={f.oidc_default_role}
        onChange={(v) => setF({ ...f, oidc_default_role: v })}
        placeholder={tx("settings:features.oidcTab.viewer")}
        description={tx(
          "settings:features.oidcTab.appliedWhenSyncIsOnAndNoMapping",
        )}
      />
    </SettingsForm>
  );
}
