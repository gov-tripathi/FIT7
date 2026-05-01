import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";

interface AuthState {
  session: Session | null;
  user: Pick<User, "id" | "email"> | null;
  isGuest: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
}

const GUEST_KEY = "fitfuel-guest-mode";
export const GUEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const GUEST_EMAIL = "guest@fitfuel.local";

const Ctx = createContext<AuthState>({
  session: null,
  user: null,
  isGuest: false,
  loading: true,
  signOut: async () => {},
  continueAsGuest: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem(GUEST_KEY) === "true"
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => {})
      .finally(() => setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) {
        localStorage.removeItem(GUEST_KEY);
        setIsGuest(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (isGuest) {
      localStorage.removeItem(GUEST_KEY);
      setIsGuest(false);
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore — user may not have a real session
    }
  };

  const continueAsGuest = () => {
    localStorage.setItem(GUEST_KEY, "true");
    setIsGuest(true);
  };

  const user =
    session?.user ??
    (isGuest ? ({ id: GUEST_USER_ID, email: GUEST_EMAIL } as User) : null);

  return (
    <Ctx.Provider
      value={{ session, user, isGuest, loading, signOut, continueAsGuest }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
