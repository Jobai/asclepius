import { describe, expect, it, vi } from "vitest";
import { AccountLanguageSession, type SaveLanguage } from "./accountSession";

function deferred() {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = () => no(new Error("offline"));
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("account language save queue", () => {
  it("serializes writes and coalesces intermediate choices", async () => {
    const first = deferred();
    const last = deferred();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(last.promise);
    const session = new AccountLanguageSession(1, "auto", save, vi.fn());
    session.select("de");
    session.select("en");
    session.select("auto");
    expect(session.snapshot.preference).toBe("auto");
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve();
    await flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls.map(([language]) => language)).toEqual([
      "de",
      "auto",
    ]);
    last.resolve();
    await flush();
    expect(session.snapshot).toMatchObject({
      preference: "auto",
      saving: false,
      failed: false,
    });
  });

  it("keeps failed choices for the session and never retries automatically", async () => {
    const save = vi.fn().mockRejectedValue(new Error("budget exhausted"));
    const session = new AccountLanguageSession(1, "auto", save, vi.fn());
    session.select("de");
    await flush();
    session.refresh("en");
    expect(session.snapshot).toMatchObject({
      preference: "de",
      failed: true,
      saving: false,
    });
    expect(save).toHaveBeenCalledTimes(1);
    session.select("en");
    await flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it.each(["resolve", "reject"] as const)(
    "ignores stale %s after logout/account change",
    async (finish) => {
      const pending = deferred();
      const save = vi.fn<SaveLanguage>(() => pending.promise);
      const notify = vi.fn();
      const session = new AccountLanguageSession(1, "en", save, notify);
      session.select("de");
      session.select("auto");
      session.dispose();
      notify.mockClear();
      expect(save.mock.calls[0][1].aborted).toBe(true);
      pending[finish]();
      await flush();
      expect(notify).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledTimes(1);
    },
  );

  it("refreshes server preferences only before an explicit selection", () => {
    const session = new AccountLanguageSession(1, "de", vi.fn(), vi.fn());
    session.refresh("auto");
    expect(session.snapshot.preference).toBe("auto");
  });
});
