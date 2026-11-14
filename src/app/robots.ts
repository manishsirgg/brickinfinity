import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/admin/",
          "/api/",
          "/buyer",
          "/enquiries",
          "/compare",
        ],
      },
    ],
    sitemap: "https://brickinfinity.com/sitemap.xml",
  };
}