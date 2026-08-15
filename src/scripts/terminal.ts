// Real interactive terminal layer on top of the static Signal site.
// Reads /site-tree.json (see spec: flat object keyed by absolute path) and
// implements cd/ls/cat as a client-side router over that virtual tree,
// while every route also remains a fully real, independently-loadable page.

type DirEntry = { type: "dir"; name: string; children: string[] };
type FileEntry = { type: "file"; name: string };
type ManifestEntry = DirEntry | FileEntry;
type Manifest = Record<string, ManifestEntry>;

const HELP_TEXT = `available commands:
  ls [path]        list a directory
  cd [path]        change directory (.. and ~ work)
  cat <file>       print a file
  pwd              print current directory
  whoami           who you are
  clear            clear the screen
  help             this message

tip: names in ls output are clickable too.`;

const NAV_ROUTES = ["/", "/projects", "/blog", "/about", "/contact"];

let manifest: Manifest = {};
// dirPath -> (children[] entry -> that child's real manifest key). Needed
// because a dir's children[] holds display-style segment names that don't
// always literally join into the child's actual path (e.g. root's fixed
// "about.txt" child lives at "/about", not "/about.txt").
let childPathMap: Record<string, Record<string, string>> = {};
let cwd = "/";
let cmdHistory: string[] = [];
let historyIndex = 0;

let sessionEl: HTMLElement;
let navEl: HTMLElement | null;
let inputEl: HTMLInputElement;
let promptPrefixEl: HTMLElement | null;
let titleEl: HTMLElement | null;
let statusEl: HTMLElement | null;
let mirrorEl: HTMLElement | null;
let fakeCursorEl: HTMLElement | null;

// ---- pure path helpers -----------------------------------------------

function cwdDisplay(path: string): string {
  return path === "/" ? "~" : "~" + path;
}

function parentOf(path: string): string {
  if (path === "/") return "/";
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

function joinPath(dir: string, name: string): string {
  return dir === "/" ? "/" + name : dir + "/" + name;
}

// Builds childPathMap: for each dir's children[] entry, resolve the actual
// manifest key it points at. Tries the literal join first (true for
// projects/blog, whose children[] entries are real path segments); falls
// back to matching a sibling entry's display `name` (true for root's fixed
// "about.txt"/"contact.txt" children, whose manifest keys are "/about" and
// "/contact").
function buildChildPathMap(m: Manifest): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  for (const [dirPath, entry] of Object.entries(m)) {
    if (entry.type !== "dir") continue;
    const byName: Record<string, string> = {};
    for (const childName of entry.children) {
      const literal = joinPath(dirPath, childName);
      if (m[literal]) {
        byName[childName] = literal;
        continue;
      }
      const aliased = Object.keys(m).find(
        (k) => k !== dirPath && parentOf(k) === dirPath && m[k].name === childName
      );
      if (aliased) byName[childName] = aliased;
    }
    map[dirPath] = byName;
  }
  return map;
}

function resolveChildPath(dirPath: string, childName: string): string {
  return childPathMap[dirPath]?.[childName] ?? joinPath(dirPath, childName);
}

function resolvePath(fromCwd: string, rawInput: string): string | null {
  const input = rawInput === "" ? "." : rawInput;

  if (input === "~") {
    return manifest["/"] ? "/" : null;
  }

  let current: string;
  let rest: string;
  if (input.startsWith("/")) {
    current = "/";
    rest = input;
  } else if (input.startsWith("~/")) {
    current = "/";
    rest = input.slice(2);
  } else {
    current = fromCwd;
    rest = input;
  }

  const segments = rest.split("/").filter((s) => s.length > 0);

  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") {
      current = parentOf(current);
      continue;
    }
    const entry = manifest[current];
    if (!entry || entry.type !== "dir") return null;
    if (!entry.children.includes(seg)) return null;
    current = resolveChildPath(current, seg);
  }

  return manifest[current] ? current : null;
}

