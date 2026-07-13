import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { caCert, databaseSslOptions } from "@/lib/db";

const PEM = "-----BEGIN CERTIFICATE-----\nMIIabc123\n-----END CERTIFICATE-----\n";

afterEach(() => {
  delete process.env.DATABASE_CA_CERT;
});

describe("databaseSslOptions", () => {
  it("follows libpq verification semantics per sslmode", () => {
    expect(databaseSslOptions("require")).toEqual({ rejectUnauthorized: false });
    expect(databaseSslOptions("prefer")).toEqual({ rejectUnauthorized: false });
    expect(databaseSslOptions("verify-ca")).toEqual({ rejectUnauthorized: true });
    expect(databaseSslOptions("verify-full")).toEqual({ rejectUnauthorized: true });
  });

  it("uses a configured private CA while retaining verification", () => {
    expect(databaseSslOptions("require", PEM)).toEqual({
      ca: PEM,
      rejectUnauthorized: true,
    });
  });

  it("requires an explicit flag before disabling verification", () => {
    expect(() => databaseSslOptions("no-verify")).toThrow(/DATABASE_TLS_INSECURE/);
    expect(databaseSslOptions("no-verify", undefined, true)).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("does not enable TLS when sslmode is absent or disabled", () => {
    expect(databaseSslOptions(null)).toBeUndefined();
    expect(databaseSslOptions("disable")).toBeUndefined();
  });
});

describe("caCert", () => {
  it("returns undefined when DATABASE_CA_CERT is unset", () => {
    expect(caCert()).toBeUndefined();
  });

  it("returns inline PEM contents verbatim", () => {
    process.env.DATABASE_CA_CERT = PEM;
    expect(caCert()).toBe(PEM);
  });

  it("reads the certificate from a file path", () => {
    const dir = mkdtempSync(join(tmpdir(), "keep-ca-"));
    const file = join(dir, "ca.pem");
    writeFileSync(file, PEM);
    try {
      process.env.DATABASE_CA_CERT = file;
      expect(caCert()).toBe(PEM);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
