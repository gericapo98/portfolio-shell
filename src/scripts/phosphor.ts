// PhosphorOS — self-contained CRT terminal demo.
// No imports, no dependencies, no references to the rest of the site.

const PROMPT = "guest@phosphor:~$ ";

const FX_LAYERS: Record<string, string> = {
  glow: "phosphor bleed on the type (text-shadow)",
  scanlines: "horizontal raster lines",
  vignette: "darkened corners",
  curve: "bezel inset + edge falloff",
  flicker: "slow irregular brightness dip",
  rollbar: "brightness band drifting down the glass",
  aberration: "red/blue fringe on the type",
};

const THEMES: Record<string, string> = {
  green: "#33ff33",
  amber: "#ffb000",
  ice: "#9fd8ff",
};

const DEFAULT_FX_CLASSES = Object.keys(FX_LAYERS)
  .map((n) => "fx-" + n)
  .join(" ");

// Hand-picked projects surfaced in the boot listing and browsable via
// ls/cat; each directory holds a single <name>.md whose link `open` launches.
const PROJECTS: Record<string, { desc: string; url: string }> = {
  "rally-coach": {
    desc: "badminton practice video → numbers you can train against",
    url: "https://github.com/gericapo98/rally-coach",
  },
  codelab: {
    desc: "a code-lab to keep the fundamentals sharp",
    url: "https://github.com/gericapo98/codelab",
  },
  semsearch: {
    desc: "local AI embedding models in Rust — fully offline",
    url: "https://github.com/archastronaut/semsearch",
  },
};

// BIOS checks are typed out; the directory scan result dumps instantly,
// the way real firmware prints a device table.
const BOOT_LINES: Array<{ text: string; cls: string; instant?: boolean }> = [
  { text: "PHOSPHOR BIOS v2.4", cls: "bright" },
  { text: "64K PHOSPHOR RAM ....... OK", cls: "" },
  { text: "DEFLECTION COILS ....... CALIBRATED", cls: "" },
  { text: "ELECTRON GUN ........... WARM", cls: "" },
  {
    text: "MOUNTING ~/projects .... " + Object.keys(PROJECTS).length + " FOUND",
    cls: "",
  },
  ...Object.entries(PROJECTS).map(([name, p]) => ({
    text: "  " + (name + "/").padEnd(14) + p.desc,
    cls: "",
    instant: true,
  })),
  { text: "", cls: "" },
  { text: "PhosphorOS 1.0 — all effect layers active.", cls: "" },
  { text: "Type 'help' to see what you can do, 'fx' to dissect the look.", cls: "" },
];

const HELP_TEXT = [
  "help                     list commands",
  "about                    how this effect is built",
  "fx                       show the 7 effect layers and their state",
  "fx <name> on|off         toggle one layer",
  "theme green|amber|ice    set the phosphor color",
  "ls [path]                list files",
  "cat <file>               read a file",
  "open <file | url>        open a file or URL in a new tab",
  "echo <text>              print text",
  "date                     print the current date/time",
  "whoami                   identify yourself",
  "clear                    clear the screen",
  "reboot                   power-cycle the terminal",
];

const ABOUT_TEXT = [
  "The text sits flat on a radial-gradient screen — a faint phosphor",
  "tint at the center fading to near-black at the edges. A handful of",
  "independent CSS layers float above it: scanlines, a vignette, a",
  "curvature inset, a slow irregular flicker, a brightness bar drifting",
  "down the glass. Glow and chromatic fringing are not layers at all —",
  "they are text-shadow, applied directly to the type.",
  "",
  "In practice the glow and the low-opacity scanlines do almost all of",
  "the visible work. The rest — flicker, rollbar, aberration — is felt",
  "more than consciously noticed. Restraint is the design. Run 'fx' and",
  "switch layers off one at a time to see which ones you actually miss.",
];

const README_TEXT = [
  "The only real things here live in projects/ — cat a .md inside one,",
  "or 'open' it to jump to the repo. The rest of this filesystem is",
  "phosphor and lies. The electron gun is warm. Enjoy the glow.",
];

// --- elements -------------------------------------------------------------

const screen = document.getElementById("screen") as HTMLElement;
const termEl = document.getElementById("term") as HTMLElement;
const scrollback = document.getElementById("scrollback") as HTMLElement;
const liveEl = document.getElementById("live") as HTMLElement;
const liveBefore = document.getElementById("live-before") as HTMLElement;
const liveAfter = document.getElementById("live-after") as HTMLElement;
const inputEl = document.getElementById("kbd") as HTMLInputElement;

// --- state ----------------------------------------------------------------

let booted = false;
const history: string[] = [];
let histIndex = 0;