// ---- DOM output helpers -----------------------------------------------

function appendEcho(commandText: string): void {
  const div = document.createElement("div");
  div.className = "term-line";
  const promptSpan = document.createElement("span");
  promptSpan.className = "prompt";
  promptSpan.textContent = `gericapo98@site:${cwdDisplay(cwd)}$`;
  const outSpan = document.createElement("span");
  outSpan.className = "out";
  outSpan.textContent = commandText;
  div.append(promptSpan, document.createTextNode(" "), outSpan);
  sessionEl.appendChild(div);
}

function printOut(text: string, isError = false): void {
  const div = document.createElement("div");
  div.className = isError ? "term-line out term-error" : "term-line out";
  div.textContent = text;
  sessionEl.appendChild(div);
}

function renderLsDir(dirPath: string, entry: DirEntry): void {
  const block = document.createElement("div");
  block.className = "term-block";

  for (const childSeg of entry.children) {
    const childPath = resolveChildPath(dirPath, childSeg);
    const childEntry = manifest[childPath];
    if (!childEntry) continue;

    const line = document.createElement("div");
    line.className = "term-line out ls-entry";

    const perms = document.createElement("span");
    perms.className = "term-perms";
    perms.textContent = (childEntry.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--") + " ";

    const a = document.createElement("a");
    a.href = childPath;
    a.className = childEntry.type === "dir" ? "term-dir-link" : "term-file-link";
    a.textContent = childEntry.name + (childEntry.type === "dir" ? "/" : "");

    line.append(perms, a);
    block.appendChild(line);
  }

  sessionEl.appendChild(block);
}

function scrollToBottom(): void {
  window.scrollTo(0, document.documentElement.scrollHeight);
}

function focusInput(): void {
  inputEl.focus();
}

function setStatus(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

function updateTopBarTitle(path: string): void {
  if (titleEl) titleEl.textContent = `gericapo98@site: ${cwdDisplay(path)} — bash`;
}

function updatePromptPrefix(path: string): void {
  if (promptPrefixEl) promptPrefixEl.textContent = cwdDisplay(path);
}

function activeNavHref(route: string): string | null {
  if (route === "/") return "/";
  let best: string | null = null;
  for (const r of NAV_ROUTES) {
    if (r === "/") continue;
    if (route === r || route.startsWith(r + "/")) {
      if (!best || r.length > best.length) best = r;
    }
  }
  return best;
}

function updateNavActive(route: string): void {
  const active = activeNavHref(route);
  document.querySelectorAll<HTMLAnchorElement>(".nav-flags a").forEach((a) => {
    if (a.getAttribute("href") === active) {
      a.setAttribute("aria-current", "page");
    } else {
      a.removeAttribute("aria-current");
    }
  });
}

// ---- fetch + navigation mechanics --------------------------------------

async function fetchDoc(route: string): Promise<{ doc: Document; newSession: HTMLElement } | null> {
  try {
    const res = await fetch(route);
    if (!res.ok) return null;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const newSession = doc.getElementById("session");
    if (!newSession) return null;
    return { doc, newSession };
  } catch {
    return null;
  }
}

async function navigate(resolvedPath: string, changeCwd: boolean): Promise<void> {
  const result = await fetchDoc(resolvedPath);
  if (!result) {
    // fall back to a real navigation rather than leaving the session stuck
    window.location.assign(resolvedPath);
    return;
  }
  const { doc, newSession } = result;

  const block = document.createElement("div");
  block.className = "term-block";
  block.innerHTML = newSession.innerHTML;
  sessionEl.appendChild(block);

  if (changeCwd) {
    cwd = resolvedPath;
    updateTopBarTitle(cwd);
    updatePromptPrefix(cwd);
  }

  window.history.pushState(null, "", resolvedPath);
  document.title = doc.title;
  updateNavActive(resolvedPath);
  setStatus(`Now viewing ${resolvedPath}`);
  scrollToBottom();
  focusInput();
}

// ---- commands -----------------------------------------------------------

function doPwd(): void {
  printOut(cwdDisplay(cwd));
}

function doWhoami(): void {
  printOut("gericapo98");
}

function doHelp(): void {
  printOut(HELP_TEXT);
}

function doLs(argPath: string | undefined): void {
  const target = argPath ?? ".";
  const resolved = resolvePath(cwd, target);
  if (!resolved) {
    printOut(`ls: ${target}: No such file or directory`, true);
    return;
  }
  const entry = manifest[resolved];
  if (entry.type === "file") {
    printOut(entry.name);
    return;
  }
  renderLsDir(resolved, entry);
}

async function doCd(argPath: string | undefined): Promise<void> {
  const target = argPath ?? ".";
  const resolved = resolvePath(cwd, target);
  if (!resolved) {
    printOut(`bash: cd: ${target}: No such file or directory`, true);
    return;
  }
  const entry = manifest[resolved];
  if (entry.type === "file") {
    printOut(`bash: cd: ${target}: Not a directory`, true);
    return;
  }
  await navigate(resolved, true);
}

async function doCat(argPath: string | undefined): Promise<void> {
  if (!argPath) {
    printOut("cat: missing file operand", true);
    return;
  }
  const resolved = resolvePath(cwd, argPath);
  if (!resolved) {
    printOut(`cat: ${argPath}: No such file or directory`, true);
    return;
  }
  const entry = manifest[resolved];
  if (entry.type === "dir") {
    printOut(`cat: ${argPath}: Is a directory`, true);
    return;
  }
  await navigate(resolved, false);
}

function clearScrollback(): void {
  sessionEl.innerHTML = "";
}

async function runCommand(raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (trimmed === "") return;

  cmdHistory.push(trimmed);
  historyIndex = cmdHistory.length;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const arg = parts[1];

  if (cmd === "clear") {
    clearScrollback();
    return;
  }

  appendEcho(trimmed);

  switch (cmd) {
    case "ls":
      doLs(arg);
      break;
    case "cd":
      await doCd(arg);
      break;
    case "cat":
      await doCat(arg);
      break;
    case "pwd":
      doPwd();
      break;
    case "whoami":
      doWhoami();
      break;
    case "help":
      doHelp();
      break;
    default:
      printOut(`bash: command not found: ${cmd}`, true);
      break;
  }
}

// ---- wiring ---------------------------------------------------------------

function placeCursorAtEnd(): void {
  const len = inputEl.value.length;
  inputEl.setSelectionRange(len, len);
  updateFakeCursor();
}

// Real <input> elements only ever draw a thin native caret -- a raw Linux
// virtual console (no desktop environment, no terminal emulator) draws a
// full solid blinking block instead. Fake it: hide the native caret, and
// track a block-shaped .cursor element to sit exactly where the caret would
// be, measured via an invisible mirror span holding the text before it.
function setupFakeCursor(): void {
  const wrap = document.createElement("span");
  wrap.className = "term-input-wrap";
  inputEl.parentNode?.insertBefore(wrap, inputEl);
  wrap.appendChild(inputEl);

  const mirror = document.createElement("span");
  mirror.className = "term-mirror";
  mirror.setAttribute("aria-hidden", "true");
  wrap.appendChild(mirror);

  const fakeCursor = document.createElement("span");
  fakeCursor.className = "cursor term-fake-cursor";
  fakeCursor.setAttribute("aria-hidden", "true");
  wrap.appendChild(fakeCursor);

  mirrorEl = mirror;
  fakeCursorEl = fakeCursor;

  // Only hide the real caret once the fake one is actually wired up --
  // if JS never gets this far the input keeps its normal native caret.
  inputEl.style.caretColor = "transparent";

  const sync = () => updateFakeCursor();
  inputEl.addEventListener("input", sync);
  inputEl.addEventListener("keyup", sync);
  inputEl.addEventListener("click", sync);
  inputEl.addEventListener("select", sync);
  inputEl.addEventListener("focus", sync);

  updateFakeCursor();
}

function updateFakeCursor(): void {
  if (!mirrorEl || !fakeCursorEl) return;
  const upToCaret = inputEl.value.slice(0, inputEl.selectionStart ?? inputEl.value.length);
  mirrorEl.textContent = upToCaret;
  fakeCursorEl.style.left = `${mirrorEl.offsetWidth - inputEl.scrollLeft}px`;
}

function attachInputHandlers(): void {
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = inputEl.value;
      inputEl.value = "";
      updateFakeCursor();
      void runCommand(val);
    } else if (e.key === "ArrowUp") {
      if (cmdHistory.length === 0) return;
      e.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      inputEl.value = cmdHistory[historyIndex] ?? "";
      placeCursorAtEnd();
    } else if (e.key === "ArrowDown") {
      if (cmdHistory.length === 0) return;
      e.preventDefault();
      historyIndex = Math.min(cmdHistory.length, historyIndex + 1);
      inputEl.value = cmdHistory[historyIndex] ?? "";
      placeCursorAtEnd();
    }
  });
}

