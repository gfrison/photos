/**
 * ⚠️ CLIENT-SIDE CONFIGURATION - READ CAREFULLY ⚠️
 *
 * This file is imported by the client-side code (browser).
 * It MUST NOT import 'env.ts' or use 'process.env' directly.
 *
 * - This file defines the static default configuration.
 * - Environment variable overrides are handled in 'site.config.build.ts'.
 * - Client-side code accesses the final config via 'window.__AFILMORY__.config'.
 */

export interface SiteConfig {
  name: string;
  title: string;
  description: string;
  url: string;
  accentColor: string;
  language?: string;
  author: Author;
  social?: Social;
  feed?: Feed;
  map?: MapConfig;
  mapStyle?: string;
  mapProjection?: "globe" | "mercator";
}

/**
 * Map configuration: `map: ["maplibre"]` enables the map; omitting `map` (or
 * an empty array) disables it. The array form is reserved for future providers.
 */
type MapConfig = "maplibre"[];

interface Feed {
  folo?: {
    challenge?: {
      feedId: string;
      userId: string;
    };
  };
}
interface Author {
  name: string;
  url: string;
  avatar?: string;
}
interface Social {
  twitter?: string;
  github?: string;
  rss?: boolean;
}

export const siteConfig: SiteConfig = {
  name: "Giancarlo Frison — Photos",
  title: "Giancarlo Frison — Photos",
  description: "Photo stream by Giancarlo Frison.",
  url: "https://gfrison.com/photos",
  accentColor: "#007bff",
  language: "en",
  author: {
    name: "Giancarlo Frison",
    url: "https://gfrison.com",
    avatar: "https://gfrison.com/assets/images/profile-g.png",
  },
  social: {
    github: "gfrison",
    twitter: "gfrison",
    rss: false,
  },
  feed: {
    folo: {
      challenge: {
        feedId: "",
        userId: "",
      },
    },
  },
  map: ["maplibre"],
  mapStyle: "builtin",
  mapProjection: "mercator",
};

export default siteConfig;
