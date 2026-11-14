import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  engagementActive, engagementCreate, engagementDelete, engagementList, engagementOpen, engagementUpdate,
  type ActiveEngagement, type Engagement, type NewEngagement,
} from "../ipc";

type Ctx = {
  /** null until the first load finishes. */
  list: Engagement[] | null;
  active: ActiveEngagement | null;
  loaded: boolean;
  open: (id: string) => Promise<void>;
  create: (input: NewEngagement) => Promise<ActiveEngagement>;
  update: (name: string, client: string | null, notes: string | null) => Promise<void>;
  remove: (typedName: string) => Promise<void>;
  /** Re-reads the active engagement (attestation, size) and the list. */
  refresh: () => Promise<void>;
};

const EngagementContext = createContext<Ctx | null>(null);

export function EngagementProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Engagement[] | null>(null);
  const [active, setActive] = useState<ActiveEngagement | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const [l, a] = await Promise.all([engagementList(), engagementActive()]);
    setList(l);
    setActive(a);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({
      list,
      active,
      loaded,
      refresh,
      open: async (id) => {
        setActive(await engagementOpen(id));
        setList(await engagementList());
      },
      create: async (input) => {
        const a = await engagementCreate(input);
        setActive(a);
        setList(await engagementList());
        return a;
      },
      update: async (name, client, notes) => {
        if (!active) return;
        await engagementUpdate(active.engagement.id, name, client, notes);
        await refresh();
      },
      remove: async (typedName) => {
        if (!active) return;
        await engagementDelete(active.engagement.id, typedName);
        await refresh();
      },
    }),
    [list, active, loaded, refresh],
  );

  return <EngagementContext.Provider value={value}>{children}</EngagementContext.Provider>;
}

export function useEngagement(): Ctx {
  const c = useContext(EngagementContext);
  if (!c) throw new Error("useEngagement outside EngagementProvider");
  return c;
}
