import { describe, expect, it } from "vitest";
import { parseMusicUrl } from "./music";

describe("parseMusicUrl", () => {
  it("accepts a YouTube watch URL", () => {
    expect(parseMusicUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      externalId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("accepts a short YouTube URL", () => {
    expect(parseMusicUrl("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({
      provider: "youtube",
      externalId: "dQw4w9WgXcQ",
    });
  });

  it("accepts an individual Spotify track", () => {
    expect(parseMusicUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toMatchObject({
      provider: "spotify",
      externalId: "4uLU6hMCjMI75M1A2tKUQC",
    });
  });

  it.each([
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://open.spotify.com/playlist/4uLU6hMCjMI75M1A2tKUQC",
    "https://open.spotify.com@evil.example/track/4uLU6hMCjMI75M1A2tKUQC",
  ])("rejects unsupported or unsafe URL %s", (url) => {
    expect(() => parseMusicUrl(url)).toThrow();
  });
});
