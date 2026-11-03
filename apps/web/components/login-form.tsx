"use client";

import { Button } from "@heroui/react";
import { Music2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setErrorMessage("");
    try {
      const supabase = createClient();
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage("Conta criada. Confirme o endereço de email pelo link enviado para entrar.");
        return;
      }
      window.location.assign("/");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível autenticar.");
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    setBusy(true);
    setMessage("");
    setErrorMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível iniciar o login com Google.");
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand">
          <span className="brand-mark"><Music2 size={20} /></span>
          Musician
        </div>
        <h1 id="auth-title">{mode === "login" ? "Sua música, em um só lugar." : "Crie sua conta."}</h1>
        <p className="muted">Entre para organizar sua biblioteca e suas playlists.</p>
        <form className="form-stack" onSubmit={submit}>
          <label className="field">
            Email
            <input
              className="text-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            Senha
            <input
              className="text-input"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="form-actions">
            <Button type="submit" isDisabled={busy}>
              {busy ? "Aguarde..." : mode === "login" ? "Entrar com email" : "Criar conta"}
            </Button>
            <button type="button" className="secondary-button" disabled={busy} onClick={googleLogin}>
              Continuar com Google
            </button>
          </div>
        </form>
        {message && <p className="notice" role="status">{message}</p>}
        {errorMessage && <p className="error-message" role="alert">{errorMessage}</p>}
        <p className="muted" style={{ marginTop: 22, textAlign: "center", fontSize: 13 }}>
          {mode === "login" ? "Ainda não tem conta?" : "Já tem uma conta?"}{" "}
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage("");
              setErrorMessage("");
            }}
          >
            {mode === "login" ? "Criar conta" : "Fazer login"}
          </button>
        </p>
      </section>
    </main>
  );
}
