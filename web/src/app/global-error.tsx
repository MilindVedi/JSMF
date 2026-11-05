"use client";

import { useEffect } from "react";
import { errorReporter } from "@/lib/error-reporting";

/**
 * Last resort: the root layout itself failed, so this replaces the whole
 * document — no global CSS, fonts or theme reach it. Kept to inline styles
 * that read in both colour schemes.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    errorReporter.report(error, "render", { digest: error.digest });
    errorReporter.flush(false);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          colorScheme: "light dark",
          padding: 16,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, margin: "0 0 16px" }}>
            JSMF could not load this page. It has been reported — please try again.
          </p>
          <button type="button" onClick={() => retry()} style={{ padding: "8px 16px", borderRadius: 999, cursor: "pointer" }}>
            Try again
          </button>
          {error.digest ? (
            <p style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.6, marginTop: 16 }}>Reference: {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
