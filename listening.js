"use strict";

const examples = document.querySelector("#examples");
const referencePlayers = new Set();
let youtubeReady;

function stopOthers(activePlayer) {
  document.querySelectorAll("audio").forEach(audio => {
    if (audio !== activePlayer) audio.pause();
  });
  referencePlayers.forEach(player => {
    if (player !== activePlayer && typeof player.pauseVideo === "function") player.pauseVideo();
  });
}

function timeLabel(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeReady) {
    youtubeReady = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Player unavailable")), 15000);
      window.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); resolve(); };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => { clearTimeout(timeout); reject(new Error("Player unavailable")); };
      document.head.append(script);
    });
  }
  return youtubeReady;
}

function addReference(container, example, excerpt, index) {
  const wrapper = document.createElement("div");
  wrapper.className = "reference-excerpt";
  const screen = document.createElement("div");
  screen.className = "reference-screen";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "load-reference";
  button.textContent = "Play reference";
  button.setAttribute("aria-label", `Play ${example.artist}, ${example.title}, ${timeLabel(excerpt.start)} to ${timeLabel(excerpt.end)}`);
  const range = document.createElement("span");
  range.className = "reference-range";
  range.textContent = `${timeLabel(excerpt.start)}–${timeLabel(excerpt.end)} · 20 seconds`;
  const placeholder = document.createElement("div");
  placeholder.className = "reference-placeholder";
  placeholder.append(button, range);
  const mount = document.createElement("div");
  mount.id = `youtube-${example.id}-${index}`;
  screen.append(placeholder, mount);
  const footer = document.createElement("div");
  footer.className = "reference-footer";
  const link = document.createElement("a");
  link.href = `https://www.youtube.com/watch?v=${example.video_id}&t=${excerpt.start}s`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = `Open on YouTube · ${timeLabel(excerpt.start)} ↗`;
  link.addEventListener("click", () => stopOthers());
  const status = document.createElement("p");
  status.className = "player-status";
  status.setAttribute("role", "status");
  footer.append(link);
  wrapper.append(screen, footer, status);
  container.append(wrapper);
  let timer;
  let readyTimeout;
  const unavailable = code => {
    clearInterval(timer);
    clearTimeout(readyTimeout);
    screen.hidden = true;
    status.textContent = "This recording cannot play here. Use the YouTube link to hear the reference.";
    wrapper.dataset.playerError = String(code);
  };
  button.addEventListener("click", async () => {
    stopOthers();
    button.disabled = true;
    button.textContent = "Loading reference…";
    try {
      await loadYouTube();
      readyTimeout = setTimeout(() => unavailable("timeout"), 15000);
      new YT.Player(mount.id, {
        width: "100%", height: "100%", videoId: example.video_id,
        playerVars: {
          origin: window.location.origin, enablejsapi: 1, controls: 1,
          start: excerpt.start, end: excerpt.end, playsinline: 1, rel: 0,
        },
        events: {
          onReady: event => {
            clearTimeout(readyTimeout);
            referencePlayers.add(event.target);
            const iframe = event.target.getIframe();
            iframe.title = `${example.artist} — ${example.title}, reference excerpt`;
            iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
            iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
            placeholder.remove();
            event.target.playVideo();
          },
          onStateChange: event => {
            clearInterval(timer);
            if (event.data === YT.PlayerState.PLAYING) {
              stopOthers(event.target);
              timer = setInterval(() => {
                if (event.target.getCurrentTime() >= excerpt.end) {
                  event.target.pauseVideo();
                  event.target.seekTo(excerpt.start, true);
                  clearInterval(timer);
                }
              }, 200);
            }
          },
          onError: event => unavailable(event.data),
          onAutoplayBlocked: () => { status.textContent = "Press play in the YouTube player to start the reference."; },
        },
      });
    } catch {
      unavailable("load");
    }
  }, { once: true });
}

function modelColumn(artist, model, samples) {
  const column = document.createElement("div");
  column.className = "generated";
  const heading = document.createElement("h5");
  heading.textContent = model;
  column.append(heading);
  const sample = samples.reduce((best, next) => next.clap > best.clap ? next : best);
  const block = document.createElement("div");
  block.className = "sample";
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.preload = "none";
  audio.src = sample.audio;
  audio.setAttribute("aria-label", `${artist}, ${model}, highest CLAP sample`);
  audio.addEventListener("play", () => stopOthers(audio));
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Musical description and score";
  const prompt = document.createElement("p");
  prompt.className = "prompt";
  prompt.textContent = sample.prompt;
  const score = document.createElement("p");
  score.className = "score";
  score.textContent = `CLAP similarity: ${sample.clap.toFixed(3)}`;
  details.append(summary, prompt, score);
  block.append(audio, details);
  column.append(block);
  return column;
}

function addExample(example) {
  const section = document.createElement("section");
  section.className = "example";
  section.id = example.id;
  section.innerHTML = `
    <h4></h4><p class="song-title"></p>
    <div class="comparison">
      <div class="reference"><h5>Reference recording</h5><div class="reference-links"></div></div>
      <div class="models"></div>
    </div>`;
  section.querySelector("h4").textContent = example.artist;
  section.querySelector(".song-title").textContent = example.title;
  example.excerpts.forEach((excerpt, index) => addReference(section.querySelector(".reference-links"), example, excerpt, index));
  const grid = section.querySelector(".models");
  const models = { "Lyria 3": example.samples, ...example.additional_models };
  for (const [model, samples] of Object.entries(models)) {
    grid.append(modelColumn(example.artist, model, samples));
  }
  examples.append(section);
}

async function init() {
  const response = await fetch("samples.json");
  if (!response.ok) throw new Error("Audio examples could not be loaded.");
  const data = await response.json();
  data.forEach(addExample);
  examples.setAttribute("aria-busy", "false");
}

init().catch(error => {
  examples.textContent = error.message;
  examples.setAttribute("aria-busy", "false");
});
