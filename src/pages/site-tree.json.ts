import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

type DirEntry = { type: "dir"; name: string; children: string[] };
type FileEntry = { type: "file"; name: string };
type ManifestEntry = DirEntry | FileEntry;
type Manifest = Record<string, ManifestEntry>;

export const GET: APIRoute = async () => {
  const projects = (await getCollection("projects")).sort(
    (a, b) => a.data.order - b.data.order
  );
  const posts = (
    await getCollection("blog", (entry) => entry.data.draft !== true)
  ).sort((a, b) => new Date(b.data.date).valueOf() - new Date(a.data.date).valueOf());

  const tree: Manifest = {
    "/": {
      type: "dir",
      name: "~",
      children: ["about.txt", "contact.txt", "projects", "blog"],
    },
    "/about": { type: "file", name: "about.txt" },
    "/contact": { type: "file", name: "contact.txt" },
    "/projects": {
      type: "dir",
      name: "projects",
      children: projects.map((p) => p.id),
    },
    "/blog": {
      type: "dir",
      name: "blog",
      children: posts.map((p) => p.id),
    },
  };

  for (const p of projects) {
    tree[`/projects/${p.id}`] = { type: "file", name: `${p.id}/README.md` };
  }

  for (const post of posts) {
    tree[`/blog/${post.id}`] = { type: "file", name: `${post.id}.md` };
  }

  return new Response(JSON.stringify(tree), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
