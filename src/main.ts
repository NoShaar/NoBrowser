import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

const appWindow = getCurrentWindow();
const CHECK_TIMEOUT_MS = 8_000;

interface BrowserTab {
  id: number;
  label: string;
  title: string;
  url: string;
  hasWebview: boolean;
  loading: boolean;
  historyLength: number;
  forwardAvailable: boolean;
  historyAction: "back" | "forward" | "";
}

interface BrowserPageEvent {
  label: string;
  url?: string;
  loading?: boolean;
  title?: string;
}

window.addEventListener("DOMContentLoaded", () => {
  const frame = document.querySelector<HTMLElement>(".app-frame");
  const titlebar = document.querySelector<HTMLElement>(".titlebar");
  const menuButton = document.querySelector<HTMLButtonElement>("#menu-button");
  const tabStrip = document.querySelector<HTMLElement>("#tab-strip");
  const newTabButton = document.querySelector<HTMLButtonElement>("#new-tab-button");
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
  const addressForm = document.querySelector<HTMLFormElement>("#address-form");
  const addressInput = document.querySelector<HTMLInputElement>("#address-input");
  const addressIndicator = document.querySelector<HTMLElement>("#address-indicator");
  const browserStage = document.querySelector<HTMLElement>("#browser-stage");
  const welcomeScreen = document.querySelector<HTMLElement>("#welcome-screen");
  const backButton = document.querySelector<HTMLButtonElement>("#back-button");
  const forwardButton = document.querySelector<HTMLButtonElement>("#forward-button");
  const reloadButton = document.querySelector<HTMLButtonElement>("#reload-button");
  const browserMessage = document.querySelector<HTMLElement>("#browser-message");
  let pendingUpdate: Update | null = null;
  let versionUpdate: Update | null = null;
  let currentVersion = "";
  let updateInProgress = false;
  let versionCheckInProgress = false;
  let nextTabId = 2;
  let activeTabId = 1;
  let activationSequence = 0;
  let addressEditing = false;
  let tabs: BrowserTab[] = [
    { id: 1, label: "browser-tab-1", title: "Nova guia", url: "", hasWebview: false, loading: false, historyLength: 0, forwardAvailable: false, historyAction: "" },
  ];

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

  const getActiveTab = () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  const getStageBounds = () => {
    const bounds = browserStage?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0, width: 1, height: 1 };
    return {
      x: Math.round(bounds.left),
      y: Math.round(bounds.top),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    };
  };

  const updateNavigationControls = () => {
    const tab = getActiveTab();
    if (backButton) backButton.disabled = !tab?.hasWebview || tab.historyLength < 2;
    if (forwardButton) forwardButton.disabled = !tab?.hasWebview || !tab.forwardAvailable;
    if (reloadButton) reloadButton.disabled = !tab?.hasWebview;
  };

  const updateAddressBar = (tab: BrowserTab, force = false) => {
    if (addressInput && (force || !addressEditing)) addressInput.value = tab.url;
    addressIndicator?.classList.toggle("is-secure", tab.url.startsWith("https://"));
  };

  const tabDisplayName = (tab: BrowserTab) => {
    if (tab.title && tab.title !== "Nova guia") return tab.title;
    if (!tab.url) return "Nova guia";
    try {
      return new URL(tab.url).hostname.replace(/^www\./, "");
    } catch {
      return "Carregando…";
    }
  };

  const renderTabs = () => {
    if (!tabStrip) return;
    const fragment = document.createDocumentFragment();

    for (const tab of tabs) {
      const item = document.createElement("div");
      item.className = "browser-tab";
      item.setAttribute("role", "tab");
      item.setAttribute("aria-selected", String(tab.id === activeTabId));
      item.setAttribute("aria-label", tabDisplayName(tab));
      item.tabIndex = tab.id === activeTabId ? 0 : -1;

      const favicon = document.createElement("span");
      favicon.className = "tab-favicon";
      favicon.setAttribute("aria-hidden", "true");
      favicon.textContent = tab.url ? tabDisplayName(tab).slice(0, 1) : "n";
      item.append(favicon);

      if (tab.loading) {
        const indicator = document.createElement("span");
        indicator.className = "tab-loading";
        indicator.setAttribute("aria-hidden", "true");
        item.append(indicator);
      }

      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = tabDisplayName(tab);
      item.append(name);

      const close = document.createElement("button");
      close.className = "tab-close";
      close.type = "button";
      close.setAttribute("aria-label", `Fechar aba ${tabDisplayName(tab)}`);
      close.title = "Fechar aba";
      close.textContent = "×";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        void closeTab(tab.id);
      });
      item.append(close);
      item.addEventListener("click", () => void activateTab(tab.id));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void activateTab(tab.id);
        }
      });
      fragment.append(item);
    }

    tabStrip.replaceChildren(fragment);
  };

  const hideBrowserTabs = async () => {
    await Promise.all(tabs.filter((tab) => tab.hasWebview).map((tab) =>
      invoke("hide_browser_tab", { tabLabel: tab.label }).catch(() => undefined),
    ));
  };

  const showActiveBrowserTab = async (focus = false) => {
    const tab = getActiveTab();
    if (!tab) return;
    welcomeScreen?.toggleAttribute("hidden", tab.hasWebview);
    browserMessage?.setAttribute("hidden", "");
    updateAddressBar(tab, true);
    updateNavigationControls();
    if (!tab.hasWebview) return;

    try {
      const bounds = getStageBounds();
      await invoke("set_browser_tab_bounds", { tabLabel: tab.label, ...bounds });
      await invoke("show_browser_tab", { tabLabel: tab.label });
      if (focus) await invoke("focus_browser_tab", { tabLabel: tab.label });
    } catch {
      showBrowserError("Não foi possível abrir esta aba. Tente novamente.");
    }
  };

  const activateTab = async (id: number) => {
    if (!tabs.some((tab) => tab.id === id)) return;
    const sequence = ++activationSequence;
    if (id !== activeTabId) await hideBrowserTabs();
    if (sequence !== activationSequence) return;
    activeTabId = id;
    renderTabs();
    await showActiveBrowserTab(true);
  };

  const addTab = async () => {
    const id = nextTabId++;
    tabs.push({
      id,
      label: `browser-tab-${id}`,
      title: "Nova guia",
      url: "",
      hasWebview: false,
      loading: false,
      historyLength: 0,
      forwardAvailable: false,
      historyAction: "",
    });
    await activateTab(id);
    addressInput?.focus();
  };

  const closeTab = async (id: number) => {
    const closing = tabs.find((tab) => tab.id === id);
    if (!closing) return;
    if (closing.hasWebview) await invoke("close_browser_tab", { tabLabel: closing.label }).catch(() => undefined);
    tabs = tabs.filter((tab) => tab.id !== id);
    if (tabs.length === 0) {
      const newId = nextTabId++;
      tabs.push({
        id: newId,
        label: `browser-tab-${newId}`,
        title: "Nova guia",
        url: "",
        hasWebview: false,
        loading: false,
        historyLength: 0,
        forwardAvailable: false,
        historyAction: "",
      });
      activeTabId = newId;
    } else if (activeTabId === id) {
      activeTabId = tabs[Math.min(tabs.length - 1, Math.max(0, tabs.findIndex((tab) => tab.id > id)))].id;
    }
    renderTabs();
    await showActiveBrowserTab(true);
  };

  const showBrowserError = (message: string) => {
    if (!browserMessage) return;
    browserMessage.textContent = message;
    browserMessage.removeAttribute("hidden");
  };

  const resolveAddress = (input: string) => {
    const value = input.trim();
    if (!value) return null;
    const search = () => `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
    const localAddress = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::|\/|$)/i.test(value);

    try {
      const protocol = localAddress ? "http" : "https";
      const candidate = new URL(value.includes("://") ? value : `${protocol}://${value}`);
      if ((candidate.protocol === "http:" || candidate.protocol === "https:") && candidate.hostname) {
        return candidate.href;
      }
    } catch {
      return search();
    }

    return search();
  };

  const openAddress = async (rawAddress: string) => {
    const url = resolveAddress(rawAddress);
    const tab = getActiveTab();
    if (!url || !tab) return;
    closeMenu();
    browserMessage?.setAttribute("hidden", "");
    tab.forwardAvailable = false;
    tab.loading = true;
    addressEditing = false;
    if (!tab.hasWebview) {
      tab.hasWebview = true;
      tab.title = "Carregando…";
      welcomeScreen?.setAttribute("hidden", "");
    }
    renderTabs();
    updateNavigationControls();
    if (addressInput) addressInput.value = url;
    addressIndicator?.classList.toggle("is-secure", url.startsWith("https://"));

    try {
      const bounds = getStageBounds();
      if (tab.historyLength === 0 && !tab.url) {
        await invoke("create_browser_tab", { tabLabel: tab.label, url, ...bounds });
      } else {
        await invoke("navigate_browser_tab", { tabLabel: tab.label, url });
      }
      if (activeTabId === tab.id) {
        await invoke("show_browser_tab", { tabLabel: tab.label });
        if (activeTabId === tab.id) {
          await invoke("focus_browser_tab", { tabLabel: tab.label });
        } else {
          await invoke("hide_browser_tab", { tabLabel: tab.label });
        }
      } else {
        await invoke("hide_browser_tab", { tabLabel: tab.label });
      }
    } catch {
      tab.loading = false;
      if (tab.historyLength === 0) {
        tab.hasWebview = false;
        tab.url = "";
        tab.title = "Nova guia";
        welcomeScreen?.removeAttribute("hidden");
      }
      renderTabs();
      updateNavigationControls();
      showBrowserError("Não foi possível abrir o endereço. Confira a conexão e tente novamente.");
    }
  };

  const handleBrowserPageEvent = (event: BrowserPageEvent) => {
    const tab = tabs.find((candidate) => candidate.label === event.label);
    if (!tab) return;

    if (event.url && event.url !== tab.url) {
      if (tab.url) tab.historyLength += 1;
      else tab.historyLength = Math.max(1, tab.historyLength);
      tab.url = event.url;
      tab.forwardAvailable = tab.historyAction === "back";
      tab.historyAction = "";
    }
    if (event.title?.trim()) tab.title = event.title.trim();
    if (event.loading !== undefined) tab.loading = event.loading;
    if (tab.id === activeTabId) {
      updateAddressBar(tab);
      updateNavigationControls();
    }
    renderTabs();
  };

  const syncBrowserTabBounds = async () => {
    if (document.visibilityState === "hidden" || await appWindow.isMinimized()) return;
    const bounds = getStageBounds();
    await Promise.all(tabs.filter((tab) => tab.hasWebview).map((tab) =>
      invoke("set_browser_tab_bounds", { tabLabel: tab.label, ...bounds }).catch(() => undefined),
    ));
  };

  const hideViewsForDialog = () => void hideBrowserTabs();

  const restoreActiveViewAfterDialog = () => {
    if (!versionDialog?.hasAttribute("hidden") || !aboutDialog?.hasAttribute("hidden") || !updateDialog?.hasAttribute("hidden")) return;
    void showActiveBrowserTab(false);
  };

  let boundsRefreshTimeout = 0;
  const refreshBrowserTabLayout = () => {
    const refresh = async () => {
      if (document.visibilityState === "hidden" || await appWindow.isMinimized()) return;
      await syncBrowserTabBounds();
      restoreActiveViewAfterDialog();
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => void refresh());
    });
    window.clearTimeout(boundsRefreshTimeout);
    boundsRefreshTimeout = window.setTimeout(() => void refresh(), 120);
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
    restoreActiveViewAfterDialog();
  };

  const closeVersionDialog = async () => {
    if (versionCheckInProgress) return;
    versionDialog?.setAttribute("hidden", "");
    if (versionUpdate) {
      await versionUpdate.close();
      versionUpdate = null;
    }
    restoreActiveViewAfterDialog();
  };

  const showUpdateDialog = (update: Update) => {
    hideViewsForDialog();
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
    hideViewsForDialog();
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
    hideViewsForDialog();
    aboutDialog?.removeAttribute("hidden");
    aboutClose?.focus();
  });

  checkVersionButton?.addEventListener("click", () => void checkVersionStatus());

  aboutClose?.addEventListener("click", () => {
    aboutDialog?.setAttribute("hidden", "");
    restoreActiveViewAfterDialog();
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

  tabStrip?.addEventListener("wheel", (event) => {
    if (event.deltaY !== 0) {
      tabStrip.scrollLeft += event.deltaY;
      event.preventDefault();
    }
  }, { passive: false });

  newTabButton?.addEventListener("click", () => void addTab());
  addressForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void openAddress(addressInput?.value ?? "");
  });
  addressInput?.addEventListener("input", () => {
    addressEditing = true;
  });
  backButton?.addEventListener("click", () => {
    const tab = getActiveTab();
    if (!tab?.hasWebview || tab.historyLength < 2) return;
    tab.historyAction = "back";
    tab.forwardAvailable = true;
    updateNavigationControls();
    void invoke("history_browser_tab", { tabLabel: tab.label, direction: "back" });
  });
  forwardButton?.addEventListener("click", () => {
    const tab = getActiveTab();
    if (!tab?.hasWebview || !tab.forwardAvailable) return;
    tab.historyAction = "forward";
    tab.forwardAvailable = false;
    updateNavigationControls();
    void invoke("history_browser_tab", { tabLabel: tab.label, direction: "forward" });
  });
  reloadButton?.addEventListener("click", () => {
    const tab = getActiveTab();
    if (tab?.hasWebview) void invoke("reload_browser_tab", { tabLabel: tab.label });
  });

  void listen<BrowserPageEvent>("browser-tab-state", ({ payload }) => handleBrowserPageEvent(payload));
  void listen<string>("browser-open-new-tab", async ({ payload }) => {
    await addTab();
    if (addressInput) addressInput.value = payload;
    await openAddress(payload);
  });

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
      restoreActiveViewAfterDialog();
    }
  });

  renderTabs();
  updateNavigationControls();
  void syncMaximizedState();
  void appWindow.onResized(() => {
    void syncMaximizedState();
    refreshBrowserTabLayout();
  });
  void appWindow.onFocusChanged(({ payload: focused }) => {
    if (focused) refreshBrowserTabLayout();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshBrowserTabLayout();
  });
  void getVersion().then((version) => {
    currentVersion = version;
    if (appVersion) appVersion.textContent = `Versão ${version}`;
  });
  void checkForStartupUpdate();
});
