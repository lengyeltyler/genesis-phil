import history from "../content/history.json" with { type: "json" };

export const TUTORIAL_PATH = "/media/phil-genesis-tutorial.0721231f121ffc9d3425c79b61fe9e99924b6cffa0f67c94ef3a0000b5288062.mp4";
export function safeXLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "x.com" &&
      !url.username && !url.password && !url.port &&
      /^\/tyler_lengyel\/status\/\d+(?:\/photo\/\d+)?$/.test(url.pathname) && !url.search && !url.hash
      ? url.href : null;
  } catch { return null; }
}
export function filterTimeline(entries, year, query) {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter(e => (year === "all" || e.year === year) &&
    (!needle || `${e.dateLabel} ${e.text}`.toLocaleLowerCase().includes(needle)));
}
// Content receives only DOM/navigation capabilities, never custody, storage or execution.
export function createContentViews(document, navigation) {
  const $ = id => document.getElementById(id);
  const element = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const xLink = (label, value) => {
    const url = safeXLink(value);
    if (!url) return element("span", label);
    const a = element("a", label); a.href = url; a.target = "_blank";
    a.rel = "noopener noreferrer"; return a;
  };
  let storyRendered = false, timelineRendered = false;
  function renderStory() {
    if (storyRendered) return;
    for (const paragraph of history.story) $("history-story").append(element("p", paragraph));
    storyRendered = true;
  }
  function renderTimeline() {
    const entries = filterTimeline(history.entries, $("timeline-year").value, $("timeline-search").value);
    $("timeline-count").textContent = `${entries.length} of ${history.entries.length} posts`;
    const fragment = document.createDocumentFragment(); let year;
    for (const entry of entries) {
      if (year !== entry.year) { year = entry.year; fragment.append(element("h2", year)); }
      const article = element("article", undefined, "card timeline-entry");
      article.id = "post-" + entry.url.split("/").at(-1);
      article.append(element("h3", entry.dateLabel), element("span", entry.time + " · America/Denver", "small"), element("p", entry.text));
      const links = element("div", undefined, "timeline-links");
      links.append(xLink("Original post ↗", entry.url));
      for (const media of entry.media) links.append(xLink(media.label + " ↗", media.url));
      article.append(links); fragment.append(article);
    }
    $("timeline-entries").replaceChildren(fragment); timelineRendered = true;
  }
  function historyView(timeline) {
    $("history-story").hidden = timeline; $("history-timeline").hidden = !timeline;
    for (const name of ["story", "timeline"]) {
      const active = timeline === (name === "timeline");
      $(name + "-tab").classList.toggle("active", active);
      $(name + "-tab").setAttribute("aria-pressed", String(active));
    }
    if (timeline && !timelineRendered) renderTimeline(); else if (!timeline) renderStory();
  }
  for (const milestone of history.milestones) {
    const button = element("button", milestone.label);
    button.addEventListener("click", () => {
      $("timeline-year").value = "all"; $("timeline-search").value = ""; renderTimeline();
      const post = $("post-" + milestone.post); post.tabIndex = -1; post.focus(); post.scrollIntoView({block:"start"});
    });
    $("history-milestones").append(button);
  }
  $("story-tab").addEventListener("click", () => historyView(false));
  $("timeline-tab").addEventListener("click", () => historyView(true));
  $("timeline-year").addEventListener("change", renderTimeline);
  $("timeline-search").addEventListener("input", renderTimeline);
  $("tutorial-video").src = TUTORIAL_PATH; $("tutorial-open").href = TUTORIAL_PATH;
  function page() {
    const name = ["history", "tutorial"].includes(navigation.location.hash.slice(1)) ? navigation.location.hash.slice(1) : "phil";
    for (const item of ["phil", "history", "tutorial"]) {
      $(item + "-page").hidden = item !== name;
      const link = document.querySelector(`[data-page="${item}"]`);
      if (item === name) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    }
    if (name !== "tutorial") $("tutorial-video").pause();
    if (name === "history") renderStory();
  }
  navigation.addEventListener("hashchange", page); page();
}