function attachScrollbackFocusHandling(): void {
  const refocus = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, details, summary")) return;
    inputEl.focus();
  };
  sessionEl.addEventListener("click", refocus);
  navEl?.addEventListener("click", refocus);
}

function attachLinkDelegation(): void {
  document.addEventListener("click", (e: MouseEvent) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    if (anchor.target === "_blank") return;

    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith("/")) return;

    let pathname: string;
    try {
      pathname = new URL(href, window.location.origin).pathname;
    } catch {
      return;
    }

    const entry = manifest[pathname];
    if (!entry) return; // not part of the virtual tree, let it navigate for real

    e.preventDefault();
    const cmdWord = entry.type === "dir" ? "cd" : "cat";
    appendEcho(`${cmdWord} ${pathname}`);
    void navigate(pathname, entry.type === "dir");
  });
}

async function handlePopstate(): Promise<void> {
  const route = window.location.pathname;
  const result = await fetchDoc(route);
  if (!result) return;
  const { doc, newSession } = result;

  sessionEl.innerHTML = newSession.innerHTML;

  const entry = manifest[route];
  if (entry) {
    cwd = entry.type === "dir" ? route : parentOf(route);
  }
  updateTopBarTitle(cwd);
  updatePromptPrefix(cwd);
  document.title = doc.title;
  updateNavActive(route);
}

