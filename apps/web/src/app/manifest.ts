import type { MetadataRoute } from "next";

/**
 * Makes FinTrack installable on a phone ("Add to Home Screen"): its own icon,
 * its own name, opening full-screen like an app. Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FinTrack",
    short_name: "FinTrack",
    description: "Your plan, your accounts and what really happened with your money.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c1210",
    theme_color: "#0c1210",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
