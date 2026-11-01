import type { UiLanguagePreference } from "./types";

export type SaveLanguage = (
  preference: UiLanguagePreference,
  signal: AbortSignal,
) => Promise<void>;
export interface AccountLanguageState {
  id: number;
  preference: UiLanguagePreference;
  saving: boolean;
  failed: boolean;
}

/** One account lifetime. Serial writes prevent a slow older save winning. */
export class AccountLanguageSession {
  private active = true;
  private dirty = false;
  private revision = 0;
  private running = false;
  private controller = new AbortController();
  private state: AccountLanguageState;

  constructor(
    id: number,
    preference: UiLanguagePreference,
    private save: SaveLanguage,
    private notify: (state: AccountLanguageState) => void,
  ) {
    this.state = { id, preference, saving: false, failed: false };
  }

  get snapshot() {
    return this.state;
  }

  private publish(change: Partial<AccountLanguageState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...change };
    this.notify(this.state);
  }

  refresh(preference: UiLanguagePreference) {
    if (!this.dirty && preference !== this.state.preference)
      this.publish({ preference });
  }

  select(preference: UiLanguagePreference) {
    if (!this.active) return;
    this.dirty = true;
    this.revision++;
    this.publish({ preference, saving: true, failed: false });
    void this.drain();
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.active) {
      const revision = this.revision;
      const preference = this.state.preference;
      let failed = false;
      try {
        await this.save(preference, this.controller.signal);
      } catch {
        failed = true;
      }
      if (!this.active) break;
      if (revision === this.revision) {
        this.publish({ saving: false, failed });
        break;
      }
      // Only a newer explicit choice can cause another write; never retry an error.
    }
    this.running = false;
  }

  dispose() {
    this.active = false;
    this.controller.abort();
  }
}