export async function initTerminal(): Promise<void> {
  const sessionElement = document.getElementById("session");
  const inputElement = document.getElementById("term-input") as HTMLInputElement | null;
  if (!sessionElement || !inputElement) return;

  sessionEl = sessionElement;
  inputEl = inputElement;
  navEl = document.querySelector(".navline");
  promptPrefixEl = document.getElementById("term-cwd-prompt");
  titleEl = document.getElementById("term-title");
  statusEl = document.getElementById("term-status");

  try {
    const res = await fetch("/site-tree.json");
    if (!res.ok) throw new Error("bad response");
    manifest = await res.json();
    childPathMap = buildChildPathMap(manifest);
  } catch {
    // progressive enhancement: manifest unavailable, leave the page as a
    // plain static site with real <a> links and an inert input.
    return;
  }

  const pathname = window.location.pathname;
  const entry = manifest[pathname];
  cwd = entry ? (entry.type === "dir" ? pathname : parentOf(pathname)) : "/";

  updatePromptPrefix(cwd);
  updateTopBarTitle(cwd);
  updateNavActive(pathname);

  setupFakeCursor();
  attachInputHandlers();
  attachScrollbackFocusHandling();
  attachLinkDelegation();
  window.addEventListener("popstate", () => void handlePopstate());

  focusInput();
}
