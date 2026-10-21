import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

const appWindow = getCurrentWindow();
const CHECK_TIMEOUT_MS = 8_000;

window.addEventListener("DOMContentLoaded", () => {
  const frame = document.querySelector<HTMLElement>(".app-frame");
  const titlebar = document.querySelector<HTMLElement>(".titlebar");
  const menuButton = document.querySelector<HTMLButtonElement>("#menu-button");
  const menu = document.querySelector<HTMLElement>("#options-menu");
  const aboutButton = document.querySelector<HTMLButtonElement>("#about-button");
  const checkVersionButton = document.querySelector<HTMLButtonElement>("#check-version-button");
  const aboutDialog = document.querySelector<HTMLElement>("#about-dialog");
  const aboutClose = document.querySelector<HTMLButtonElement>("#about-close");
  const appVersion = document.querySelector<HTMLElement>("#app-version");
  const versionDialog = document.querySelector<HTMLElement>("#version-dialog");
  const versionTitle = document.querySelector<HTMLElement>("#version-title");
  const versionStatus = document.querySelector<HTMLElement>("#version-status");
  const installedVersion = document.querySelector<HTMLElement>("#installed-version");
  const versionIndicator = document.querySelector<HTMLElement>("#version-check-indicator");
  const versionDetailsButton = document.querySelector<HTMLButtonElement>("#version-details-button");
  const versionClose = document.querySelector<HTMLButtonElement>("#version-close");
  const updateDialog = document.querySelector<HTMLElement>("#update-dialog");
  const updateVersion = document.querySelector<HTMLElement>("#update-version");
  const releaseNotes = document.querySelector<HTMLElement>("#release-notes");
  const updateProgress = document.querySelector<HTMLElement>("#update-progress");
  const progressTrack = document.querySelector<HTMLElement>(".progress-track");
  const progressFill = document.querySelector<HTMLElement>("#progress-fill");
  const progressLabel = document.querySelector<HTMLElement>("#progress-label");
  const updateError = document.querySelector<HTMLElement>("#update-error");
  const updateNow = document.querySelector<HTMLButtonElement>("#update-now");
  const updateLater = document.querySelector<HTMLButtonElement>("#update-later");
  let pendingUpdate: Update | null = null;
  let versionUpdate: Update | null = null;
  let currentVersion = "";
  let updateInProgress = false;
  let versionCheckInProgress = false;

  const syncMaximizedState = async () => {
    const maximized = await appWindow.isMaximized();
    frame?.classList.toggle("is-maximized", maximized);
    document.querySelector<HTMLButtonElement>("#maximize-button")?.setAttribute(
      "aria-label",
      maximized ? "Restaurar janela" : "Maximizar janela",
    );
  };

  const closeMenu = () => {
    menu?.setAttribute("hidden", "");
    menuButton?.setAttribute("aria-expanded", "false");
  };

  const closeUpdateDialog = async () => {
    if (updateInProgress) return;
    updateDialog?.setAttribute("hidden", "");
    updateNow?.removeAttribute("disabled");
    updateLater?.removeAttribute("disabled");
    if (pendingUpdate) {
      await pendingUpdate.close();
      pendingUpdate = null;
    }
  };

  const closeVersionDialog = async () => {
    if (versionCheckInProgress) return;
    versionDialog?.setAttribute("hidden", "");
    if (versionUpdate) {
      await versionUpdate.close();
      versionUpdate = null;
    }
  };

  const showUpdateDialog = (update: Update) => {
    pendingUpdate = update;
    if (updateVersion) updateVersion.textContent = `Versão ${update.version}`;
    const notes = update.body?.trim().split(/\r?\n/).map((line) =>
      line.replace(/^#{1,6}\s+/, "").replace(/^\s*[-*]\s+/, "• "),
    ).join("\n");
    if (releaseNotes) releaseNotes.textContent = notes || "Esta versão inclui melhorias e correções.";
    updateProgress?.setAttribute("hidden", "");
    updateError?.setAttribute("hidden", "");
    updateNow?.removeAttribute("hidden");
    if (updateNow) updateNow.textContent = "Atualizar agora";
    updateDialog?.removeAttribute("hidden");
    updateNow?.focus();
  };

  const revealMainWindow = async () => {
    const splash = await import("@tauri-apps/api/webviewWindow").then(({ WebviewWindow }) =>
      WebviewWindow.getByLabel("splashscreen"),
    );
    await appWindow.show();
    await appWindow.setFocus();
    await splash?.close();
  };

  const finishStartupCheck = async (update: Update | null) => {
    await revealMainWindow();
    if (update) showUpdateDialog(update);
  };

  const checkForStartupUpdate = async () => {
    let timeoutId = 0;
    const timeout = new Promise<null>((resolve) => {
      timeoutId = window.setTimeout(() => resolve(null), CHECK_TIMEOUT_MS);
    });
    const updateCheck = check({ timeout: CHECK_TIMEOUT_MS });

    try {
      const result = await Promise.race([updateCheck, timeout]);
      window.clearTimeout(timeoutId);
      await finishStartupCheck(result);

      if (result === null) {
        void updateCheck.then((lateUpdate) => {
          if (lateUpdate) showUpdateDialog(lateUpdate);
        }).catch(() => undefined);
      }
    } catch {
      window.clearTimeout(timeoutId);
      await finishStartupCheck(null);
    }
  };

  const checkVersionStatus = async () => {
    closeMenu();
    versionDialog?.removeAttribute("hidden");
    versionTitle?.replaceChildren("Verificando versão");
    versionStatus?.replaceChildren("Conferindo se há uma versão nova.");
    if (installedVersion) installedVersion.textContent = currentVersion || "…";
    versionIndicator?.removeAttribute("hidden");
    versionDetailsButton?.setAttribute("hidden", "");
    versionCheckInProgress = true;
    versionClose?.setAttribute("disabled", "");

    try {
      if (versionUpdate) {
        await versionUpdate.close();
        versionUpdate = null;
      }
      currentVersion = await getVersion();
      if (installedVersion) installedVersion.textContent = currentVersion;
      versionUpdate = await check({ timeout: CHECK_TIMEOUT_MS });
      if (versionUpdate) {
        versionTitle?.replaceChildren("Nova versão disponível");
        versionStatus?.replaceChildren(`A versão ${versionUpdate.version} está pronta para instalar.`);
        versionDetailsButton?.removeAttribute("hidden");
      } else {
        versionTitle?.replaceChildren("Você está atualizado");
        versionStatus?.replaceChildren("Seu NoBrowser já está na versão mais recente.");
      }
    } catch {
      versionTitle?.replaceChildren("Não foi possível verificar");
      versionStatus?.replaceChildren("Confira sua conexão e tente novamente.");
    } finally {
      versionCheckInProgress = false;
      versionIndicator?.setAttribute("hidden", "");
      versionClose?.removeAttribute("disabled");
    }
  };

  const setDownloadProgress = (event: DownloadEvent, downloaded: { bytes: number; total: number | null }) => {
    if (event.event === "Started") {
      downloaded.total = event.data.contentLength ?? null;
      progressTrack?.classList.toggle("is-indeterminate", !downloaded.total);
      if (progressLabel) progressLabel.textContent = "Baixando atualização…";
      return;
    }

    if (event.event === "Progress") {
      downloaded.bytes += event.data.chunkLength;
      if (downloaded.total && progressFill && progressLabel) {
        const percent = Math.min(100, Math.round((downloaded.bytes / downloaded.total) * 100));
        progressFill.style.width = `${percent}%`;
        progressLabel.textContent = `Baixando atualização… ${percent}%`;
      }
      return;
    }

    if (event.event === "Finished" && progressLabel) {
      progressTrack?.classList.remove("is-indeterminate");
      progressFill?.style.setProperty("width", "100%");
      progressLabel.textContent = "Download concluído. Preparando instalação…";
    }
  };

  const retryUpdateCheck = async () => {
    updateInProgress = true;
    updateNow?.setAttribute("disabled", "");
    updateError?.setAttribute("hidden", "");
    try {
      const update = await check({ timeout: CHECK_TIMEOUT_MS });
      if (update) {
        showUpdateDialog(update);
      } else {
        if (updateError) updateError.textContent = "Nenhuma atualização nova está disponível agora.";
        updateError?.removeAttribute("hidden");
      }
    } catch {
      if (updateError) updateError.textContent = "Não foi possível verificar atualizações. Confira sua conexão e tente novamente.";
      updateError?.removeAttribute("hidden");
    } finally {
      updateInProgress = false;
      updateNow?.removeAttribute("disabled");
      if (!pendingUpdate && updateNow) updateNow.textContent = "Verificar novamente";
    }
  };

  const installAvailableUpdate = async () => {
    if (updateInProgress) return;
    if (!pendingUpdate) {
      await retryUpdateCheck();
      return;
    }

    updateInProgress = true;
    updateNow?.setAttribute("disabled", "");
    updateLater?.setAttribute("disabled", "");
    updateError?.setAttribute("hidden", "");
    updateProgress?.removeAttribute("hidden");
    progressTrack?.classList.remove("is-indeterminate");
    if (progressFill) progressFill.style.width = "0";

    const downloaded = { bytes: 0, total: null as number | null };
    try {
      await pendingUpdate.download((event) => setDownloadProgress(event, downloaded), { timeout: 120_000 });
      if (progressLabel) progressLabel.textContent = "Instalando atualização…";
      await pendingUpdate.install();
    } catch {
      await pendingUpdate.close();
      pendingUpdate = null;
      updateInProgress = false;
      updateProgress?.setAttribute("hidden", "");
      updateError?.removeAttribute("hidden");
      if (updateError) updateError.textContent = "Não foi possível instalar a atualização. Tente novamente mais tarde.";
      updateNow?.removeAttribute("disabled");
      if (updateNow) updateNow.textContent = "Verificar novamente";
      updateLater?.removeAttribute("disabled");
      updateLater?.focus();
    }
  };

  menuButton?.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    if (isOpen) {
      menu?.setAttribute("hidden", "");
    } else {
      menu?.removeAttribute("hidden");
    }
  });

  aboutButton?.addEventListener("click", () => {
    closeMenu();
    aboutDialog?.removeAttribute("hidden");
    aboutClose?.focus();
  });

  checkVersionButton?.addEventListener("click", () => void checkVersionStatus());

  aboutClose?.addEventListener("click", () => {
    aboutDialog?.setAttribute("hidden", "");
    aboutButton?.focus();
  });

  updateNow?.addEventListener("click", () => void installAvailableUpdate());
  updateLater?.addEventListener("click", () => void closeUpdateDialog());
  versionDetailsButton?.addEventListener("click", () => {
    if (!versionUpdate) return;
    const update = versionUpdate;
    versionUpdate = null;
    versionDialog?.setAttribute("hidden", "");
    showUpdateDialog(update);
  });
  versionClose?.addEventListener("click", () => void closeVersionDialog());

  document.querySelectorAll<HTMLButtonElement>("#exit-button, #close-button").forEach((button) => {
    button.addEventListener("click", () => void appWindow.close());
  });

  document.querySelector<HTMLButtonElement>("#minimize-button")?.addEventListener("click", () => {
    void appWindow.minimize();
  });

  document.querySelector<HTMLButtonElement>("#maximize-button")?.addEventListener("click", () => {
    void appWindow.toggleMaximize().then(syncMaximizedState);
  });

  titlebar?.addEventListener("dblclick", (event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    void appWindow.toggleMaximize().then(syncMaximizedState);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!(event.target as HTMLElement).closest(".menu-anchor")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !updateInProgress && !versionCheckInProgress) {
      closeMenu();
      aboutDialog?.setAttribute("hidden", "");
      void closeUpdateDialog();
      void closeVersionDialog();
    }
  });

  void syncMaximizedState();
  void appWindow.onResized(syncMaximizedState);
  void getVersion().then((version) => {
    currentVersion = version;
    if (appVersion) appVersion.textContent = `Versão ${version}`;
  });
  void checkForStartupUpdate();
});
