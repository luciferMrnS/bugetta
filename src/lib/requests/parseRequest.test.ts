import { describe, expect, it } from "vitest";
import { detectCategory, categoryLabel } from "@/lib/requests/categories";
import {
  extractBudgetKobo,
  extractDeadline,
  extractItemLines,
  extractSummary,
  parseImageLines,
} from "@/lib/requests/parseRequest";
import { minorUnitsFromMajor } from "@/lib/money";

describe("detectCategory", () => {
  it("detects groceries from the canonical example", () => {
    expect(
      detectCategory(
        "I need groceries for a family of four. Rice, chicken, tomatoes, onions and cooking oil. Budget NGN 50000.",
      ),
    ).toBe("GROCERIES");
  });

  it("detects fashion with a standalone 'dress'", () => {
    expect(detectCategory("I need a black dress, size 12, under N80000")).toBe(
      "FASHION",
    );
  });

  it("does not treat 'address' as fashion", () => {
    expect(detectCategory("Please find my address book")).toBe("OTHER");
  });

  it("classifies food, electronics, beauty, home services and events", () => {
    expect(detectCategory("dinner for six, nothing spicy")).toBe("FOOD");
    expect(detectCategory("a used iphone 13 good battery")).toBe("ELECTRONICS");
    expect(detectCategory("makeup kit and lashes")).toBe("BEAUTY");
    expect(detectCategory("a plumber to fix a leaking tap")).toBe(
      "HOME_SERVICES",
    );
    expect(detectCategory("wedding decorations for 200 guests")).toBe("EVENTS");
  });

  it("falls back to OTHER for unrelated text", () => {
    expect(detectCategory("for no particular reason")).toBe("OTHER");
  });

  it("labels categories human-readably", () => {
    expect(categoryLabel("GROCERIES")).toBe("Groceries");
    expect(categoryLabel("UNKNOWN_CATEGORY")).toBe("Other / Not sure");
  });
});

describe("extractBudgetKobo", () => {
  it("parses a naira symbol prefix", () => {
    expect(extractBudgetKobo("Budget N50,000")).toBe(
      minorUnitsFromMajor(50_000),
    );
    expect(extractBudgetKobo("under N80,000 delivered")).toBe(
      minorUnitsFromMajor(80_000),
    );
  });

  it("parses a naira suffix", () => {
    expect(extractBudgetKobo("a budget of 50000 naira")).toBe(
      minorUnitsFromMajor(50_000),
    );
  });

  it("parses the 'k' shorthand", () => {
    expect(extractBudgetKobo("budget 30k naira")).toBe(
      minorUnitsFromMajor(30_000),
    );
  });

  it("parses spoken budget intents without a currency symbol", () => {
    expect(
      extractBudgetKobo("i need to buy foodstuff but i don't have more than 50k"),
    ).toBe(minorUnitsFromMajor(50_000));
    expect(extractBudgetKobo("can only spend 50000")).toBe(
      minorUnitsFromMajor(50_000),
    );
    expect(extractBudgetKobo("max of 30k on it")).toBe(
      minorUnitsFromMajor(30_000),
    );
    expect(extractBudgetKobo("at most 45,000 delivered")).toBe(
      minorUnitsFromMajor(45_000),
    );
  });

  it("does not mistake a small bare number for a budget", () => {
    expect(extractBudgetKobo("I need only 2 bags")).toBeNull();
    expect(extractBudgetKobo("about 3 pairs of shoes")).toBeNull();
  });

  it("returns null when no currency amount appears", () => {
    expect(extractBudgetKobo("I just need a black dress")).toBeNull();
    // Bare numbers (e.g. quantities) must not be mistaken for budgets.
    expect(extractBudgetKobo("I need 3 bags and 2 pairs")).toBeNull();
  });
});

