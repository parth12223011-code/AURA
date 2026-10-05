"use client";

import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { auth } from "@/lib/firebase";

type Mode = "create" | "signin";

function friendlyAuthError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "";

  if (code.includes("invalid-email")) return "That email address doesn’t look right. Check it and try again.";
  if (code.includes("api-key-not-valid") || code.includes("invalid-api-key")) return "AURA’s Firebase API key is invalid. Check the web app config in Firebase Project settings.";
  if (code.includes("operation-not-allowed")) return "Email/Password sign-in is disabled in Firebase Authentication providers.";
  if (code.includes("configuration-not-found")) return "Firebase Authentication isn’t enabled for this project yet.";
  if (code.includes("email-already-in-use")) return "An account already uses this email. Sign in instead.";
  if (code.includes("weak-password")) return "Choose a password with at least 6 characters.";
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) {
    return "Email or password doesn’t match. Try again or reset your password.";
  }
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a little and try again.";
  if (code.includes("unauthorized-domain")) return "Add localhost to Firebase’s authorized domains, then try again.";
  if (code.includes("network-request-failed")) return "You seem to be offline. Check your connection and try again.";
  return "AURA couldn’t complete sign-in. Please try again.";
}

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "create") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      router.replace("/");
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordReset() {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Enter your email first, then choose Forgot password.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice("If an account exists for this email, a password reset link is on its way.");
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page min-h-screen overflow-hidden px-5 py-7 text-white sm:px-8 sm:py-10">
      <div className="auth-stars" aria-hidden="true" />
      <div className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col">
        <header className="flex items-center gap-3">
          <div className="auth-logo grid h-11 w-11 place-items-center rounded-2xl font-black text-white">A</div>
          <div>
            <p className="text-lg font-black tracking-tight">AURA</p>
            <p className="text-xs font-medium text-indigo-200/70">Learn it your way</p>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-14">
          <section className="relative hidden min-h-[520px] items-center lg:flex" aria-label="Welcome to AURA">
            <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
            <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
            <div className="auth-float-card auth-float-card-top" aria-hidden="true">
              <span className="auth-float-icon bg-sky-300/15 text-sky-200">◈</span>
              <span><strong>Ideas that click</strong><small>Visual lessons, made for you</small></span>
            </div>
            <div className="auth-hero-sphere" aria-hidden="true"><span>A</span></div>
            <div className="auth-float-card auth-float-card-bottom" aria-hidden="true">
              <span className="auth-float-icon bg-amber-300/15 text-amber-200">✦</span>
              <span><strong>Your next “aha!”</strong><small>One good question away</small></span>
            </div>
            <div className="relative z-10 max-w-xl pt-64">
              <p className="mb-4 text-xs font-extrabold tracking-[0.28em] text-cyan-200">A LITTLE MORE AHA</p>
              <h1 className="text-5xl font-black leading-[1.08] tracking-tight xl:text-6xl">
                Make room for your next <span className="auth-gradient-text">big idea.</span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-indigo-100/70">
                AURA shapes each lesson around how you like to learn. Come curious; leave knowing more.
              </p>
            </div>
          </section>

          <section className="auth-card-wrap mx-auto w-full max-w-[460px]" aria-labelledby="sign-in-heading">
            <div className="auth-card rounded-[30px] border border-white/15 bg-white/[0.09] p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-9">
              <div className="mb-7 flex items-center justify-between">
                <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-cyan-100">
                  Your learning space
                </span>
                <span className="text-xl text-amber-200" aria-hidden="true">✦</span>
              </div>
              <p className="text-sm font-bold text-indigo-200">{mode === "create" ? "START YOUR AURA JOURNEY" : "WELCOME BACK"}</p>
              <h2 id="sign-in-heading" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                {mode === "create" ? "Create your account" : "Sign in to AURA"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-indigo-100/65">
                {mode === "create" ? "Save your place and make every lesson yours." : "Your next great question is waiting."}
              </p>

              <form onSubmit={handleSubmit} className="mt-7 grid gap-4">
                <label className="grid gap-2 text-sm font-bold text-indigo-50" htmlFor="aura-email">
                  Email address
                  <input
                    id="aura-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="auth-input w-full rounded-2xl border border-white/15 bg-[#090d24]/65 px-4 py-3.5 text-base font-medium text-white outline-none placeholder:text-indigo-100/35 focus:border-cyan-200/70 focus:ring-4 focus:ring-cyan-200/10"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-indigo-50" htmlFor="aura-password">
                  Password
                  <span className="relative block">
                    <input
                      id="aura-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={mode === "create" ? "new-password" : "current-password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 6 characters"
                      className="auth-input w-full rounded-2xl border border-white/15 bg-[#090d24]/65 px-4 py-3.5 pr-20 text-base font-medium text-white outline-none placeholder:text-indigo-100/35 focus:border-cyan-200/70 focus:ring-4 focus:ring-cyan-200/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute inset-y-0 right-3 my-auto h-9 rounded-lg px-2 text-xs font-bold text-indigo-200/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </span>
                </label>

                {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm font-semibold text-rose-100">{error}</p>}
                {notice && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-semibold text-emerald-100">{notice}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="auth-submit mt-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 px-5 py-4 font-extrabold text-[#10152f] shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-wait disabled:opacity-70"
                >
                  {busy ? "One moment…" : mode === "create" ? "Create account" : "Sign in"}
                  {!busy && <span aria-hidden="true">→</span>}
                </button>
              </form>

              <div className="mt-5 flex min-h-6 items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={busy}
                  className={`font-semibold text-indigo-200/75 underline decoration-indigo-200/30 underline-offset-4 hover:text-white ${mode === "create" ? "invisible" : ""}`}
                  tabIndex={mode === "create" ? -1 : 0}
                >
                  Forgot password?
                </button>
                <span className="text-right text-indigo-100/55">
                  {mode === "create" ? "Already have an account?" : "New to AURA?"}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode((current) => current === "create" ? "signin" : "create");
                      setError("");
                      setNotice("");
                    }}
                    className="font-extrabold text-cyan-200 hover:text-white"
                  >
                    {mode === "create" ? "Sign in" : "Create one"}
                  </button>
                </span>
              </div>
              <p className="mt-7 border-t border-white/10 pt-5 text-center text-xs leading-5 text-indigo-100/45">
                By continuing, you’re creating a personal AURA learning account.
              </p>
            </div>
            <p className="mt-5 text-center text-xs font-medium text-indigo-100/40">AURA · Learn it your way</p>
          </section>
        </div>
      </div>
    </main>
  );
}
