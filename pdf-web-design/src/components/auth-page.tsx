import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { StorefrontLayout } from "@/components/storefront";
import { Button } from "@/components/ui/button";

function GoogleMark() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.6 0-4.81-1.76-5.6-4.13H3.06v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.86A6 6 0 0 1 6.09 12c0-.65.11-1.28.31-1.86V7.52H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.48l3.34-2.62Z"/><path fill="#EA4335" d="M12 6.01c1.47 0 2.79.5 3.82 1.49l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.94 5.52l3.34 2.62c.79-2.37 3-4.13 5.6-4.13Z"/></svg> }

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password") ?? "");
    if (signup && password.length < 12) { setError("Use at least 12 characters — a memorable phrase works best."); return; }
    setSubmitting(true); window.setTimeout(() => setSubmitting(false), 1200);
  };
  return <StorefrontLayout><section className="auth-stage">
    <div className="auth-aside">
      <span className="eyebrow"><ShieldCheck size={14}/> Secure access</span>
      <h1 className="font-display text-4xl font-semibold leading-tight text-brand-deep md:text-5xl">Your study desk, exactly as you left it.</h1>
      <p className="max-w-md text-base leading-relaxed text-muted-foreground">Keep purchased resources, focused revision, and your next milestone together.</p>
      <div className="space-y-3 text-sm text-foreground">
        {['Access every resource you have bought','Return to your in-progress purchase','One account across your library'].map(item => <p key={item} className="flex items-center gap-2"><CheckCircle2 size={17} className="text-success"/>{item}</p>)}
      </div>
    </div>
    <div className="auth-card">
      <div><p className="mb-2 text-xs font-bold uppercase text-primary">JSMF account</p><h2 className="font-display text-2xl font-semibold text-brand-deep">{signup ? "Create your account" : "Welcome back"}</h2><p className="mt-2 text-sm text-muted-foreground">{signup ? "Start building your personal revision library." : "Sign in to access everything you have bought."}</p></div>
      <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
        {signup && <label className="field-label">Name<input name="name" required className="field" placeholder="Your full name"/></label>}
        <label className="field-label">Email<input name="email" type="email" required className="field" placeholder="you@example.com"/></label>
        <label className="field-label">Password<span className="relative block"><input name="password" type={showPassword ? "text" : "password"} required minLength={signup ? 12 : undefined} className="field pr-12" placeholder={signup ? "At least 12 characters" : "Your password"}/><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
        {signup && <p className="text-xs leading-relaxed text-muted-foreground">A memorable phrase beats a short, complicated password.</p>}
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? (signup ? "Creating account…" : "Signing in…") : (signup ? "Create account" : "Sign in")} {!submitting && <ArrowRight size={16}/>}</Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/>or<span className="h-px flex-1 bg-border"/></div>
      <Button variant="secondary" className="w-full"><GoogleMark/>{signup ? "Sign up with Google" : "Continue with Google"}</Button>
      <p className="mt-6 text-center text-sm text-muted-foreground">{signup ? "Already have an account?" : "New here?"} <Link to={signup ? "/account/login" : "/account/signup"} className="font-semibold text-primary hover:underline">{signup ? "Sign in" : "Create an account"}</Link></p>
    </div>
  </section></StorefrontLayout>;
}