describe("extractItemLines", () => {
  it("splits a comma-separated list and strips the lead-in", () => {
    expect(
      extractItemLines(
        "I need rice, chicken, tomatoes, onions and cooking oil",
      ),
    ).toEqual(["rice", "chicken", "tomatoes", "onions", "cooking oil"]);
  });

  it("parses a bullet list", () => {
    expect(extractItemLines("• Rice\n• Chicken\n- Tomatoes\n- Onions")).toEqual(
      ["Rice", "Chicken", "Tomatoes", "Onions"],
    );
  });

  it("drops budget and deadline meta segments", () => {
    const items = extractItemLines(
      "groceries for a family of four. rice, chicken, tomatoes. budget N50,000. delivered by Saturday.",
    );
    expect(items).toEqual(["rice", "chicken", "tomatoes"]);
    expect(items.some((i) => /budget/i.test(i))).toBe(false);
    expect(items.some((i) => /deliver/i.test(i))).toBe(false);
  });

  it("deduplicates items and caps the count", () => {
    const items = extractItemLines(
      "salt, salt, sugar, sugar, a, ab, abc, abcd, abcde, abcdef, abcdefg, abcdefgh, abcdefghi, abcdefghij, abcdefghijk, abcdefghijkl, xyz",
    );
    expect(new Set(items.map((i) => i.toLowerCase())).size).toBe(items.length);
    expect(items.length).toBeLessThanOrEqual(15);
  });
});

describe("extractDeadline", () => {
  const friday = new Date("2026-09-11T12:00:00Z"); // a Friday
  const saturday = new Date("2026-09-12T12:00:00Z");

  it("resolves 'tomorrow'", () => {
    const tomorrow = extractDeadline("delivered tomorrow", friday);
    expect(tomorrow?.toISOString().slice(0, 10)).toBe("2026-09-12");
  });

  it("resolves 'by <weekday>' to the next occurrence of that day", () => {
    expect(extractDeadline("by Monday", friday)?.toISOString().slice(0, 10)).toBe(
      "2026-09-14",
    );
    // A Saturday request for Saturday should roll to next week.
    expect(
      extractDeadline("on Saturday", saturday)?.toISOString().slice(0, 10),
    ).toBe("2026-09-19");
  });

  it("resolves 'in N days'", () => {
    expect(extractDeadline("in 3 days", friday)?.toISOString().slice(0, 10)).toBe(
      "2026-09-14",
    );
  });

  it("returns a deadline pinned to end of day", () => {
    const deadline = extractDeadline("tomorrow", friday);
    expect(deadline?.getHours()).toBe(23);
  });

  it("returns null without a deadline", () => {
    expect(extractDeadline("a black dress size 12")).toBeNull();
  });
});

describe("extractSummary", () => {
  it("produces a short 'Needs X' label from the need clause", () => {
    expect(extractSummary("I need a black dress size 12")).toBe(
      "Needs black dress size 12",
    );
  });

  it("keeps the exact need and drops surrounding context", () => {
    expect(
      extractSummary("i am stuck on the highway, i need a mechanic"),
    ).toBe("Needs mechanic");
    expect(
      extractSummary("I need to buy foodstuff but i don't have more than 50k"),
    ).toBe("Needs foodstuff");
    expect(
      extractSummary("I need a plumber asap, under 20k"),
    ).toBe("Needs plumber");
  });

  it("cuts budget, delivery and preference clauses", () => {
    expect(
      extractSummary(
        "I need dinner for 6 tonight, nothing too spicy, budget about ₦40k, deliver to Lekki",
      ),
    ).toBe("Needs dinner for 6 tonight, nothing too spicy");
  });

  it("falls back to the plain text when there is no need clause", () => {
    expect(extractSummary("groceries for a family of four")).toBe(
      "Needs groceries for a family of four",
    );
  });

  it("truncates long text at a word boundary", () => {
    const long = "Would really appreciate a medium brown leather handbag ".repeat(
      3,
    );
    const summary = extractSummary(long, 60);
    expect(summary.length).toBeLessThanOrEqual(72);
    expect(summary.endsWith("…")).toBe(true);
  });
});

describe("parseImageLines", () => {
  it("keeps up to 5 valid http(s) links", () => {
    const lines = [
      "https://example.com/a.jpg",
      "  http://example.com/b.png  ",
      "not a url",
      "https://example.com/a.jpg", // duplicate
      "ftp://example.com/x.jpg", // non-http scheme
      "https://example.com/c.jpg",
      "https://example.com/d.jpg",
      "https://example.com/e.jpg",
      "https://example.com/f.jpg", // over the cap
    ].join("\n");
    expect(parseImageLines(lines)).toEqual([
      "https://example.com/a.jpg",
      "http://example.com/b.png",
      "https://example.com/c.jpg",
      "https://example.com/d.jpg",
      "https://example.com/e.jpg",
    ]);
  });

  it("returns an empty list for blank input", () => {
    expect(parseImageLines("")).toEqual([]);
    expect(parseImageLines("   ")).toEqual([]);
  });
});