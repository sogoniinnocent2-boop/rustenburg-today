import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rustenburg Today",
    short_name: "Rustenburg",
    description: "Your city. Your stories. Your opportunities.",
    start_url: "/en",
    display: "standalone",
    background_color: "#F5F4EF",
    theme_color: "#102B27",
    lang: "en",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
