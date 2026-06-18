import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { caCert } from "@/lib/db";

const PEM = "-----BEGIN CERTIFICATE-----\nMIIabc123\n-----END CERTIFICATE-----\n";

afterEach(() => {
  delete process.env.DATABASE_CA_CERT;
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
