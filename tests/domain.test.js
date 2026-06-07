"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  domainMatches,
  isTrackableUrl,
  normalizeSite
} = require("../lib/domain");

test("normalizes common mobile and www hostnames", () => {
  assert.equal(
    normalizeSite("https://www.youtube.com/watch?v=abc"),
    "youtube.com"
  );
  assert.equal(normalizeSite("m.instagram.com/explore"), "instagram.com");
});

test("keeps multi-part country domains intact", () => {
  assert.equal(normalizeSite("https://www.bbc.co.uk/news"), "bbc.co.uk");
});

test("rejects browser and extension pages", () => {
  assert.equal(isTrackableUrl("chrome://settings"), false);
  assert.equal(isTrackableUrl("chrome-extension://abc/page.html"), false);
  assert.equal(isTrackableUrl("https://example.com"), true);
});

test("matches a rule against its subdomains", () => {
  assert.equal(domainMatches("music.youtube.com", "youtube.com"), true);
  assert.equal(domainMatches("notyoutube.com", "youtube.com"), false);
});

