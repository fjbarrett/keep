import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignUpForm } from "@/components/SignUpForm";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function submitSignup() {
  render(<SignUpForm />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "original-password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "original-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("signup verification recovery", () => {
  it.each([200, 409, 503])("offers a prefilled resend after signup returns %i", async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json(status === 200 ? { ok: true } : { error: "Signup needs attention." }, { status }));
    submitSignup();
    const resend = await screen.findByRole("button", { name: "Send new link" });
    expect(screen.getByLabelText("Email address for a new verification link")).toHaveValue("person@example.com");
    expect(document.querySelector("form form")).toBeNull();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/signin");
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    fireEvent.click(resend);
    await screen.findByText(/If that address has an unverified account/);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/auth/resend", expect.objectContaining({
      body: JSON.stringify({ email: "person@example.com" }),
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows resend errors visibly and allows retry", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    submitSignup();
    const resend = await screen.findByRole("button", { name: "Send new link" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Try again shortly." }, { status: 503 }));
    fireEvent.click(resend);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Try again shortly.");
    expect(screen.queryByText(/a new link is on its way/)).toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    fireEvent.click(resend);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Check your connection"));
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    fireEvent.click(resend);
    await screen.findByText(/a new link is on its way/);
  });

  it("keeps validation failures on signup without offering resend", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Use a stronger password." }, { status: 400 }));
    submitSignup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a stronger password.");
    expect(screen.queryByRole("button", { name: "Send new link" })).toBeNull();
  });
});
