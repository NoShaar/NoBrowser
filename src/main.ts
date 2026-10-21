import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

const appWindow = getCurrentWindow();
const CHECK_TIMEOUT_MS = 8_000;
const HISTORY_STORAGE_KEY = "nobrowser.history.v1";
const SETTINGS_STORAGE_KEY = "nobrowser.settings.v1";
const SESSION_STORAGE_KEY = "nobrowser.session.v1";
const CLOSED_TABS_STORAGE_KEY = "nobrowser.closed-tabs.v1";

type InternalPage = "history" | "settings";

interface HistoryEntry {
  url: string;
  title: string;
  visitedAt: number;
}

interface BrowserSettings {
  reopenPagesOnStartup: boolean;
  suggestFrequentSites: boolean;
}

interface SavedTab {
  url: string;
  title: string;
}

interface SavedSession {
  tabs: SavedTab[];
  activeIndex: number;
}

const readStoredValue = <T>(key: string, fallback: T): T => {
  try {
    const savedValue = localStorage.getItem(key);
    return savedValue ? JSON.parse(savedValue) as T : fallback;
  } catch {
    return fallback;
  }
};

const isHttpAddress = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const isHistoryEntry = (value: unknown): value is HistoryEntry => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HistoryEntry>;
  return typeof entry.url === "string"
    && isHttpAddress(entry.url)
    && typeof entry.title === "string"
    && typeof entry.visitedAt === "number"
    && Number.isFinite(new Date(entry.visitedAt).getTime());
};

const isSavedTab = (value: unknown): value is SavedTab => {
  if (!value || typeof value !== "object") return false;
  const tab = value as Partial<SavedTab>;
  return typeof tab.url === "string" && isHttpAddress(tab.url) && typeof tab.title === "string";
};

interface BrowserTab {
  id: number;
  label: string;
  title: string;
  url: string;
  internalPage: InternalPage | null;
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
  const historyButton = document.querySelector<HTMLButtonElement>("#history-button");
  const settingsButton = document.querySelector<HTMLButtonElement>("#settings-button");
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
  const internalPage = document.querySelector<HTMLElement>("#internal-page");
  const internalPageKicker = document.querySelector<HTMLElement>("#internal-page-kicker");
  const internalPageTitle = document.querySelector<HTMLElement>("#internal-page-title");
  const internalPageDescription = document.querySelector<HTMLElement>("#internal-page-description");
  const internalPageActions = document.querySelector<HTMLElement>("#internal-page-actions");
  const internalPageContent = document.querySelector<HTMLElement>("#internal-page-content");
  const addressSuggestions = document.querySelector<HTMLDataListElement>("#address-suggestions");
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
  const storedHistory = readStoredValue<unknown>(HISTORY_STORAGE_KEY, []);
  let historyEntries: HistoryEntry[] = Array.isArray(storedHistory) ? storedHistory.filter(isHistoryEntry) : [];
  const storedClosedTabs = readStoredValue<unknown>(CLOSED_TABS_STORAGE_KEY, []);
  let closedTabs: SavedTab[] = Array.isArray(storedClosedTabs) ? storedClosedTabs.filter(isSavedTab) : [];
  const savedSettings = readStoredValue<Partial<BrowserSettings> | null>(SETTINGS_STORAGE_KEY, {});
  const loadedSettings = savedSettings && typeof savedSettings === "object" ? savedSettings : {};
  const settings: BrowserSettings = {
    reopenPagesOnStartup: loadedSettings.reopenPagesOnStartup === true,
    suggestFrequentSites: loadedSettings.suggestFrequentSites !== false,
  };
  let sessionRestoreStarted = false;
  let restoringSession = false;
  let tabs: BrowserTab[] = [
    { id: 1, label: "browser-tab-1", title: "Nova guia", url: "", internalPage: null, hasWebview: false, loading: false, historyLength: 0, forwardAvailable: false, historyAction: "" },
  ];

