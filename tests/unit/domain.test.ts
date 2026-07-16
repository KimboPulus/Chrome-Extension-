import {
  domainMatches,
  isTrackableUrl,
  normalizeSite,
} from "../../src/domain/domain";

describe("domain normalization", () => {
  it("uses registrable domains, including multi-part public suffixes", () => {
    expect(normalizeSite("https://www.youtube.com/watch?v=abc")).toBe(
      "youtube.com",
    );
    expect(normalizeSite("m.instagram.com/explore")).toBe("instagram.com");
    expect(normalizeSite("https://news.bbc.co.uk/story")).toBe("bbc.co.uk");
  });

  it("keeps local and IP hosts usable", () => {
    expect(normalizeSite("http://localhost:3000")).toBe("localhost");
    expect(normalizeSite("http://127.0.0.1:8080")).toBe("127.0.0.1");
  });

  it("rejects privileged browser pages", () => {
    expect(isTrackableUrl("chrome://settings")).toBe(false);
    expect(isTrackableUrl("chrome-extension://abc/page.html")).toBe(false);
    expect(isTrackableUrl("https://example.com")).toBe(true);
  });

  it("matches a parent rule without false suffix matches", () => {
    expect(domainMatches("music.youtube.com", "youtube.com")).toBe(true);
    expect(domainMatches("notyoutube.com", "youtube.com")).toBe(false);
  });
});
