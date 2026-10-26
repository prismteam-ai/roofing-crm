// T020: sign-in form against the Cognito pool via SRP, typed lockout state rendered from the
// classified error (never a raw 500/blank screen), session persisted across a reload. No
// self-sign-up link anywhere on this page (AC-1).
// Layout follows the CRM boards CrmSignIn390/768/1440 (design/docs/CRM-HANDOFF.md "Sign-in and
// session"): top app bar, a card titled "Sign in to Roofing CRM" with its purpose line, Email and
// Password fields, a Show password toggle, a filled Sign in button and the plain "No account?"
// line. The sign-in, error and lockout logic is unchanged.
import { useCallback, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router";
import { classifySignInError, signIn } from "../../auth/signIn.js";
import { saveSession } from "../../auth/session.js";
import { Icon } from "../../components/Icon.js";
import styles from "./SignIn.module.css";

export function Component(): ReactElement {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setError(undefined);
      signIn(username, password)
        .then((session) => {
          saveSession(session);
          navigate("/", { replace: true });
        })
        .catch((cause: unknown) => {
          setError(classifySignInError(cause).message);
        })
        .finally(() => setSubmitting(false));
    },
    [username, password, navigate],
  );

  return (
    <div data-route="sign-in" className={styles.page}>
      <header className={styles.bar}>
        <h1 className={styles.barTitle}>Roofing CRM</h1>
      </header>
      <main className={styles.main}>
        <section aria-labelledby="sign-in-title" className={styles.card}>
          <div className={styles.heading}>
            <h2 id="sign-in-title" className={styles.title}>
              Sign in to Roofing CRM
            </h2>
            <p className={styles.lede}>
              Find aged roofs and long-open permits in Travis County, and track the leads you
              pursue.
            </p>
          </div>
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sign-in-email">
                Email
              </label>
              <input
                id="sign-in-email"
                name="email"
                type="email"
                autoComplete="username"
                className={styles.input}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-invalid={error !== undefined}
                aria-describedby={error !== undefined ? "sign-in-error" : undefined}
                required
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sign-in-password">
                Password
              </label>
              <span className={styles.passwordWrap}>
                <input
                  id="sign-in-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className={`${styles.input} ${styles.passwordInput}`}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={error !== undefined}
                  aria-describedby={error !== undefined ? "sign-in-error" : undefined}
                  required
                />
                {/* A toggle with a constant name; its pressed state says whether the value shows. */}
                <button
                  type="button"
                  className={styles.toggle}
                  aria-label="Show password"
                  aria-pressed={showPassword}
                  aria-controls="sign-in-password"
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  <Icon name={showPassword ? "visibility_off" : "visibility"} />
                </button>
              </span>
            </div>
            {error !== undefined && (
              <p id="sign-in-error" role="alert" data-sign-in-error="" className={styles.error}>
                <Icon name="error" size="medium" />
                {error}
              </p>
            )}
            <button type="submit" className={styles.submit} disabled={submitting}>
              {submitting ? (
                <span className={styles.spin}>
                  <Icon name="progress_activity" size="medium" />
                </span>
              ) : null}
              {submitting ? "Signing in…" : "Sign in"}
            </button>
            {/* Announced politely when sign-in starts (CrmSignInLoading390: the same words under
                the button), empty otherwise so it never reads out on its own. */}
            <p role="status" aria-live="polite" className={styles.progress}>
              {submitting ? "Signing in…" : ""}
            </p>
          </form>
          {/* No self sign-up link anywhere on this page (AC-1, constitution: no self-service path). */}
          <p className={styles.note}>No account? Access is shared privately with reviewers.</p>
        </section>
      </main>
    </div>
  );
}