  const syncMaximizedState = async () => {
    const maximized = await appWindow.isMaximized();
    frame?.classList.toggle("is-maximized", maximized);
    document.querySelector<HTMLButtonElement>("#maximize-button")?.setAttribute(
      "aria-label",
      maximized ? "Restaurar janela" : "Maximizar janela",
    );
  };

  const closeMenu = (restoreView = true) => {
    const wasOpen = menu !== null && !menu.hasAttribute("hidden");
    menu?.setAttribute("hidden", "");
    menuButton?.setAttribute("aria-expanded", "false");
    if (wasOpen && restoreView) restoreActiveViewAfterDialog();
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
    const value = tab.internalPage ? `nobrowser://${tab.internalPage}` : tab.url;
    if (addressInput && (force || !addressEditing)) addressInput.value = value;
    addressIndicator?.classList.toggle("is-secure", tab.url.startsWith("https://"));
  };

  const tabDisplayName = (tab: BrowserTab) => {
    if (tab.internalPage === "history") return "Histórico";
    if (tab.internalPage === "settings") return "Configurações";
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
      item.classList.toggle("is-internal", tab.internalPage !== null);

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
    browserMessage?.setAttribute("hidden", "");
    updateAddressBar(tab, true);
    updateNavigationControls();

    if (tab.internalPage) {
      await hideBrowserTabs();
      welcomeScreen?.setAttribute("hidden", "");
      internalPage?.removeAttribute("hidden");
      renderInternalPage(tab.internalPage);
      return;
    }

    internalPage?.setAttribute("hidden", "");
    welcomeScreen?.toggleAttribute("hidden", tab.hasWebview);
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

  const addTab = async (page: InternalPage | null = null) => {
    const id = nextTabId++;
    const title = page === "history" ? "Histórico" : page === "settings" ? "Configurações" : "Nova guia";
    tabs.push({
      id,
      label: `browser-tab-${id}`,
      title,
      url: "",
      internalPage: page,
      hasWebview: false,
      loading: false,
      historyLength: 0,
      forwardAvailable: false,
      historyAction: "",
    });
    await activateTab(id);
    if (!page) addressInput?.focus();
    persistSession();
    return getActiveTab();
  };

  const closeTab = async (id: number) => {
    const closing = tabs.find((tab) => tab.id === id);
    if (!closing) return;
    if (!closing.internalPage && closing.url && isHttpAddress(closing.url)) {
      closedTabs.unshift({ url: closing.url, title: closing.title });
      closedTabs = closedTabs.slice(0, 20);
      persistClosedTabs();
    }
    if (closing.hasWebview) await invoke("close_browser_tab", { tabLabel: closing.label }).catch(() => undefined);
    tabs = tabs.filter((tab) => tab.id !== id);
    if (tabs.length === 0) {
      const newId = nextTabId++;
      tabs.push({
        id: newId,
        label: `browser-tab-${newId}`,
        title: "Nova guia",
        url: "",
        internalPage: null,
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
    persistSession();
  };

  const showBrowserError = (message: string) => {
    if (!browserMessage) return;
    browserMessage.textContent = message;
    browserMessage.removeAttribute("hidden");
  };

  const resolveAddress = (input: string) => {
    const value = input.trim();
    if (!value) return null;
    const search = () => `https://www.google.com/search?q=${encodeURIComponent(value)}`;
    const localAddress = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::|\/|$)/i.test(value);
    const explicitProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value);

    if (!explicitProtocol && /\s/.test(value)) return search();
    if (!explicitProtocol && !localAddress) {
      const hostname = value.split(/[/?#]/, 1)[0].replace(/:\d+$/, "");
      if (!hostname.includes(".") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return search();
    }

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

  const openAddress = async (rawAddress: string, focus = true) => {
    const url = resolveAddress(rawAddress);
    const tab = getActiveTab();
    if (!url || !tab) return;
    closeMenu(false);
    browserMessage?.setAttribute("hidden", "");
    if (tab.internalPage) {
      tab.internalPage = null;
      tab.url = "";
      tab.historyLength = 0;
      tab.hasWebview = false;
      internalPage?.setAttribute("hidden", "");
    }
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
      const hasOpenDialog = [aboutDialog, versionDialog, updateDialog].some((dialog) => dialog && !dialog.hasAttribute("hidden"));
      if (activeTabId === tab.id && !hasOpenDialog && menu?.hasAttribute("hidden")) {
        await invoke("show_browser_tab", { tabLabel: tab.label });
        if (activeTabId === tab.id && focus) await invoke("focus_browser_tab", { tabLabel: tab.label });
        else if (activeTabId !== tab.id) await invoke("hide_browser_tab", { tabLabel: tab.label });
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
    persistSession();
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
    if (event.loading === false && event.url) recordHistoryVisit(event.url, tab.title);
    if (event.title?.trim() && event.url) updateHistoryTitle(event.url, event.title.trim());
    if (tab.id === activeTabId) {
      updateAddressBar(tab);
      updateNavigationControls();
    }
    renderTabs();
    persistSession();
  };

  const writeStoredValue = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  };

  const removeStoredValue = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      return;
    }
  };

  const persistHistory = () => writeStoredValue(HISTORY_STORAGE_KEY, historyEntries);
  const persistClosedTabs = () => writeStoredValue(CLOSED_TABS_STORAGE_KEY, closedTabs);

  const persistSession = () => {
    if (restoringSession) return;
    if (!settings.reopenPagesOnStartup) {
      removeStoredValue(SESSION_STORAGE_KEY);
      return;
    }

    const openSessionTabs = tabs.filter((tab) => !tab.internalPage && tab.url && isHttpAddress(tab.url));
    if (!openSessionTabs.length) {
      removeStoredValue(SESSION_STORAGE_KEY);
      return;
    }
    const activeIndex = Math.max(0, openSessionTabs.findIndex((tab) => tab.id === getActiveTab()?.id));
    const sessionTabs = openSessionTabs.map((tab) => ({ url: tab.url, title: tab.title }));
    writeStoredValue(SESSION_STORAGE_KEY, { tabs: sessionTabs, activeIndex } satisfies SavedSession);
  };

  const saveSettings = () => {
    writeStoredValue(SETTINGS_STORAGE_KEY, settings);
    if (settings.reopenPagesOnStartup) persistSession();
    else removeStoredValue(SESSION_STORAGE_KEY);
    updateAddressSuggestions();
  };

  const updateAddressSuggestions = () => {
    if (!addressSuggestions) return;
    addressSuggestions.replaceChildren();
    if (!settings.suggestFrequentSites) return;

    const query = addressInput?.value.trim().toLocaleLowerCase() ?? "";
    if (!query) return;
    const sites = new Map<string, { origin: string; title: string; visits: number; lastVisited: number }>();

    for (const entry of historyEntries) {
      try {
        const url = new URL(entry.url);
        const host = url.host.toLocaleLowerCase();
        const title = entry.title || host;
        if (!host.includes(query) && !title.toLocaleLowerCase().includes(query)) continue;
        const site = sites.get(host);
        if (site) {
          site.visits += 1;
          if (entry.visitedAt > site.lastVisited) {
            site.lastVisited = entry.visitedAt;
            site.origin = url.origin;
            site.title = title;
          }
        } else {
          sites.set(host, { origin: url.origin, title, visits: 1, lastVisited: entry.visitedAt });
        }
      } catch {
        continue;
      }
    }

    const fragment = document.createDocumentFragment();
    [...sites.entries()]
      .sort((left, right) => right[1].visits - left[1].visits || right[1].lastVisited - left[1].lastVisited)
      .slice(0, 8)
      .forEach(([host, site]) => {
        const option = document.createElement("option");
        option.value = site.origin;
        option.label = `${host} · ${site.visits} visita${site.visits === 1 ? "" : "s"}`;
        option.textContent = site.title;
        fragment.append(option);
      });
    addressSuggestions.replaceChildren(fragment);
  };

  const updateHistoryTitle = (url: string, title: string) => {
    const entry = historyEntries.find((item) => item.url === url);
    if (!entry || entry.title === title) return;
    entry.title = title;
    persistHistory();
    if (getActiveTab()?.internalPage === "history") renderHistoryPage();
  };

  const recordHistoryVisit = (url: string, title: string) => {
    if (!isHttpAddress(url)) return;
    const now = Date.now();
    const previous = historyEntries[0];
    if (previous?.url === url && now - previous.visitedAt < 10_000) {
      previous.visitedAt = now;
      if (title && title !== "Carregando…") previous.title = title;
    } else {
      historyEntries.unshift({ url, title: title || url, visitedAt: now });
      historyEntries = historyEntries.slice(0, 1000);
    }
    persistHistory();
    updateAddressSuggestions();
    if (getActiveTab()?.internalPage === "history") renderHistoryPage();
  };

  const createActionButton = (label: string, action: () => void, className = "") => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener("click", action);
    return button;
  };

  const clearHistory = () => {
    historyEntries = [];
    removeStoredValue(HISTORY_STORAGE_KEY);
    updateAddressSuggestions();
    if (getActiveTab()?.internalPage === "history") renderHistoryPage();
  };

  const renderHistoryPage = (filter = "") => {
    if (!internalPageActions || !internalPageContent) return;
    const clearButton = createActionButton("Limpar histórico", clearHistory, "internal-danger-button");
    clearButton.disabled = historyEntries.length === 0;
    internalPageActions.replaceChildren(clearButton);
    internalPageContent.replaceChildren();

    const filterInput = document.createElement("input");
    filterInput.className = "history-filter";
    filterInput.type = "search";
    filterInput.placeholder = "Filtrar por site ou título";
    filterInput.setAttribute("aria-label", "Filtrar histórico");
    filterInput.value = filter;
    internalPageContent.append(filterInput);

    const list = document.createElement("ul");
    list.className = "history-list";
    const renderEntries = () => {
      list.replaceChildren();
      const query = filterInput.value.trim().toLocaleLowerCase();
      const matches = historyEntries.filter((entry) => {
        const text = `${entry.title} ${entry.url}`.toLocaleLowerCase();
        return !query || text.includes(query);
      });
      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "internal-empty-state";
        empty.textContent = historyEntries.length ? "Nenhum item corresponde a esse filtro." : "Seu histórico está vazio. Os sites visitados aparecerão aqui e poderão ser sugeridos na barra de endereço.";
        list.append(empty);
        return;
      }

      for (const entry of matches) {
        const row = document.createElement("li");
        row.className = "history-entry";
        const openButton = document.createElement("button");
        openButton.className = "history-entry-open";
        openButton.type = "button";
        openButton.title = "Abrir este site";
        const title = document.createElement("span");
        title.className = "history-entry-title";
        title.textContent = entry.title || entry.url;
        const url = document.createElement("span");
        url.className = "history-entry-url";
        url.textContent = entry.url;
        openButton.append(title, url);
        openButton.addEventListener("click", () => void openAddress(entry.url));

        const time = document.createElement("time");
        time.className = "history-entry-time";
        time.dateTime = new Date(entry.visitedAt).toISOString();
        time.textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(entry.visitedAt);

        const removeButton = createActionButton("×", () => {
          const index = historyEntries.indexOf(entry);
          if (index !== -1) historyEntries.splice(index, 1);
          persistHistory();
          updateAddressSuggestions();
          renderHistoryPage(filterInput.value);
        }, "history-entry-remove");
        removeButton.setAttribute("aria-label", `Remover ${entry.title || entry.url} do histórico`);
        row.append(openButton, time, removeButton);
        list.append(row);
      }
    };
    filterInput.addEventListener("input", renderEntries);
    internalPageContent.append(list);
    renderEntries();
  };

  const renderSettingsPage = () => {
    if (!internalPageActions || !internalPageContent) return;
    internalPageActions.replaceChildren();
    internalPageContent.replaceChildren();

    const addSection = (title: string) => {
      const section = document.createElement("section");
      section.className = "settings-section";
      const heading = document.createElement("h2");
      heading.textContent = title;
      section.append(heading);
      internalPageContent?.append(section);
      return section;
    };

    const addToggle = (section: HTMLElement, title: string, description: string, value: boolean, update: (checked: boolean) => void) => {
      const row = document.createElement("label");
      row.className = "setting-row";
      const copy = document.createElement("span");
      copy.className = "setting-copy";
      const strong = document.createElement("strong");
      strong.textContent = title;
      const detail = document.createElement("span");
      detail.textContent = description;
      copy.append(strong, detail);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = value;
      checkbox.addEventListener("change", () => update(checkbox.checked));
      row.append(copy, checkbox);
      section.append(row);
    };

    const startup = addSection("Inicialização");
    addToggle(startup, "Reabrir páginas ao iniciar", "Restaura as páginas abertas quando o NoBrowser é iniciado novamente.", settings.reopenPagesOnStartup, (checked) => {
      settings.reopenPagesOnStartup = checked;
      saveSettings();
    });

    const utilities = addSection("Utilidades");
    addToggle(utilities, "Sugerir sites mais visitados", "As sugestões vêm apenas dos sites que continuam no histórico. Remover um item também o tira das sugestões.", settings.suggestFrequentSites, (checked) => {
      settings.suggestFrequentSites = checked;
      saveSettings();
    });
    utilities.append(createActionButton("Apagar todo o histórico", clearHistory, "internal-danger-button"));

    const shortcuts = addSection("Atalhos");
    const shortcutList = document.createElement("dl");
    shortcutList.className = "shortcut-list";
    const shortcutsToShow = [
      ["Nova aba", "Ctrl + T"],
      ["Reabrir última aba fechada", "Ctrl + Alt + T"],
      ["Selecionar barra de endereço", "Ctrl + L"],
      ["Fechar aba atual", "Ctrl + W"],
      ["Recarregar página", "Ctrl + R"],
      ["Voltar / avançar", "Alt + ← / →"],
    ];
    for (const [description, shortcut] of shortcutsToShow) {
      const item = document.createElement("div");
      const label = document.createElement("dt");
      label.textContent = description;
      const keys = document.createElement("dd");
      const key = document.createElement("kbd");
      key.textContent = shortcut;
      keys.append(key);
      item.append(label, keys);
      shortcutList.append(item);
    }
    shortcuts.append(shortcutList);
  };

  const renderInternalPage = (page: InternalPage) => {
    if (!internalPageKicker || !internalPageTitle || !internalPageDescription) return;
    if (page === "history") {
      internalPageKicker.textContent = "SUA NAVEGAÇÃO";
      internalPageTitle.textContent = "Histórico";
      internalPageDescription.textContent = "Os sites visitados ficam aqui. Remover um item também tira esse site das sugestões de endereço.";
      renderHistoryPage();
    } else {
      internalPageKicker.textContent = "NO SEU PRÓPRIO FLUXO";
      internalPageTitle.textContent = "Configurações";
      internalPageDescription.textContent = "Escolha como o NoBrowser guarda e sugere seus sites.";
      renderSettingsPage();
    }
  };

  const restoreSavedSession = async () => {
    if (sessionRestoreStarted) return;
    sessionRestoreStarted = true;
    if (!settings.reopenPagesOnStartup) return;

    const storedSession = readStoredValue<unknown>(SESSION_STORAGE_KEY, {});
    const savedSession = storedSession && typeof storedSession === "object" ? storedSession as Partial<SavedSession> : {};
    const savedTabs = Array.isArray(savedSession.tabs)
      ? savedSession.tabs.filter(isSavedTab)
      : [];
    if (!savedTabs.length) return;

    restoringSession = true;
    const restoredTabs = savedTabs.map((savedTab) => {
      const id = nextTabId++;
      return {
        id,
        label: `browser-tab-${id}`,
        title: savedTab.title || "Carregando…",
        url: "",
        internalPage: null,
        hasWebview: false,
        loading: false,
        historyLength: 0,
        forwardAvailable: false,
        historyAction: "" as const,
      } satisfies BrowserTab;
    });
    tabs = restoredTabs;
    const requestedIndex = Number.isInteger(savedSession.activeIndex) ? savedSession.activeIndex as number : 0;
    const activeIndex = Math.min(Math.max(0, requestedIndex), restoredTabs.length - 1);
    activeTabId = restoredTabs[activeIndex].id;
    renderTabs();
    updateNavigationControls();

    for (let index = 0; index < restoredTabs.length; index += 1) {
      await hideBrowserTabs();
      activeTabId = restoredTabs[index].id;
      renderTabs();
      await openAddress(savedTabs[index].url, false);
    }
    activeTabId = restoredTabs[activeIndex].id;
    renderTabs();
    restoringSession = false;
    await showActiveBrowserTab(false);
    persistSession();
  };

  const openInternalPage = async (page: InternalPage) => {
    closeMenu(false);
    await addTab(page);
  };

  const reopenLastClosedTab = async () => {
    const lastClosedTab = closedTabs.shift();
    if (!lastClosedTab) return;
    persistClosedTabs();
    await addTab();
    await openAddress(lastClosedTab.url);
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
    if (!versionDialog?.hasAttribute("hidden") || !aboutDialog?.hasAttribute("hidden") || !updateDialog?.hasAttribute("hidden") || !menu?.hasAttribute("hidden")) return;
    if (!sessionRestoreStarted) {
      void restoreSavedSession();
      return;
    }
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
    else restoreActiveViewAfterDialog();
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
    closeMenu(false);
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

  menuButton?.addEventListener("click", async () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    if (isOpen) {
      closeMenu();
    } else {
      await hideBrowserTabs();
      menuButton.setAttribute("aria-expanded", "true");
      menu?.removeAttribute("hidden");
    }
  });

  historyButton?.addEventListener("click", () => void openInternalPage("history"));
  settingsButton?.addEventListener("click", () => void openInternalPage("settings"));

  aboutButton?.addEventListener("click", () => {
    closeMenu(false);
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
    updateAddressSuggestions();
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
      return;
    }

    const key = event.key.toLocaleLowerCase();
    const dialogOpen = [aboutDialog, versionDialog, updateDialog].some((dialog) => dialog && !dialog.hasAttribute("hidden"));
    if (dialogOpen) return;

    if (event.ctrlKey && event.altKey && key === "t") {
      event.preventDefault();
      closeMenu(false);
      void reopenLastClosedTab();
    } else if (event.ctrlKey && !event.altKey && key === "t") {
      event.preventDefault();
      closeMenu(false);
      void addTab();
    } else if (event.ctrlKey && key === "l") {
      event.preventDefault();
      closeMenu(false);
      addressInput?.focus();
      addressInput?.select();
    } else if (event.ctrlKey && key === "w") {
      event.preventDefault();
      closeMenu(false);
      void closeTab(activeTabId);
    } else if (event.ctrlKey && key === "r") {
      event.preventDefault();
      const tab = getActiveTab();
      if (tab?.hasWebview) void invoke("reload_browser_tab", { tabLabel: tab.label });
    } else if (event.altKey && key === "arrowleft") {
      event.preventDefault();
      backButton?.click();
    } else if (event.altKey && key === "arrowright") {
      event.preventDefault();
      forwardButton?.click();
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