function motionOK(): boolean {
  return window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- output ---------------------------------------------------------------

function scrollToBottom(): void {
  termEl.scrollTop = termEl.scrollHeight;
}

function print(text: string, cls = ""): HTMLElement {
  const div = document.createElement("div");
  div.className = cls ? "line " + cls : "line";
  div.textContent = text;
  scrollback.appendChild(div);
  scrollToBottom();
  return div;
}

function printLines(lines: string[], cls = ""): void {
  for (const line of lines) print(line, cls);
}

function clearOutput(): void {
  scrollback.textContent = "";
  scrollToBottom();
}

// --- live line ------------------------------------------------------------

function renderLive(): void {
  const v = inputEl.value;
  const caret = inputEl.selectionStart ?? v.length;
  liveBefore.textContent = v.slice(0, caret);
  liveAfter.textContent = v.slice(caret);
}

// --- commands -------------------------------------------------------------

function cmdFx(args: string[]): void {
  if (args.length === 0) {
    for (const name of Object.keys(FX_LAYERS)) {
      const state = screen.classList.contains("fx-" + name) ? "on " : "off";
      print(name.padEnd(12) + state + "  " + FX_LAYERS[name]);
    }
    return;
  }
  const [name, state] = args;
  if (!(name in FX_LAYERS)) {
    print(
      "fx: unknown layer '" + name + "' — valid layers: " + Object.keys(FX_LAYERS).join(", "),
    );
    return;
  }
  if (state !== "on" && state !== "off") {
    print("usage: fx <name> on|off");
    return;
  }
  screen.classList.toggle("fx-" + name, state === "on");
  print(name + ": " + state);
}

function cmdTheme(args: string[]): void {
  const name = args[0];
  if (!name || !(name in THEMES)) {
    print(
      "theme: unknown theme" + (name ? " '" + name + "'" : "") + " — valid themes: " + Object.keys(THEMES).join(", "),
    );
    return;
  }
  if (name === "green") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = name;
  }
  print("theme: " + name);
}

// Normalizes a path token ("~/projects/rally-coach/", "rally-coach.md", …)
// and classifies it against the tiny fake filesystem:
//   ~/  README.txt  projects/  projects/<name>/  projects/<name>/<name>.md
type FsHit =
  | { kind: "root" }
  | { kind: "readme" }
  | { kind: "projects" }
  | { kind: "projdir"; name: string }
  | { kind: "projmd"; name: string }
  | null;

