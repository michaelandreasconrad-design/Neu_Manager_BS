import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Translator from "@/components/Translator";

const HEALTH = { model: "test-model", rate_limit: "20/minute" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

function mockApi(translate: () => Response | Promise<Response>) {
  fetchMock.mockImplementation((url: string) =>
    String(url).endsWith("/api/health") ? Promise.resolve(jsonResponse(HEALTH)) : Promise.resolve(translate()),
  );
}

async function translateText(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole("textbox"), text);
  await user.click(screen.getByRole("button", { name: /Übersetzen/ }));
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Translator", () => {
  it("zeigt nach erfolgreichem Health-Check online, Modell und Limit", async () => {
    mockApi(() => jsonResponse({}));
    render(<Translator />);
    expect(await screen.findByText(/online/)).toBeInTheDocument();
    expect(screen.getByText("model: test-model")).toBeInTheDocument();
    expect(screen.getByText("limit 20/min")).toBeInTheDocument();
  });

  it("zeigt offline, wenn das Backend nicht antwortet", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    render(<Translator />);
    expect(await screen.findByText(/offline/)).toBeInTheDocument();
  });

  it("deaktiviert den Button bei leerem Text und aktiviert ihn bei Eingabe", async () => {
    mockApi(() => jsonResponse({}));
    const user = userEvent.setup();
    render(<Translator />);
    const button = screen.getByRole("button", { name: /Übersetzen/ });
    expect(button).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "Hallo");
    expect(button).toBeEnabled();
  });

  it("zeigt den Zeichenzähler", async () => {
    mockApi(() => jsonResponse({}));
    const user = userEvent.setup();
    render(<Translator />);
    expect(screen.getByText("0/500")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "abc");
    expect(screen.getByText("3/500")).toBeInTheDocument();
  });

  it("schickt getrimmten Text, Richtung und Intensität und zeigt das Ergebnis", async () => {
    mockApi(() => jsonResponse({ result: "Business-Text", tokens: 42 }));
    const user = userEvent.setup();
    render(<Translator />);
    await user.click(screen.getByRole("radio", { name: "max" }));
    await translateText(user, "  Ich habe das vergessen.  ");

    expect(await screen.findByText("Business-Text")).toBeInTheDocument();
    expect(screen.getByText("tokens 42")).toBeInTheDocument();

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/translate"))!;
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({
      text: "Ich habe das vergessen.",
      direction: "to_business",
      intensity: "high",
    });
  });

  it("löst die Übersetzung per Strg+Enter aus", async () => {
    mockApi(() => jsonResponse({ result: "Ergebnis", tokens: 1 }));
    const user = userEvent.setup();
    render(<Translator />);
    await user.type(screen.getByRole("textbox"), "Test");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(await screen.findByText("Ergebnis")).toBeInTheDocument();
  });

  it("übernimmt ein Beispiel ins Eingabefeld", async () => {
    mockApi(() => jsonResponse({}));
    const user = userEvent.setup();
    render(<Translator />);
    await user.click(screen.getByRole("button", { name: "Das war ein Fehler von mir." }));
    expect(screen.getByRole("textbox")).toHaveValue("Das war ein Fehler von mir.");
  });

  it("deaktiviert die Intensität in Richtung business → klartext", async () => {
    mockApi(() => jsonResponse({}));
    const user = userEvent.setup();
    render(<Translator />);
    await user.click(screen.getByRole("radio", { name: "business → klartext" }));
    for (const name of ["low", "mid", "max"]) {
      expect(screen.getByRole("radio", { name })).toBeDisabled();
    }
  });

  it("übernimmt beim Richtungswechsel das Ergebnis als neuen Eingabetext", async () => {
    mockApi(() => jsonResponse({ result: "Business-Text", tokens: 1 }));
    const user = userEvent.setup();
    render(<Translator />);
    await translateText(user, "Klartext");
    await screen.findByText("Business-Text");
    await user.click(screen.getByRole("radio", { name: "business → klartext" }));
    expect(screen.getByRole("textbox")).toHaveValue("Business-Text");
    expect(screen.getByText("// die Übersetzung erscheint hier")).toBeInTheDocument();
  });

  it("zeigt eine eigene Meldung bei HTTP 429", async () => {
    mockApi(() => jsonResponse({ detail: "rate" }, 429));
    const user = userEvent.setup();
    render(<Translator />);
    await translateText(user, "Test");
    expect(await screen.findByRole("alert")).toHaveTextContent("Zu viele Anfragen");
  });

  it("zeigt die Fehlermeldung des Backends (detail)", async () => {
    mockApi(() => jsonResponse({ detail: "Text zu lang." }, 422));
    const user = userEvent.setup();
    render(<Translator />);
    await translateText(user, "Test");
    expect(await screen.findByRole("alert")).toHaveTextContent("Text zu lang.");
  });

  it("meldet Netzwerkfehler und setzt den Status auf offline", async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).endsWith("/api/health")
        ? Promise.resolve(jsonResponse(HEALTH))
        : Promise.reject(new TypeError("fetch failed")),
    );
    const user = userEvent.setup();
    render(<Translator />);
    await screen.findByText(/online/);
    await translateText(user, "Test");
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend nicht erreichbar");
    await waitFor(() => expect(screen.getByText(/offline/)).toBeInTheDocument());
  });

  it("kopiert das Ergebnis in die Zwischenablage", async () => {
    mockApi(() => jsonResponse({ result: "Kopiermich", tokens: 1 }));
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Translator />);
    await translateText(user, "Test");
    await screen.findByText("Kopiermich");
    await user.click(screen.getByRole("button", { name: "copy" }));
    expect(writeText).toHaveBeenCalledWith("Kopiermich");
    expect(await screen.findByRole("button", { name: "copied" })).toBeInTheDocument();
  });
});
