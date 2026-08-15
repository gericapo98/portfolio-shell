// Old-computer boot flourish: plays once on a genuine full page load/refresh
// (never on the soft in-page cd/cat navigations the terminal engine already
// does -- those stay instant). Purely decorative and JS-only: the overlay is
// created and removed entirely at runtime, so it is never part of the
// server-rendered HTML and a no-JS visitor goes straight to the real page.

const BOOT_LINES = [
  "Linux gericapo98 6.1.0-old #1 SMP PREEMPT",
  "Loading modules... done",
  "Starting network... done",
  " ",
  "gericapo98 login: gericapo98",
  "Password: ********",
  "Last login: just now",
];

const STEP_MS = 170;
const HOLD_MS = 400;
const FADE_MS = 250;

function playBoot(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const overlay = document.createElement("div");
  overlay.className = "boot-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const lineEls = BOOT_LINES.map((text) => {
    const div = document.createElement("div");
    div.className = "boot-line";
    div.textContent = text;
    overlay.appendChild(div);
    return div;
  });

  document.body.appendChild(overlay);

  lineEls.forEach((el, i) => {
    window.setTimeout(() => el.classList.add("visible"), i * STEP_MS);
  });

  const totalMs = lineEls.length * STEP_MS + HOLD_MS;
  window.setTimeout(() => {
    overlay.style.opacity = "0";
    window.setTimeout(() => overlay.remove(), FADE_MS);
  }, totalMs);
}

export function runBootSequence(): void {
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        try {
          playBoot();
        } catch {
          // fail silently -- never block the real page
        }
      });
    } else {
      playBoot();
    }
  } catch {
    // fail silently -- never block the real page
  }
}