function resolveFs(token: string): FsHit {
  let t = token.replace(/^~\/?/, "").replace(/\/+$/, "");
  if (t === "" || t === ".") return { kind: "root" };
  if (t === "README.txt") return { kind: "readme" };
  if (t === "projects") return { kind: "projects" };
  t = t.replace(/^projects\//, "");
  const md = t.match(/^([^/]+)\/\1\.md$/) ?? t.match(/^([^/]+)\.md$/);
  if (md && md[1] in PROJECTS) return { kind: "projmd", name: md[1] };
  if (t in PROJECTS) return { kind: "projdir", name: t };
  return null;
}

function cmdCat(args: string[]): void {
  if (args.length === 0) {
    print("cat: missing operand");
    return;
  }
  const hit = resolveFs(args[0]);
  if (hit?.kind === "readme") {
    printLines(README_TEXT);
    return;
  }
  if (hit?.kind === "projmd") {
    const p = PROJECTS[hit.name];
    print("# " + hit.name, "bright");
    print(p.desc);
    print("link: " + p.url);
    print("('open " + hit.name + ".md' opens it in a new tab)", "dim");
    return;
  }
  if (hit?.kind === "projdir" || hit?.kind === "projects" || hit?.kind === "root") {
    print("cat: " + args[0] + ": Is a directory");
    return;
  }
  print("cat: " + args[0] + ": No such file or directory");
}

function cmdLs(args: string[]): void {
  const hit = resolveFs(args[0] ?? "");
  switch (hit?.kind) {
    case "root":
      print("README.txt  projects/");
      break;
    case "readme":
      print("README.txt");
      break;
    case "projects":
      print(Object.keys(PROJECTS).map((n) => n + "/").join("  "));
      break;
    case "projdir":
      print(hit.name + ".md");
      break;
    case "projmd":
      print(hit.name + ".md");
      break;
    default:
      print("ls: " + args[0] + ": No such file or directory");
  }
}

function openUrl(url: string): void {
  print("opening " + url + " …");
  window.open(url, "_blank", "noopener");
}

// Behaves like the real `open`: URLs open directly, files open with
// whatever handles them (a project .md's handler is its repo).
function cmdOpen(args: string[]): void {
  if (args.length === 0) {
    print("usage: open <file | url>");
    return;
  }
  const target = args[0];
  if (/^https?:\/\//i.test(target)) {
    openUrl(target);
    return;
  }
  // the filesystem wins over domain guessing: "codelab.md" is a file
  // here even though .md is technically a TLD
  const hit = resolveFs(target);
  if (hit?.kind === "projmd" || hit?.kind === "projdir") {
    openUrl(PROJECTS[hit.name].url);
    return;
  }
  if (hit?.kind === "readme") {
    print("open: README.txt: no application knows how to open this");
    return;
  }
  if (hit) {
    print("open: " + target + ": this terminal is the file manager");
    return;
  }
  // bare domains ("github.com/x") are close enough — be forgiving, but
  // don't mistake stray filenames (*.md, *.txt) for domains
  if (
    /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(target) &&
    !/\.(md|txt)$/i.test(target.split("/")[0])
  ) {
    openUrl("https://" + target);
    return;
  }
  print("The file " + target + " does not exist.");
}

function run(line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  history.push(trimmed);
  histIndex = history.length;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  const rest = trimmed.slice(cmd.length).trimStart();

  switch (cmd) {
    case "help":
      printLines(HELP_TEXT);
      print("");
      print("Ctrl+L clears the screen. Ctrl+C cancels the current line.", "dim");
      break;
    case "about":
      printLines(ABOUT_TEXT);
      break;
    case "fx":
      cmdFx(args);
      break;
    case "theme":
      cmdTheme(args);
      break;
    case "echo":
      print(rest);
      break;
    case "date":
      print(new Date().toString());
      break;
    case "whoami":
      print("guest (aren't we all)");
      break;
    case "clear":
      clearOutput();
      break;
    case "reboot":
      reboot();
      break;
    case "ls":
      cmdLs(args);
      break;
    case "cat":
      cmdCat(args);
      break;
    case "open":
      cmdOpen(args);
      break;
    default:
      print(cmd + ": command not found — try 'help'");
  }
}

// --- boot / reboot --------------------------------------------------------

async function boot(): Promise<void> {
  booted = false;
  liveEl.hidden = true;
  if (motionOK()) {
    for (const { text, cls, instant } of BOOT_LINES) {
      if (instant) {
        // device-table dumps print whole lines, like real firmware
        print(text, cls);
        await sleep(40);
        continue;
      }
      const div = print("", cls);
      for (const ch of text) {
        div.textContent += ch;
        scrollToBottom();
        await sleep(14);
      }
      await sleep(120);
    }
  } else {
    for (const { text, cls } of BOOT_LINES) print(text, cls);
  }
  booted = true;
  inputEl.value = "";
  renderLive();
  liveEl.hidden = false;
  scrollToBottom();
  inputEl.focus({ preventScroll: true });
}

function resetDefaults(): void {
  screen.className = DEFAULT_FX_CLASSES;
  delete document.documentElement.dataset.theme;
}

function reboot(): void {
  booted = false;
  liveEl.hidden = true;
  inputEl.value = "";

  const powerOn = () => {
    clearOutput();
    resetDefaults();
    if (motionOK()) {
      screen.classList.add("power-on");
      screen.addEventListener(
        "animationend",
        (e) => {
          if (e.animationName === "power-on") screen.classList.remove("power-on");
        },
        { once: true },
      );
    }
    void boot();
  };

  if (motionOK()) {
    screen.classList.add("power-off");
    const onEnd = (e: AnimationEvent) => {
      if (e.animationName !== "power-off") return;
      screen.removeEventListener("animationend", onEnd);
      powerOn();
    };
    screen.addEventListener("animationend", onEnd);
  } else {
    powerOn();
  }
}

// --- input wiring ---------------------------------------------------------

function submit(): void {
  const line = inputEl.value;
  print(PROMPT + line);
  inputEl.value = "";
  run(line);
  renderLive();
  scrollToBottom();
}

function histMove(delta: number): void {
  if (history.length === 0) return;
  histIndex = Math.max(0, Math.min(history.length, histIndex + delta));
  inputEl.value = histIndex === history.length ? "" : history[histIndex];
  const end = inputEl.value.length;
  inputEl.setSelectionRange(end, end);
  renderLive();
  scrollToBottom();
}

inputEl.addEventListener("keydown", (e) => {
  if (!booted) {
    e.preventDefault();
    return;
  }
  if (e.isComposing) return;
  if (e.key === "Enter") {
    e.preventDefault();
    submit();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    histMove(-1);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    histMove(1);
  } else if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
    e.preventDefault();
    clearOutput();
  } else if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
    e.preventDefault();
    print(PROMPT + inputEl.value + "^C");
    inputEl.value = "";
    renderLive();
    scrollToBottom();
  }
});

for (const ev of ["input", "keyup", "click", "focus"] as const) {
  inputEl.addEventListener(ev, () => {
    if (!booted) return;
    renderLive();
    if (ev === "input") scrollToBottom();
  });
}

document.addEventListener("selectionchange", () => {
  if (booted && document.activeElement === inputEl) renderLive();
});

document.addEventListener("click", () => {
  if (!booted) return;
  const sel = window.getSelection();
  if (sel && sel.toString()) return; // don't steal an in-progress text selection
  inputEl.focus({ preventScroll: true });
});

// --- go -------------------------------------------------------------------

void boot();
