import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

const menuWindow = getCurrentWindow();
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".options-menu button"));

const handleAction = async (action: string) => {
  try {
    await invoke("hide_options_menu");
  } catch {
    await menuWindow.hide();
  }
  await emit("options-menu-action", action);
};

document.getElementById("history-button")?.addEventListener("click", () => void handleAction("history"));
document.getElementById("settings-button")?.addEventListener("click", () => void handleAction("settings"));
document.getElementById("about-button")?.addEventListener("click", () => void handleAction("about"));
document.getElementById("check-version-button")?.addEventListener("click", () => void handleAction("check-version"));
document.getElementById("exit-button")?.addEventListener("click", () => void handleAction("exit"));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    void invoke("hide_options_menu");
    return;
  }

  const activeElement = document.activeElement as HTMLButtonElement | null;
  const currentIndex = activeElement ? buttons.indexOf(activeElement) : -1;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    const nextIndex = currentIndex === -1 || currentIndex === buttons.length - 1 ? 0 : currentIndex + 1;
    buttons[nextIndex]?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    const prevIndex = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
    buttons[prevIndex]?.focus();
  } else if (event.key === "Tab") {
    if (event.shiftKey && (currentIndex <= 0 || currentIndex === -1)) {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
    } else if (!event.shiftKey && currentIndex === buttons.length - 1) {
      event.preventDefault();
      buttons[0]?.focus();
    }
  }
});

window.addEventListener("blur", () => {
  void invoke("hide_options_menu");
});

document.body.addEventListener("pointerdown", (event) => {
  if (event.target === document.body) {
    void invoke("hide_options_menu");
  }
});

void listen("options-menu-shown", () => {
  buttons[0]?.focus();
});
